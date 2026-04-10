import { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-brand-border/80 bg-white/92 p-6 shadow-card backdrop-blur-sm ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
