import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

type SubmitSignedAckRequest = {
  token?: unknown;
  danaReference?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  documentNumber?: unknown;
  invoiceUrl?: unknown;
  signedAt?: unknown;
  signatureDataUrl?: unknown;
  signedPdfBase64?: unknown;
};

type SignedAckStatus = {
  ackId: string;
  documentNumber: string;
  signerName: string;
  signedAt: string;
  confirmationCode: string;
  invoiceUrl: string;
  ackUrl: string;
  signatureUrl: string;
  status: 'Acuse firmado';
};

const requiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const optionalEnv = (name: string) => process.env[name]?.trim() || '';

const bucketName = requiredEnv('ACK_BUCKET_NAME');
const bucketRegion = requiredEnv('ACK_BUCKET_REGION');
const allowedOrigin = requiredEnv('ALLOWED_ORIGIN');
const danaBaseUrl = optionalEnv('DANA_BASE_URL');
const danaTriggerUrl = optionalEnv('DANA_TRIGGER_URL');
const danaUsername = optionalEnv('DANA_USERNAME');
const danaPassword = optionalEnv('DANA_PASSWORD');

const s3Client = new S3Client({ region: bucketRegion });

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Content-Type': 'application/json'
};

const jsonResponse = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body)
});

const emptyResponse = (statusCode: number): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: corsHeaders
});

