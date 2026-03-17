import { type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent, useEffect, useRef, useState } from 'react';

type Point = {
  x: number;
  y: number;
};

type SignaturePadProps = {
  onChange: (signatureDataUrl: string) => void;
  onClear?: () => void;
  className?: string;
};

const STROKE_STYLE = '#111827';
const LINE_WIDTH = 2;

function SignaturePad({ onChange, onClear, className = '' }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const hasSignatureRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);

  const configureCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.scale(dpr, dpr);
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, rect.width, rect.height);
    context.lineWidth = LINE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = STROKE_STYLE;
  };

  useEffect(() => {
    configureCanvas();

    const onResize = () => {
      const current = hasSignatureRef.current ? canvasRef.current?.toDataURL('image/png') : '';
      configureCanvas();

      if (current && canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        const image = new Image();
        image.onload = () => {
          if (!context || !canvasRef.current) {
            return;
          }
          context.drawImage(image, 0, 0, canvasRef.current.width / (window.devicePixelRatio || 1), canvasRef.current.height / (window.devicePixelRatio || 1));
        };
        image.src = current;
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getContext = () => canvasRef.current?.getContext('2d') ?? null;

  const getPoint = (
    event:
      | ReactMouseEvent<HTMLCanvasElement>
      | ReactTouchEvent<HTMLCanvasElement>
      | MouseEvent
      | TouchEvent
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    if ('touches' in event) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) {
        return null;
      }
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrawing = (
    event: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>
  ) => {
    event.preventDefault();
    const context = getContext();
    const point = getPoint(event);
    if (!context || !point) {
      return;
    }

    context.beginPath();
    context.moveTo(point.x, point.y);
    lastPointRef.current = point;
    setIsDrawing(true);
  };

  const draw = (
    event: ReactMouseEvent<HTMLCanvasElement> | ReactTouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) {
      return;
    }

    event.preventDefault();
    const context = getContext();
    const nextPoint = getPoint(event);
    const lastPoint = lastPointRef.current;
    if (!context || !nextPoint || !lastPoint) {
      return;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
    if (!hasSignatureRef.current) {
      hasSignatureRef.current = true;
      setHasSignature(true);
    }
  };

  const endDrawing = () => {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    lastPointRef.current = null;

    if (canvasRef.current && hasSignatureRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = getContext();
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    configureCanvas();
    hasSignatureRef.current = false;
    setHasSignature(false);
    onChange('');
    onClear?.();
  };

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      <canvas
        ref={canvasRef}
        className="h-44 w-full touch-none rounded-2xl border border-brand-border bg-brand-surface"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
        role="img"
        aria-label="Casilla de firma"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-brand-muted">
          {hasSignature ? 'Firma capturada.' : 'Aun no hay firma registrada.'}
        </p>
        <button
          type="button"
          onClick={clearSignature}
          className="rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-background"
        >
          Limpiar firma
        </button>
      </div>
    </div>
  );
}

export default SignaturePad;
