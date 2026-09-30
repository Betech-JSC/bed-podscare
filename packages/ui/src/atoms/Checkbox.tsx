import React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const boxId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <label htmlFor={boxId} className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-[#48564e]">
        <input
          id={boxId}
          ref={ref}
          type="checkbox"
          className={`w-4 h-4 rounded border-[#cdd6d1] text-[#176b58] accent-[#176b58] focus:ring-0 focus:ring-offset-0 cursor-pointer ${className}`}
          {...props}
        />
        {label && <span>{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
