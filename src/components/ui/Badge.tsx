import { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
};

function Badge({ children }: BadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-brand-border bg-brand-background px-3 py-1 text-xs font-semibold text-brand-muted">
      {children}
    </span>
  );
}

export default Badge;
