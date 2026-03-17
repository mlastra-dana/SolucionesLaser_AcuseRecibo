import { InputHTMLAttributes } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

function Checkbox({ label, id, className = '', ...props }: CheckboxProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-brand-ink">
      <input
        id={id}
        type="checkbox"
        className={`mt-1 h-4 w-4 rounded border-brand-border text-brand-orange focus:ring-brand-orange ${className}`.trim()}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

export default Checkbox;
