import { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  helperText?: string;
  error?: string;
};

function Input({ label, id, helperText, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-brand-ink">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2.5 text-sm text-brand-ink placeholder:text-brand-muted focus:border-brand-orange ${className}`.trim()}
        {...props}
      />
      {helperText && !error ? <p className="text-xs text-brand-muted">{helperText}</p> : null}
      {error ? <p className="text-xs text-brand-orange">{error}</p> : null}
    </div>
  );
}

export default Input;
