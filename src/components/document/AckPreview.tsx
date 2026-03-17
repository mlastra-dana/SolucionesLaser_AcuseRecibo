import { PendingAck } from '../../types/ack';

type AckPreviewProps = {
  document: PendingAck;
  signatureDataUrl: string;
  signerName: string;
  signedAt: string;
  signatureCode: string;
  isSigned: boolean;
};

function AckPreview({
  document,
  signatureDataUrl,
  signerName,
  signedAt,
  signatureCode,
  isSigned
}: AckPreviewProps) {
  return (
    <div className="overflow-x-auto py-1">
      <div className="mx-auto w-full max-w-[794px] border border-brand-border bg-white px-8 py-10 text-[15px] leading-7 text-brand-ink shadow-soft sm:px-12">
        <h2 className="text-center text-2xl font-semibold">Acuse de Recibo de Factura Digital</h2>

        <p className="mt-8">
          Por medio del presente, se deja constancia de haber recibido de conformidad la factura digital
          identificada con los siguientes datos:
        </p>

        <dl className="mt-6 space-y-2">
          <div>
            <dt className="inline font-semibold">Nombre del Cliente o Razón Social: </dt>
            <dd className="inline">{document.clientName}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">R.I.F./Cédula: </dt>
            <dd className="inline">{document.identification}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Correo: </dt>
            <dd className="inline">{document.email}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Nº de Documento: </dt>
            <dd className="inline">{document.documentNumber}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Fecha de Emisión: </dt>
            <dd className="inline">{document.issueDate}</dd>
          </div>
        </dl>

        <p className="mt-8">
          Este documento constituye una aceptación formal del documento fiscal recibido en formato digital y
          firmado electrónicamente.
        </p>

        <p className="mt-5 font-medium">Documento firmado digitalmente.</p>

        <section className="mt-10 border-t border-brand-border pt-6">
          <div className="rounded-lg border border-brand-border p-4">
            <div className="mb-3 h-24 rounded-md border border-dashed border-brand-border bg-brand-background p-2">
              {isSigned ? (
                <img
                  src={signatureDataUrl}
                  alt="Firma del receptor"
                  className="h-full w-auto object-contain"
                />
              ) : null}
            </div>
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-semibold">Firmante:</span> {isSigned ? signerName : ''}
              </p>
              <p>
                <span className="font-semibold">Código de firma:</span> {isSigned ? signatureCode : ''}
              </p>
              <p>
                <span className="font-semibold">Fecha de firma:</span> {isSigned ? signedAt : ''}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AckPreview;
