import { AckConfirmationSummary, PendingAck } from '../types/ack';

export const pendingAckMock: PendingAck = {
  ackId: 'ACK-DOC-2026-000184',
  // Demo note: these fields are intentionally aligned by hand with public/mock/factura-real.pdf
  clientName: 'Tu empresa',
  signerName: 'Tu empresa',
  identification: 'J-00000000-0',
  email: 'tuempresa@gmail.com',
  documentNumber: '00000001',
  issueDate: '2025-07-28',
  basePdfUrl: '/mock/acuse-base.pdf',
  invoiceUrl: '/mock/factura-real.pdf'
};

export const initialConfirmationMock: AckConfirmationSummary = {
  ackId: pendingAckMock.ackId,
  documentNumber: pendingAckMock.documentNumber,
  signerName: '',
  signedAt: '17/03/2026 10:30',
  confirmationCode: 'ACK-20260317-0001',
  status: 'Pendiente de procesamiento'
};