const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const getRequiredString = (
  payload: SubmitSignedAckRequest,
  fieldName:
    | 'token'
    | 'customerEmail'
    | 'customerName'
    | 'documentNumber'
    | 'invoiceUrl'
    | 'signedAt'
    | 'signatureDataUrl'
    | 'signedPdfBase64'
) => {
  const value = payload[fieldName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required field: ${fieldName}`);
  }

  return value.trim();
};

const optionalString = (payload: SubmitSignedAckRequest, fieldName: keyof SubmitSignedAckRequest) => {
  const value = payload[fieldName];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

const sanitizeToken = (token: string) => token.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 120);

const decodeSignaturePng = (dataUrl: string) => {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/i);

  if (!match) {
    throw new Error('signatureDataUrl must be a PNG data URL.');
  }

  return Buffer.from(match[1], 'base64');
};

const decodeSignedPdf = (signedPdfBase64: string) => {
  const normalized = signedPdfBase64
    .replace(/^data:application\/pdf;base64,/i, '')
    .replace(/\s/g, '');

  return Buffer.from(normalized, 'base64');
};

const ensureNonEmptyBuffer = (buffer: Buffer, fieldName: string) => {
  if (buffer.byteLength === 0) {
    throw new Error(`${fieldName} could not be decoded.`);
  }
};

const ensurePngSignature = (buffer: Buffer) => {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47];

  if (!pngSignature.every((byte, index) => buffer[index] === byte)) {
    throw new Error('signatureDataUrl is not a valid PNG image.');
  }
};

const ensurePdfSignature = (buffer: Buffer) => {
  if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') {
    throw new Error('signedPdfBase64 is not a valid PDF file.');
  }
};

const buildObjectUrl = (key: string) => {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const host =
    bucketRegion === 'us-east-1'
      ? `${bucketName}.s3.amazonaws.com`
      : `${bucketName}.s3.${bucketRegion}.amazonaws.com`;

  return `https://${host}/${encodedKey}`;
};

const buildDanaAuthorizationHeader = () => {
  if (!danaUsername || !danaPassword) {
    throw new Error('Dana credentials are not configured.');
  }

  return `Basic ${Buffer.from(`${danaUsername}:${danaPassword}`).toString('base64')}`;
};

const fetchDanaCase = async (dana: string) => {
  if (!danaBaseUrl) {
    throw new Error('Dana base URL is not configured.');
  }

  const authorizationHeader = buildDanaAuthorizationHeader();
  const response = await fetch(`${danaBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(dana)}`, {
    method: 'GET',
    headers: {
      Authorization: authorizationHeader,
      accept: 'application/json',
      'user-agent': 'SL-AcuseRecibo/1.0'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Dana lookup failed with status ${response.status}.`);
  }

  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Dana lookup returned invalid JSON.');
  }

  return parsed;
};

const triggerDanaCase = async (dana: string, payload: Record<string, string>) => {
  if (!danaTriggerUrl || !danaUsername || !danaPassword) {
    return;
  }

  const authorizationHeader = buildDanaAuthorizationHeader();
  const triggerUrl = new URL(danaTriggerUrl);
  triggerUrl.searchParams.set('dana', dana);

  Object.entries(payload).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    triggerUrl.searchParams.set(key.toUpperCase(), value);
  });

  const response = await fetch(triggerUrl, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader,
      accept: 'application/json',
      'user-agent': 'SL-AcuseRecibo/1.0',
      'content-length': '0'
    }
  });

  if (!response.ok) {
    throw new Error(`Dana trigger failed with status ${response.status}.`);
  }
};

const readSignedStatus = async (token: string) => {
  const latestKey = `acks/${sanitizeToken(token)}/latest.json`;
  const object = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: latestKey
    })
  );

  if (!object.Body) {
    throw new Error('Signed ack not found.');
  }

  const body = await streamToBuffer(object.Body as NodeJS.ReadableStream);

  return JSON.parse(body.toString('utf8')) as SignedAckStatus;
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;

  if (method === 'OPTIONS') {
    return emptyResponse(204);
  }

  if (method === 'GET') {
    try {
      const dana = event.queryStringParameters?.dana?.trim();
      const selector = event.queryStringParameters?.s?.trim();
      const token = event.queryStringParameters?.token?.trim();

      if (dana && (!selector || selector === 'n')) {
        const danaData = await fetchDanaCase(dana);
        const requestId =
          typeof danaData.requestID === 'string' && danaData.requestID.trim()
            ? danaData.requestID.trim()
            : dana;

        let signedStatus: SignedAckStatus | null = null;

        try {
          signedStatus = await readSignedStatus(requestId);
        } catch {
          signedStatus = null;
        }

        return jsonResponse(200, {
          success: true,
          data: {
            dana,
            ackId: requestId,
            signedStatus,
            record: typeof danaData.record === 'object' && danaData.record ? danaData.record : {}
          }
        });
      }

      if (!token) {
        return jsonResponse(400, {
          success: false,
          message: 'Missing required query param: token'
        });
      }

      const data = await readSignedStatus(token);

      return jsonResponse(200, {
        success: true,
        data
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error.';
      const statusCode = message.includes('NoSuchKey') || message.includes('not found') ? 404 : 500;

      return jsonResponse(statusCode, {
        success: false,
        message: statusCode === 404 ? 'Signed ack not found.' : message
      });
    }
  }

  if (method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      message: 'Method not allowed.'
    });
  }

  try {
    const payload = JSON.parse(event.body ?? '{}') as SubmitSignedAckRequest;
    const token = sanitizeToken(getRequiredString(payload, 'token'));
    const danaReference = optionalString(payload, 'danaReference');
    const customerEmail = getRequiredString(payload, 'customerEmail');
    const customerName = getRequiredString(payload, 'customerName');
    const documentNumber = getRequiredString(payload, 'documentNumber');
    const invoiceUrl = getRequiredString(payload, 'invoiceUrl');
    const signedAt = getRequiredString(payload, 'signedAt');
    const signatureDataUrl = getRequiredString(payload, 'signatureDataUrl');
    const signedPdfBase64 = getRequiredString(payload, 'signedPdfBase64');

    const signatureBuffer = decodeSignaturePng(signatureDataUrl);
    const pdfBuffer = decodeSignedPdf(signedPdfBase64);

    ensureNonEmptyBuffer(signatureBuffer, 'signatureDataUrl');
    ensureNonEmptyBuffer(pdfBuffer, 'signedPdfBase64');
    ensurePngSignature(signatureBuffer);
    ensurePdfSignature(pdfBuffer);

    const uploadId = randomUUID();
    const confirmationCode = `ACK-${uploadId.slice(0, 8).toUpperCase()}`;
    const baseKey = `acks/${token}/${uploadId}`;
    const signatureKey = `${baseKey}/signature.png`;
    const ackKey = `${baseKey}/acuse-firmado.pdf`;
    const signedStatus: SignedAckStatus = {
      ackId: token,
      documentNumber,
      signerName: customerName,
      signedAt,
      confirmationCode,
      invoiceUrl,
      ackUrl: buildObjectUrl(ackKey),
      signatureUrl: buildObjectUrl(signatureKey),
      status: 'Acuse firmado'
    };

    await Promise.all([
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: signatureKey,
          Body: signatureBuffer,
          ContentType: 'image/png',
          Metadata: {
            signedat: signedAt
          }
        })
      ),
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: ackKey,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
          Metadata: {
            signedat: signedAt
          }
        })
      ),
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: `acks/${token}/latest.json`,
          Body: JSON.stringify(signedStatus),
          ContentType: 'application/json'
        })
      )
    ]);

    if (danaReference) {
      await triggerDanaCase(danaReference, {
        customeremail: customerEmail,
        customername: customerName,
        documentnumber: documentNumber,
        signedat: signedAt,
        confirmationcode: confirmationCode,
        ackurl: signedStatus.ackUrl,
        signatureurl: signedStatus.signatureUrl,
        invoiceurl: invoiceUrl,
        status: signedStatus.status
      });
    }

    return jsonResponse(200, {
      success: true,
      status: 'SIGNED',
      ackUrl: signedStatus.ackUrl,
      signatureUrl: signedStatus.signatureUrl,
      invoiceUrl,
      confirmationCode
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const statusCode =
      error instanceof SyntaxError ||
      message.startsWith('Missing required field:') ||
      message.startsWith('Missing required query param:') ||
      message.includes('must be a PNG data URL') ||
      message.endsWith('could not be decoded.') ||
      message.includes('not a valid PNG image') ||
      message.includes('not a valid PDF file')
        ? 400
        : 500;

    return jsonResponse(statusCode, {
      success: false,
      message
    });
  }
};
