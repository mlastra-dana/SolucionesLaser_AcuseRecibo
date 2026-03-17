import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

const baseClass =
  'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand-orange text-white hover:bg-brand-orangeHover',
  secondary: 'bg-brand-surface text-brand-ink border border-brand-border hover:bg-brand-background',
  ghost: 'text-brand-ink hover:bg-brand-background'
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
