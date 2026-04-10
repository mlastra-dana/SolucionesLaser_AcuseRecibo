import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PdfPreview from '../components/document/PdfPreview';
import AppShell from '../components/layout/AppShell';
import Alert from '../components/ui/Alert';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { ackService } from '../services/ackService';

function ConfirmationPage() {
  const confirmation = useMemo(() => ackService.getLastConfirmation(), []);
  const invoiceUrl = confirmation?.invoiceUrl ?? null;

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl space-y-6">
        <Card className="space-y-6 border-brand-border text-center shadow-soft">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand-border bg-brand-background">
            <span className="text-2xl text-brand-orange" aria-hidden="true">
              ✓
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-brand-ink">Acuse firmado correctamente</h1>
            <p className="text-sm text-brand-muted sm:text-base">
              Tu acuse de recibo fue firmado y registrado. Ya puedes descargar la factura asociada desde esta pantalla.
            </p>
          </div>

          {confirmation ? (
            <div className="rounded-2xl border border-brand-border bg-brand-background p-4 text-left">
              <h2 className="text-sm font-semibold text-brand-ink">Resumen de confirmación</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-brand-muted">Fecha y hora de firma</dt>
                  <dd className="mt-1 text-sm font-medium text-brand-ink">{confirmation.signedAt}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-brand-muted">Estado</dt>
                  <dd className="mt-1 text-sm font-medium text-brand-ink">{confirmation.status}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <Alert title="Sin confirmación activa">
              No encontramos un acuse firmado en esta sesión. Puedes volver al inicio y completar el proceso.
            </Alert>
          )}

          {invoiceUrl ? (
            <div className="space-y-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-brand-ink">Factura</h2>
                  <p className="mt-1 text-sm text-brand-muted">Revisa la factura en pantalla o descárgala directamente.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a href={invoiceUrl} download className="inline-flex">
                    <Button>Descargar factura</Button>
                  </a>
                </div>
              </div>

              <PdfPreview pdfUrl={invoiceUrl} />
            </div>
          ) : null}

          <Link to="/">
            <Button variant="secondary">Volver al inicio</Button>
          </Link>
        </Card>
      </section>
    </AppShell>
  );
}

export default ConfirmationPage;
