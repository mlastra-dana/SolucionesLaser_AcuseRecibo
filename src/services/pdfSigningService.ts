import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PendingAck, SignAckPdfRequest } from '../types/ack';

const toUint8Array = (dataUrl: string) => {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const createBaseAckPdf = async (ack: PendingAck): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.07, 0.09, 0.13);

  page.drawText('Acuse de Recibo de Factura Digital', {
    x: 150,
    y: 780,
    size: 17,
    font: bold,
    color
  });

  page.drawText(
    'Por medio del presente, se deja constancia de haber recibido de conformidad la factura digital',
    {
      x: 50,
      y: 730,
      size: 11,
      font,
      color
    }
  );
  page.drawText('identificada con los siguientes datos:', {
    x: 50,
    y: 713,
    size: 11,
    font,
    color
  });

  const details = [
    `Nombre del Cliente o Razon Social: ${ack.clientName}`,
    `R.I.F./Cedula: ${ack.identification}`,
    `Correo: ${ack.email}`,
    `Nº de Documento: ${ack.documentNumber}`,
    `Fecha de Emision: ${ack.issueDate}`
  ];

  details.forEach((line, idx) => {
    page.drawText(line, {
      x: 50,
      y: 675 - idx * 24,
      size: 11,
      font,
      color
    });
  });

  page.drawText(
    'Este documento constituye una aceptacion formal del documento fiscal recibido en formato',
    {
      x: 50,
      y: 536,
      size: 11,
      font,
      color
    }
  );
  page.drawText('digital y firmado electronicamente.', {
    x: 50,
    y: 519,
    size: 11,
    font,
    color
  });
  page.drawText('Documento firmado digitalmente.', {
    x: 50,
    y: 489,
    size: 11,
    font: bold,
    color
  });

  const signatureBlock = { x: 50, y: 280, width: 495, height: 170 };
  const signatureArea = { x: 68, y: 336, width: 200, height: 74 };

  page.drawRectangle({
    ...signatureBlock,
    borderColor: rgb(0.9, 0.91, 0.92),
    borderWidth: 1
  });
  page.drawRectangle({
    ...signatureArea,
    borderColor: rgb(0.9, 0.91, 0.92),
    borderWidth: 1
  });

  page.drawText('Firmante:', { x: 68, y: 318, size: 10, font: bold, color });
  page.drawText('Codigo de firma:', { x: 68, y: 300, size: 10, font: bold, color });
  page.drawText('Fecha de firma:', { x: 68, y: 282, size: 10, font: bold, color });

  return pdf.save();
};

export const signAckPdf = async (params: SignAckPdfRequest): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(params.pdfBytes);
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signatureBytes = toUint8Array(params.signatureDataUrl);
  const signatureImage = await pdf.embedPng(signatureBytes);
  const color = rgb(0.07, 0.09, 0.13);

  page.drawImage(signatureImage, {
    x: 75,
    y: 344,
    width: 186,
    height: 58
  });

  page.drawText(`Firmante: ${params.signerName}`, {
    x: 68,
    y: 318,
    size: 10,
    font: bold,
    color
  });
  page.drawText(`Codigo de firma: ${params.confirmationCode}`, {
    x: 68,
    y: 300,
    size: 10,
    font,
    color
  });
  page.drawText(`Fecha de firma: ${params.signedAt}`, {
    x: 68,
    y: 282,
    size: 10,
    font,
    color
  });

  return pdf.save();
};
