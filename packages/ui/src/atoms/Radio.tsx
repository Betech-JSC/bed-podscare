import React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const radioId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <label htmlFor={radioId} className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-[#48564e]">
        <input
          id={radioId}
          ref={ref}
          type="radio"
          className={`w-4 h-4 border-[#cdd6d1] text-[#176b58] accent-[#176b58] focus:ring-0 cursor-pointer ${className}`}
          {...props}
        />
        {label && <span>{label}</span>}
      </label>
    );
  }
);

Radio.displayName = 'Radio';
