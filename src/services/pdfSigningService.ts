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

  const signatureBlock = { x: 50, y: 255, width: 495, height: 195 };
  const signatureArea = { x: 68, y: 332, width: 220, height: 76 };
  const metaX = 320;

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

  page.drawText('Bloque de Firma y Aceptacion', {
    x: 68,
    y: 426,
    size: 10,
    font: bold,
    color
  });
  page.drawLine({
    start: { x: 72, y: 326 },
    end: { x: 284, y: 326 },
    thickness: 0.8,
    color: rgb(0.8, 0.82, 0.85)
  });
  page.drawText('Firma del receptor', { x: 72, y: 314, size: 9, font, color: rgb(0.42, 0.45, 0.5) });

  page.drawText('Firmante:', { x: metaX, y: 385, size: 10, font: bold, color });
  page.drawText('______________________________', { x: metaX, y: 372, size: 10, font, color: rgb(0.45, 0.48, 0.52) });
  page.drawText('Codigo de firma:', { x: metaX, y: 348, size: 10, font: bold, color });
  page.drawText('______________________________', { x: metaX, y: 335, size: 10, font, color: rgb(0.45, 0.48, 0.52) });
  page.drawText('Fecha de firma:', { x: metaX, y: 311, size: 10, font: bold, color });
  page.drawText('______________________________', { x: metaX, y: 298, size: 10, font, color: rgb(0.45, 0.48, 0.52) });

  return pdf.save();
};

export const signAckPdf = async (params: SignAckPdfRequest): Promise<Uint8Array> => {
  const pdf = await PDFDocument.load(params.pdfBytes);
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const signatureBytes = toUint8Array(params.signatureDataUrl);
  const signatureImage = await pdf.embedPng(signatureBytes);
  const color = rgb(0.07, 0.09, 0.13);
  const metaX = 320;

  page.drawImage(signatureImage, {
    x: 75,
    y: 338,
    width: 198,
    height: 62
  });

  page.drawText(params.signerName, {
    x: metaX,
    y: 372,
    size: 10,
    font,
    color
  });
  page.drawText(params.confirmationCode, {
    x: metaX,
    y: 335,
    size: 10,
    font,
    color
  });
  page.drawText(params.signedAt, {
    x: metaX,
    y: 298,
    size: 10,
    font,
    color
  });

  return pdf.save();
};
