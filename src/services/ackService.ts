import { initialConfirmationMock, pendingAckMock } from '../mocks/ackMock';
import {
  AckConfirmationSummary,
  PendingAck,
  SignedPreviewPayload,
  SignedPreviewResult,
  SignedAckPayload,
  SubmitSignedAckResponse
} from '../types/ack';
import { formatDateTime } from '../utils/format';
import { signAckPdf } from './pdfSigningService';

let latestConfirmation: AckConfirmationSummary | null = null;

const SUBMIT_SIGNED_ACK_URL = import.meta.env.VITE_SUBMIT_SIGNED_ACK_URL;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildCode = () => `ACK-${Date.now().toString().slice(-8)}`;
const buildShortCode = () => `ACK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const formatTimestamp = (date: Date) => formatDateTime(date);

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const validateSignaturePayload = (payload: Pick<SignedAckPayload, 'signerName' | 'signatureDataUrl'>) => {
  if (!payload.signerName || payload.signerName.trim().length < 3) {
    throw new Error('El nombre del firmante no es válido.');
  }

  if (!payload.signatureDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('La firma debe enviarse en formato PNG base64.');
  }
};

export const ackService = {
  async getPendingAck(): Promise<PendingAck> {
    await delay(400);
    return pendingAckMock;
  },

  async generateSignedPreview(payload: SignedPreviewPayload): Promise<SignedPreviewResult> {
    await delay(500);

    const signedAt = payload.signedAt || formatTimestamp(new Date());
    const signatureCode = buildShortCode();
    const signedPdfBytes = await signAckPdf({
      ackId: payload.ackId,
      pdfBytes: payload.pdfBytes,
      signerName: payload.signerName,
      signatureDataUrl: payload.signatureDataUrl,
      signedAt,
      confirmationCode: signatureCode
    });

    return {
      signedPdfBytes,
      signedAt,
      signatureCode,
      status: 'Documento firmado'
    };
  },

  async submitSignedAck(payload: SignedAckPayload): Promise<SubmitSignedAckResponse> {
    if (!SUBMIT_SIGNED_ACK_URL) {
      throw new Error('No se ha configurado VITE_SUBMIT_SIGNED_ACK_URL.');
    }

    validateSignaturePayload(payload);

    if (!payload.accepted) {
      throw new Error('El acuse debe estar aceptado para su registro.');
    }

    const confirmationCode = payload.confirmationCode || buildCode();
    const signedAt = payload.signedAt || formatTimestamp(new Date());
    const response = await fetch(SUBMIT_SIGNED_ACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: payload.ackId,
        customerEmail: payload.customerEmail,
        customerName: payload.customerName || payload.signerName.trim(),
        documentNumber: payload.documentNumber,
        invoiceUrl: payload.invoiceUrl,
        signedAt,
        signatureDataUrl: payload.signatureDataUrl,
        signedPdfBase64: toBase64(payload.signedPdfBytes)
      })
    });

    const result = (await response.json()) as {
      success?: boolean;
      message?: string;
      ackUrl?: string;
      signatureUrl?: string;
      invoiceUrl?: string;
    };

    if (!response.ok || !result.success || !result.invoiceUrl || !result.ackUrl || !result.signatureUrl) {
      throw new Error(result.message || 'No fue posible registrar el acuse firmado.');
    }

    latestConfirmation = {
      ...initialConfirmationMock,
      ackId: payload.ackId,
      documentNumber: payload.documentNumber || pendingAckMock.documentNumber,
      signerName: payload.signerName.trim(),
      signedAt,
      confirmationCode,
      invoiceUrl: result.invoiceUrl,
      status: 'Acuse firmado'
    };

    return {
      confirmationCode,
      invoiceUrl: result.invoiceUrl,
      ackUrl: result.ackUrl,
      signatureUrl: result.signatureUrl
    };
  },

  getLastConfirmation(): AckConfirmationSummary | null {
    return latestConfirmation;
  }
};
