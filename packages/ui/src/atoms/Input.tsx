import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-[#52635a] mb-1.5">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-[#91a098] pointer-events-none flex items-center">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full h-10 border border-[#e4eae6] rounded-[8px] text-sm text-[#2b3a32] bg-white outline-none transition-all placeholder:text-[#9aa59f] focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 disabled:bg-[#f6f8f6] disabled:text-[#81908a] ${
              icon ? 'pl-9 pr-3' : 'px-3'
            } ${error ? 'border-[#bc5b52] focus:border-[#bc5b52] focus:ring-[#bc5b52]/10' : ''} ${className}`}
            {...props}
          />
        </div>
        {error ? (
          <p className="mt-1 text-xs text-[#bc5b52] font-medium">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-[#7e8d85]">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
