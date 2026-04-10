import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type PdfPreviewProps = {
  pdfUrl: string | null;
};

function PdfPreview({ pdfUrl }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const renderIdRef = useRef(0);

  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) {
      return;
    }

    let cancelled = false;
    const currentRenderId = renderIdRef.current + 1;
    renderIdRef.current = currentRenderId;
    const task = getDocument(pdfUrl);

    const renderPdf = async () => {
      setIsLoading(true);
      setError('');

      try {
        const pdf = await task.promise;
        if (cancelled || renderIdRef.current !== currentRenderId) {
          return;
        }
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.25 });
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('No se pudo preparar el render del PDF.');
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch (errorObject) {
        if (cancelled || renderIdRef.current !== currentRenderId) {
          return;
        }
        const message = errorObject instanceof Error ? errorObject.message : '';
        const isExpectedCancellation =
          message.includes('Rendering cancelled') ||
          message.includes('Worker was destroyed') ||
          message.includes('Loading aborted');

        if (!isExpectedCancellation) {
          setError('No se pudo renderizar el PDF en el preview.');
        }
      } finally {
        if (!cancelled && renderIdRef.current === currentRenderId) {
          setIsLoading(false);
        }
      }
    };

    void renderPdf();
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [pdfUrl]);

  return (
    <div className="rounded-[2rem] border border-brand-border bg-white/92 p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-orange">Vista documental</p>
          <h2 className="mt-1 text-lg font-semibold text-brand-ink">Acuse digital</h2>
        </div>
        <span className="rounded-full bg-brand-mist px-3 py-1 text-xs font-medium text-brand-muted">PDF en vivo</span>
      </div>

      <div className="overflow-auto rounded-[1.5rem] border border-brand-border bg-brand-backgroundAlt/45 p-4">
        {isLoading ? <p className="mb-3 text-sm text-brand-muted">Cargando documento PDF...</p> : null}
        {error ? <p className="mb-3 text-sm text-brand-orange">{error}</p> : null}
        <canvas ref={canvasRef} className="mx-auto h-auto max-w-full bg-white shadow-card" />
      </div>
    </div>
  );
}

export default PdfPreview;
