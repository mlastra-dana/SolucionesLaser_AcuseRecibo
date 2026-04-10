import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

const baseClass =
  'inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand-orange text-white shadow-card hover:-translate-y-0.5 hover:bg-brand-orangeHover',
  secondary:
    'border border-brand-border bg-white text-brand-ink hover:-translate-y-0.5 hover:bg-brand-backgroundAlt',
  ghost: 'text-brand-ink hover:bg-brand-backgroundAlt'
};

function Button({ children, variant = 'primary', fullWidth = false, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`${baseClass} ${variantClass[variant]} ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
