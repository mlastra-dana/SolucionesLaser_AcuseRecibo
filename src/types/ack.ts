export interface PendingAck {
  ackId: string;
  clientName: string;
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
}

export interface SignedPreviewPayload extends SignedAckPayload {
  clientName: string;
  documentNumber: string;
}

export interface SignedPreviewResult {
  signedAt: string;
  signatureCode: string;
  status: 'Documento firmado';
}

export interface SubmitSignedAckResponse {
  confirmationCode: string;
}

export interface AckConfirmationSummary {
  ackId: string;
  signerName: string;
  signedAt: string;
  confirmationCode: string;
  status: 'Pendiente de procesamiento' | 'Acuse firmado' | 'Documento firmado';
}
