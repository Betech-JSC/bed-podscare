import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const areaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={areaId} className="block text-xs font-semibold text-[#52635a] mb-1.5">
            {label}
          </label>
        )}
        <textarea
          id={areaId}
          ref={ref}
          className={`w-full min-h-[80px] p-3 border border-[#e4eae6] rounded-[8px] text-sm text-[#2b3a32] bg-white outline-none transition-all placeholder:text-[#9aa59f] focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 disabled:bg-[#f6f8f6] resize-y ${
            error ? 'border-[#bc5b52]' : ''
          } ${className}`}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-[#bc5b52] font-medium">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-[#7e8d85]">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
