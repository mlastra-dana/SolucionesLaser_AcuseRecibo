export interface PendingAck {
  ackId: string;
  clientName: string;
  signerName: string;
  identification: string;
  email: string;
  documentNumber: string;
  issueDate: string;
  basePdfUrl: string;
}

export interface SignedAckPayload {
  ackId: string;
  signerName: string;
  accepted: boolean;
  signatureDataUrl: string;
  signedAt: string;
  confirmationCode: string;
}

export interface SignAckPdfRequest {
  ackId: string;
  pdfBytes: Uint8Array;
  signerName: string;
  signatureDataUrl: string;
  signedAt: string;
  confirmationCode: string;
}

export interface SignedPreviewPayload {
  ackId: string;
  pdfBytes: Uint8Array;
  clientName: string;
  documentNumber: string;
  issueDate: string;
  signerName: string;
  signatureDataUrl: string;
  signedAt: string;
}

export interface SignedPreviewResult {
  signedPdfBytes: Uint8Array;
  signedAt: string;
  signatureCode: string;
  status: 'Documento firmado';
}

export interface SubmitSignedAckResponse {
  confirmationCode: string;
}

export interface AckConfirmationSummary {
  ackId: string;
  documentNumber: string;
  signerName: string;
  signedAt: string;
  confirmationCode: string;
  status: 'Pendiente de procesamiento' | 'Acuse firmado' | 'Documento firmado';
}
