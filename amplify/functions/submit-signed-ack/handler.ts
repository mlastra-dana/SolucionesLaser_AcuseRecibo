import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

type SubmitSignedAckRequest = {
  token?: unknown;
  customerEmail?: unknown;
  customerName?: unknown;
  documentNumber?: unknown;
  signedAt?: unknown;
  signatureDataUrl?: unknown;
  signedPdfBase64?: unknown;
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
const invoiceUrl = requiredEnv('INVOICE_URL');

const s3Client = new S3Client({ region: bucketRegion });

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
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

const getRequiredString = (
  payload: SubmitSignedAckRequest,
  fieldName: 'token' | 'signedAt' | 'signatureDataUrl' | 'signedPdfBase64'
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

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return emptyResponse(204);
  }

  if (event.requestContext.http.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      message: 'Method not allowed.'
    });
  }

  try {
    const payload = JSON.parse(event.body ?? '{}') as SubmitSignedAckRequest;
    const token = getRequiredString(payload, 'token');
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
    const baseKey = `acks/${token}/${uploadId}`;
    const signatureKey = `${baseKey}/signature.png`;
    const ackKey = `${baseKey}/acuse-firmado.pdf`;

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
      )
    ]);

    return jsonResponse(200, {
      success: true,
      status: 'SIGNED',
      ackUrl: buildObjectUrl(ackKey),
      signatureUrl: buildObjectUrl(signatureKey),
      invoiceUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const statusCode =
      error instanceof SyntaxError ||
      message.startsWith('Missing required field:') ||
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
