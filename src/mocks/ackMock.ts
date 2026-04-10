import { AckConfirmationSummary, PendingAck } from '../types/ack';

export const pendingAckMock: PendingAck = {
  ackId: 'ACK-DOC-2026-000184',
  clientName: 'Soluciones Láser C.A.',
  signerName: 'María Fernanda Pérez',
  identification: 'J-41234567-8',
  email: 'facturacion@solucioneslaser.com',
  documentNumber: 'FAC-2026-000184',
  issueDate: '17/03/2026',
  basePdfUrl: '/mock/acuse-base.pdf',
  invoiceUrl: 'https://wsqa.solucioneslaser.com/pruebapdf-war/recursos/services/generar/flbzlgUTxUphYyRhGjRMuA=='
};

export const initialConfirmationMock: AckConfirmationSummary = {
  ackId: pendingAckMock.ackId,
  documentNumber: pendingAckMock.documentNumber,
  signerName: '',
  signedAt: '17/03/2026 10:30',
  confirmationCode: 'ACK-20260317-0001',
  status: 'Pendiente de procesamiento'
};
