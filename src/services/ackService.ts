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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildCode = () => `ACK-${Date.now().toString().slice(-8)}`;
const buildShortCode = () => `ACK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const formatTimestamp = (date: Date) => formatDateTime(date);

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
    await delay(900);
    validateSignaturePayload(payload);

    if (!payload.accepted) {
      throw new Error('El acuse debe estar aceptado para su registro.');
    }

    const confirmationCode = buildCode();
    latestConfirmation = {
      ...initialConfirmationMock,
      ackId: payload.ackId,
      documentNumber: pendingAckMock.documentNumber,
      signerName: payload.signerName.trim(),
      signedAt: payload.signedAt || formatTimestamp(new Date()),
      confirmationCode: payload.confirmationCode || confirmationCode,
      status: 'Acuse firmado'
    };

    return { confirmationCode: payload.confirmationCode || confirmationCode };
  },

  getLastConfirmation(): AckConfirmationSummary | null {
    return latestConfirmation;
  }
};
