import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AckPreview from '../components/document/AckPreview';
import AppShell from '../components/layout/AppShell';
import SignaturePad from '../components/signature/SignaturePad';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Checkbox from '../components/ui/Checkbox';
import Input from '../components/ui/Input';
import { ackService } from '../services/ackService';
import { PendingAck } from '../types/ack';
import { formatDateTime } from '../utils/format';

function AckProcessPage() {
  const navigate = useNavigate();
  const [pendingAck, setPendingAck] = useState<PendingAck | null>(null);
  const [signerName, setSignerName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [isDocumentSigned, setIsDocumentSigned] = useState(false);
  const [signedAt, setSignedAt] = useState('');
  const [signatureCode, setSignatureCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [nameError, setNameError] = useState('');
  const [signatureError, setSignatureError] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    ackService.getPendingAck().then(setPendingAck);
  }, []);

  const isNameValid = signerName.trim().length >= 3;
  const hasSignature = Boolean(signatureDataUrl);
  const canSign = Boolean(pendingAck) && accepted && isNameValid && hasSignature && !isProcessing;
  const canConfirm = Boolean(pendingAck && isDocumentSigned) && accepted && isNameValid && hasSignature && !isProcessing;
  const statusLabel = isDocumentSigned ? 'Documento firmado' : 'Pendiente de firma';

  const validateBeforeAction = () => {
    let isValid = true;

    if (!isNameValid) {
      setNameError('Ingresa el nombre del firmante para continuar.');
      isValid = false;
    }

    if (!hasSignature) {
      setSignatureError('La firma en la casilla es obligatoria.');
      isValid = false;
    }

    if (!accepted) {
      setSubmitError('Debes aceptar la declaracion para continuar.');
      isValid = false;
    }

    return isValid;
  };

  const handlePrimaryAction = async (event: FormEvent) => {
    event.preventDefault();

    if (!pendingAck) {
      return;
    }

    setNameError('');
    setSignatureError('');
    setSubmitError('');

    if (!validateBeforeAction()) {
      return;
    }

    setIsProcessing(true);
    try {
      if (!isDocumentSigned) {
        const previewResult = await ackService.generateSignedPreview({
          ackId: pendingAck.ackId,
          clientName: pendingAck.clientName,
          documentNumber: pendingAck.documentNumber,
          signerName: signerName.trim(),
          accepted,
          signatureDataUrl,
          signedAt: formatDateTime(new Date())
        });
        setIsDocumentSigned(true);
        setSignedAt(previewResult.signedAt);
        setSignatureCode(previewResult.signatureCode);
      } else {
        await ackService.submitSignedAck({
          ackId: pendingAck.ackId,
          signerName: signerName.trim(),
          accepted,
          signatureDataUrl,
          signedAt
        });
        navigate('/confirmacion');
      }
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

        {pendingAck ? (
          <Card>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand-muted">Cliente / razón social</dt>
                <dd className="mt-1 text-sm font-medium text-brand-ink">{pendingAck.clientName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand-muted">Número de documento</dt>
                <dd className="mt-1 text-sm font-medium text-brand-ink">{pendingAck.documentNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand-muted">Fecha de emisión</dt>
                <dd className="mt-1 text-sm font-medium text-brand-ink">{pendingAck.issueDate}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-brand-muted">Estado</dt>
                <dd className="mt-1 inline-flex rounded-full border border-brand-border bg-brand-background px-2.5 py-1 text-xs font-semibold text-brand-ink">
                  {statusLabel}
                </dd>
              </div>
            </dl>
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-brand-muted">Cargando datos del documento...</p>
          </Card>
        )}

        {pendingAck ? (
          <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
            <AckPreview
              document={pendingAck}
              signatureDataUrl={signatureDataUrl}
              signerName={signerName.trim()}
              signedAt={signedAt}
              signatureCode={signatureCode}
              isSigned={isDocumentSigned}
            />

            <Card className="space-y-4">
              <h2 className="text-base font-semibold text-brand-ink">Firma del receptor</h2>
              <p className="text-sm text-brand-muted">
                Firma dentro del recuadro para confirmar la recepción del documento.
              </p>

              <form onSubmit={handlePrimaryAction} className="space-y-4">
                <SignaturePad
                  onChange={(dataUrl) => {
                    setSignatureDataUrl(dataUrl);
                    if (dataUrl) {
                      setSignatureError('');
                    }

                    if (isDocumentSigned) {
                      setIsDocumentSigned(false);
                      setSignedAt('');
                      setSignatureCode('');
                    }
                  }}
                  onClear={() => {
                    setSignatureDataUrl('');
                    setIsDocumentSigned(false);
                    setSignedAt('');
                    setSignatureCode('');
                  }}
                />
                {signatureError ? <p className="text-xs text-brand-orange">{signatureError}</p> : null}

                <Input
                  id="signer-name"
                  label="Nombre del firmante"
                  placeholder="Ej. Maria Perez"
                  value={signerName}
                  onChange={(event) => {
                    setSignerName(event.target.value);
                    if (event.target.value.trim().length >= 3) {
                      setNameError('');
                    }
                  }}
                  error={nameError}
                />

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

                <Button type="submit" fullWidth disabled={isDocumentSigned ? !canConfirm : !canSign}>
                  {isProcessing
                    ? 'Procesando...'
                    : isDocumentSigned
                      ? 'Confirmar acuse'
                      : 'Firmar documento'}
                </Button>

                {submitError ? <p className="text-sm text-brand-orange">{submitError}</p> : null}
              </form>
            </Card>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

export default AckProcessPage;
