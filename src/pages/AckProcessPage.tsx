import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PdfPreview from '../components/document/PdfPreview';
import AppShell from '../components/layout/AppShell';
import SignaturePad from '../components/signature/SignaturePad';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Checkbox from '../components/ui/Checkbox';
import { pendingAckMock } from '../mocks/ackMock';
import { ackService } from '../services/ackService';
import { createBaseAckPdf } from '../services/pdfSigningService';
import { PendingAck } from '../types/ack';
import { formatDateTime } from '../utils/format';

const toBlobUrl = (bytes: Uint8Array) =>
  URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));

function AckProcessPage() {
  const navigate = useNavigate();
  const [pendingAck, setPendingAck] = useState<PendingAck | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [signatureCode, setSignatureCode] = useState('');
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [basePdfBytes, setBasePdfBytes] = useState<Uint8Array | null>(null);
  const [basePdfUrl, setBasePdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const hasSignature = Boolean(signatureDataUrl);
  const isSigned = Boolean(signedAt && signatureCode);
  const canSubmit = Boolean(pendingAck && hasSignature && accepted && !isPreparingPreview && !isProcessing);
  const statusLabel = isSigned ? 'Documento firmado' : 'Pendiente de firma';

  useEffect(() => {
    let mounted = true;
    let initialBaseUrl: string | null = null;

    const load = async () => {
      const ack = await ackService.getPendingAck();
      const basePdf = await createBaseAckPdf(ack);
      const url = toBlobUrl(basePdf);

      if (!mounted) {
        URL.revokeObjectURL(url);
        return;
      }

      initialBaseUrl = url;
      setPendingAck(ack);
      setBasePdfBytes(basePdf);
      setBasePdfUrl(url);
      setPdfBytes(basePdf);
      setPdfUrl(url);
    };

    void load();
    return () => {
      mounted = false;
      if (initialBaseUrl) {
        URL.revokeObjectURL(initialBaseUrl);
      }
    };
  }, []);

  const summary = useMemo(() => pendingAck ?? pendingAckMock, [pendingAck]);

  const generateSignedPdfPreview = async (dataUrl: string) => {
    if (!pendingAck || !pdfBytes || !dataUrl) {
      return;
    }

    setIsPreparingPreview(true);
    try {
      const previewResult = await ackService.generateSignedPreview({
        ackId: pendingAck.ackId,
        pdfBytes,
        clientName: pendingAck.clientName,
        documentNumber: pendingAck.documentNumber,
        issueDate: pendingAck.issueDate,
        signerName: pendingAck.signerName,
        signatureDataUrl: dataUrl,
        signedAt: formatDateTime(new Date())
      });

      const signedUrl = toBlobUrl(previewResult.signedPdfBytes);
      if (pdfUrl && basePdfUrl && pdfUrl !== basePdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(signedUrl);
      setPdfBytes(previewResult.signedPdfBytes);
      setSignedAt(previewResult.signedAt);
      setSignatureCode(previewResult.signatureCode);
    } catch {
      setSignedAt('');
      setSignatureCode('');
      setSubmitError('No fue posible regenerar el PDF firmado. Intenta nuevamente.');
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingAck) {
      return;
    }

    setSignatureError('');
    setSubmitError('');

    if (!hasSignature) {
      setSignatureError('La firma en la casilla es obligatoria.');
      return;
    }

    if (!accepted) {
      setSubmitError('Debes aceptar la declaracion para continuar.');
      return;
    }

    if (!isSigned) {
      await generateSignedPdfPreview(signatureDataUrl);
      return;
    }

    setIsProcessing(true);
    try {
      await ackService.submitSignedAck({
        ackId: pendingAck.ackId,
        signerName: pendingAck.signerName,
        accepted,
        signatureDataUrl,
        signedAt,
        confirmationCode: signatureCode,
        signedPdfBytes: pdfBytes ?? basePdfBytes ?? new Uint8Array(),
        customerEmail: pendingAck.email,
        customerName: pendingAck.clientName,
        documentNumber: pendingAck.documentNumber
      });
      navigate('/confirmacion');
    } catch {
      setSubmitError('No fue posible completar el tramite. Intenta nuevamente en unos segundos.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AppShell>
      <section className="space-y-6">
        <div className="overflow-hidden rounded-[2rem] bg-brand-navy text-white shadow-soft">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.35fr_0.85fr] lg:px-10">
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-brand-sand">
                Soluciones Laser
              </span>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                  Confirma la recepcion de tu factura digital con una firma simple y segura.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-white/76 sm:text-base">
                  Revisa el acuse, valida los datos del documento y confirma la recepcion desde este portal.
                  Al completar el proceso, la factura quedara disponible inmediatamente para su consulta.
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.75rem] border border-white/10 bg-white/8 p-5 text-sm text-white/84">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-brand-sand">Cliente</p>
                <p className="mt-2 text-base font-semibold text-white">{summary.clientName}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-sand">Documento</p>
                  <p className="mt-2 font-medium text-white">{summary.documentNumber}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-sand">Estado</p>
                  <p className="mt-2 font-medium text-white">{statusLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-brand-sand/60">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Cliente / razón social</dt>
              <dd className="mt-1 text-sm font-medium text-brand-ink">{summary.clientName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Número de documento</dt>
              <dd className="mt-1 text-sm font-medium text-brand-ink">{summary.documentNumber}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Fecha de emisión</dt>
              <dd className="mt-1 text-sm font-medium text-brand-ink">{summary.issueDate}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-muted">Estado</dt>
              <dd className="mt-1 inline-flex rounded-full border border-brand-sand bg-brand-backgroundAlt px-3 py-1 text-xs font-semibold text-brand-ink">
                {statusLabel}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <PdfPreview pdfUrl={pdfUrl} />

          <Card className="space-y-5 border-brand-sand/70">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-orange">Validacion final</p>
              <h2 className="text-xl font-semibold text-brand-ink">Firma del receptor</h2>
              <p className="text-sm leading-6 text-brand-muted">
              Firma dentro del recuadro para confirmar la recepción del documento.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <SignaturePad
                onChange={(dataUrl) => {
                  if (isSigned && pdfUrl && basePdfUrl && pdfUrl !== basePdfUrl) {
                    URL.revokeObjectURL(pdfUrl);
                    if (basePdfBytes) {
                      setPdfBytes(basePdfBytes);
                    }
                    setPdfUrl(basePdfUrl);
                  }

                  setSignatureDataUrl(dataUrl);
                  setSignatureError('');
                  setSubmitError('');
                  setSignedAt('');
                  setSignatureCode('');
                }}
                onClear={() => {
                  if (pdfUrl && basePdfUrl && pdfUrl !== basePdfUrl) {
                    URL.revokeObjectURL(pdfUrl);
                  }
                  if (basePdfBytes) {
                    setPdfBytes(basePdfBytes);
                  }
                  setPdfUrl(basePdfUrl);
                  setSignatureDataUrl('');
                  setSignatureError('');
                  setSubmitError('');
                  setSignedAt('');
                  setSignatureCode('');
                }}
              />
              {signatureError ? <p className="text-xs font-medium text-brand-orange">{signatureError}</p> : null}

              <Checkbox
                id="accept-ack"
                checked={accepted}
                onChange={(event) => {
                  setAccepted(event.target.checked);
                  if (event.target.checked) {
                    setSubmitError('');
                  }
                }}
                label="Declaro haber recibido y aceptado el documento digital indicado."
              />

              <Button type="submit" fullWidth disabled={!canSubmit}>
                {isProcessing || isPreparingPreview
                  ? 'Procesando...'
                  : isSigned
                    ? 'Confirmar y continuar'
                    : 'Aceptar acuse'}
              </Button>

              {submitError ? <p className="text-sm font-medium text-brand-orange">{submitError}</p> : null}
            </form>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

export default AckProcessPage;
