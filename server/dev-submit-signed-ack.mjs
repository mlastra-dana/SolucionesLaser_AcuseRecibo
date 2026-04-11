import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';

const port = Number(process.env.PORT || 5174);
const host = '0.0.0.0';
const origin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const invoicePath = path.resolve(process.cwd(), 'public/mock/acuse-base.pdf');
const storageRoot = path.join(tmpdir(), 'solucioneslaser-acuse-dev');

const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
};

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    ...corsHeaders,
    'Content-Type': 'application/json'
  });
  response.end(JSON.stringify(body));
};

const sendEmpty = (response, statusCode) => {
  response.writeHead(statusCode, corsHeaders);
  response.end();
};

const decodeDataUrl = (value, prefixPattern, fieldName) => {
  const match = value.match(prefixPattern);

  if (!match) {
    throw new Error(`${fieldName} no tiene un formato valido.`);
  }

  const buffer = Buffer.from(match[1], 'base64');

  if (!buffer.byteLength) {
    throw new Error(`${fieldName} no pudo decodificarse.`);
  }

  return buffer;
};

const readRequestBody = async (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });

const getContentType = (filePath) => {
  if (filePath.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (filePath.endsWith('.png')) {
    return 'image/png';
  }

  return 'application/octet-stream';
};

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { success: false, message: 'URL invalida.' });
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'OPTIONS') {
      sendEmpty(response, 204);
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname.startsWith('/files/')) {
      const filePath = path.join(storageRoot, requestUrl.pathname.replace(/^\/files\//, ''));
      const fileInfo = await stat(filePath);

      response.writeHead(200, {
        ...corsHeaders,
        'Content-Type': getContentType(filePath),
        'Content-Length': fileInfo.size
      });
      createReadStream(filePath).pipe(response);
      return;
    }

    if (
      request.method === 'GET' &&
      (requestUrl.pathname === '/ack-status' || requestUrl.pathname === '/submit-signed-ack')
    ) {
      const dana = requestUrl.searchParams.get('dana')?.trim();

      if (dana) {
        const stableAckId = `REQ-${dana.slice(0, 24).replace(/[^a-zA-Z0-9-_]/g, '_')}`;
        const latestFile = path.join(storageRoot, stableAckId, 'latest.json');

        try {
          const latestContent = await readFile(latestFile, 'utf8');
          sendJson(response, 200, {
            success: true,
            data: {
              dana,
              ackId: stableAckId,
              signedStatus: JSON.parse(latestContent),
              record: {
                requestID: stableAckId
              }
            }
          });
        } catch {
          sendJson(response, 200, {
            success: true,
            data: {
              dana,
              ackId: stableAckId,
              signedStatus: null,
              record: {
                requestID: stableAckId
              }
            }
          });
        }

        return;
      }

      const token = requestUrl.searchParams.get('token')?.trim();

      if (!token) {
        sendJson(response, 400, { success: false, message: 'Missing required query param: token' });
        return;
      }

      const latestFile = path.join(storageRoot, token, 'latest.json');

      try {
        const latestContent = await readFile(latestFile, 'utf8');
        sendJson(response, 200, {
          success: true,
          data: JSON.parse(latestContent)
        });
      } catch {
        sendJson(response, 404, { success: false, message: 'Signed ack not found.' });
      }

      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/submit-signed-ack') {
      const rawBody = await readRequestBody(request);
      const payload = JSON.parse(rawBody || '{}');

      const token = typeof payload.token === 'string' && payload.token.trim() ? payload.token.trim() : null;
      const signedAt =
        typeof payload.signedAt === 'string' && payload.signedAt.trim() ? payload.signedAt.trim() : null;
      const signatureDataUrl =
        typeof payload.signatureDataUrl === 'string' && payload.signatureDataUrl.trim()
          ? payload.signatureDataUrl.trim()
          : null;
      const signedPdfBase64 =
        typeof payload.signedPdfBase64 === 'string' && payload.signedPdfBase64.trim()
          ? payload.signedPdfBase64.trim()
          : null;
      const invoiceUrl =
        typeof payload.invoiceUrl === 'string' && payload.invoiceUrl.trim() ? payload.invoiceUrl.trim() : null;
      const danaReference =
        typeof payload.danaReference === 'string' && payload.danaReference.trim() ? payload.danaReference.trim() : '';

      if (!token || !signedAt || !signatureDataUrl || !signedPdfBase64 || !invoiceUrl) {
        sendJson(response, 400, {
          success: false,
          message: 'Faltan datos requeridos para registrar el acuse.'
        });
        return;
      }

      const signatureBuffer = decodeDataUrl(
        signatureDataUrl,
        /^data:image\/png;base64,(.+)$/i,
        'signatureDataUrl'
      );
      const pdfBuffer = decodeDataUrl(
        signedPdfBase64,
        /^(?:data:application\/pdf;base64,)?(.+)$/i,
        'signedPdfBase64'
      );

      const uploadId = randomUUID();
      const relativeDir = path.join(token, uploadId);
      const outputDir = path.join(storageRoot, relativeDir);
      const tokenDir = path.join(storageRoot, token);
      const signatureFile = path.join(outputDir, 'signature.png');
      const ackFile = path.join(outputDir, 'acuse-firmado.pdf');
      const invoiceFile = path.join(outputDir, 'factura-base.pdf');
      const isRemoteInvoice = /^https?:\/\//i.test(invoiceUrl);
      const isLocalAssetInvoice = invoiceUrl.startsWith('/');

      await mkdir(outputDir, { recursive: true });
      await mkdir(tokenDir, { recursive: true });
      await Promise.all([
        writeFile(signatureFile, signatureBuffer),
        writeFile(ackFile, pdfBuffer),
        isRemoteInvoice || isLocalAssetInvoice
          ? Promise.resolve()
          : readFile(invoicePath).then((invoiceBuffer) => writeFile(invoiceFile, invoiceBuffer))
      ]);

      const baseUrl = `http://localhost:${port}/files/${relativeDir}`;
      const resolvedInvoiceUrl = isRemoteInvoice || isLocalAssetInvoice ? invoiceUrl : `${baseUrl}/factura-base.pdf`;
      const confirmationCode = `ACK-${uploadId.slice(0, 8).toUpperCase()}`;
      const signedStatus = {
        ackId: token,
        documentNumber: payload.documentNumber || '',
        signerName: payload.customerName || '',
        signedAt,
        confirmationCode,
        invoiceUrl: resolvedInvoiceUrl,
        ackUrl: `${baseUrl}/acuse-firmado.pdf`,
        signatureUrl: `${baseUrl}/signature.png`,
        status: 'Acuse firmado'
      };

      await writeFile(path.join(tokenDir, 'latest.json'), JSON.stringify(signedStatus, null, 2));

      if (danaReference) {
        const stableAckId = `REQ-${danaReference.slice(0, 24).replace(/[^a-zA-Z0-9-_]/g, '_')}`;
        await mkdir(path.join(storageRoot, stableAckId), { recursive: true });
        await writeFile(path.join(storageRoot, stableAckId, 'latest.json'), JSON.stringify(signedStatus, null, 2));
      }

      sendJson(response, 200, {
        success: true,
        status: 'SIGNED',
        ackUrl: signedStatus.ackUrl,
        signatureUrl: signedStatus.signatureUrl,
        invoiceUrl: resolvedInvoiceUrl,
        confirmationCode
      });
      return;
    }

    sendJson(response, 404, { success: false, message: 'Ruta no encontrada.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    sendJson(response, 500, { success: false, message });
  }
});

server.listen(port, host, () => {
  console.log(`Dev submit-signed-ack server listening on http://localhost:${port}`);
});
