import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendRawEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

type SubmitSignedAckRequest = {
  token?: unknown;
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

const bucketName = requiredEnv('ACK_BUCKET_NAME');
const bucketRegion = requiredEnv('ACK_BUCKET_REGION');
const allowedOrigin = requiredEnv('ALLOWED_ORIGIN');
const fromEmail = requiredEnv('FROM_EMAIL');
const portalBaseUrl = requiredEnv('PORTAL_BASE_URL');

const s3Client = new S3Client({ region: bucketRegion });
const sesClient = new SESClient({ region: bucketRegion });

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

const sendSignedAckEmail = async (params: {
  toEmail: string;
  customerName: string;
  documentNumber: string;
  token: string;
  signedAt: string;
  ackPdfBuffer: Buffer;
}) => {
  const boundary = `NextPart_${randomUUID()}`;
  const portalLink = `${portalBaseUrl.replace(/\/$/, '')}/?token=${encodeURIComponent(params.token)}`;
  const attachmentBase64 = params.ackPdfBuffer.toString('base64').replace(/(.{76})/g, '$1\n');
  const subject = `Acuse firmado - Factura ${params.documentNumber}`;
  const textBody = [
    `Hola ${params.customerName},`,
    '',
    `Tu acuse de recibo de la factura ${params.documentNumber} fue firmado el ${params.signedAt}.`,
    '',
    'Adjuntamos el acuse firmado en PDF.',
    `Tambien puedes volver al portal aqui: ${portalLink}`,
    '',
    'Equipo Soluciones Laser'
  ].join('\n');

  const rawMessage = [
    `From: ${fromEmail}`,
    `To: ${params.toEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: application/pdf; name="acuse-firmado.pdf"',
    'Content-Description: acuse-firmado.pdf',
    `Content-Disposition: attachment; filename="acuse-firmado.pdf"; size=${params.ackPdfBuffer.byteLength};`,
    'Content-Transfer-Encoding: base64',
    '',
    attachmentBase64,
    '',
    `--${boundary}--`
  ].join('\n');

  await sesClient.send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage)
      }
    })
  );
};

const readSignedStatus = async (token: string) => {
  const latestKey = `acks/${token}/latest.json`;

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
  const path = event.requestContext.http.path || event.rawPath;

  if (method === 'OPTIONS') {
    return emptyResponse(204);
  }

  if (method === 'GET' && path.endsWith('/ack-status')) {
    try {
      const token = event.queryStringParameters?.token?.trim();

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
    const token = getRequiredString(payload, 'token');
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

    await sendSignedAckEmail({
      toEmail: customerEmail,
      customerName,
      documentNumber,
      token,
      signedAt,
      ackPdfBuffer: pdfBuffer
    });

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
