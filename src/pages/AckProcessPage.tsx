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
        confirmationCode: signatureCode
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
      <section className="space-y-5">
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Acuse de recibo de factura digital</h1>

        <Card>
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
              <dd className="mt-1 inline-flex rounded-full border border-brand-border bg-brand-background px-2.5 py-1 text-xs font-semibold text-brand-ink">
                {statusLabel}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <PdfPreview pdfUrl={pdfUrl} />

          <Card className="space-y-4">
            <h2 className="text-base font-semibold text-brand-ink">Firma del receptor</h2>
            <p className="text-sm text-brand-muted">
              Firma dentro del recuadro para confirmar la recepción del documento.
            </p>

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
              {signatureError ? <p className="text-xs text-brand-orange">{signatureError}</p> : null}

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

              {submitError ? <p className="text-sm text-brand-orange">{submitError}</p> : null}
            </form>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}

export default AckProcessPage;
