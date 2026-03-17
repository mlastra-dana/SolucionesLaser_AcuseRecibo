import { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-brand-border bg-brand-surface p-6 shadow-card ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
