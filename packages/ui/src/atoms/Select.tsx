import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[] | string[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, children, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-[#52635a] mb-1.5">
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={`w-full h-10 border border-[#e4eae6] rounded-[8px] px-3 text-sm text-[#2b3a32] bg-white outline-none transition-all focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 disabled:bg-[#f6f8f6] disabled:text-[#81908a] cursor-pointer ${
            error ? 'border-[#bc5b52]' : ''
          } ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => {
                if (typeof opt === 'string') {
                  return (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  );
                }
                return (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                );
              })
            : children}
        </select>
        {error && <p className="mt-1 text-xs text-[#bc5b52] font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
