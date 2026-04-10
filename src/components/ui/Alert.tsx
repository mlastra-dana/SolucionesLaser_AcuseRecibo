import { ReactNode } from 'react';

type AlertProps = {
  title?: string;
  children: ReactNode;
};

function Alert({ title, children }: AlertProps) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-mist p-4">
      {title ? <p className="text-sm font-semibold text-brand-ink">{title}</p> : null}
      <p className="mt-1 text-sm text-brand-muted">{children}</p>
    </div>
  );
}

export default Alert;
