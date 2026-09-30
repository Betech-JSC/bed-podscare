import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { formatCurrencyMask, parseCurrency } from '../utils/currency';

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  value?: number | string | null;
  onChangeValue?: (value: number, rawFormatted: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  maxDigits?: number;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      label,
      error,
      hint,
      icon,
      suffix = '₫',
      value,
      onChangeValue,
      onChange,
      className = '',
      id,
      placeholder = '0',
      disabled,
      maxDigits = 15,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const internalInputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(ref, () => internalInputRef.current as HTMLInputElement);

    const [internalValue, setInternalValue] = useState<string>(() => {
      if (value === null || value === undefined || value === '') {
        return '';
      }
      return formatCurrencyMask(value);
    });

    // Synchronize with external value prop updates
    useEffect(() => {
      if (value === '' || value === null || value === undefined) {
        if (internalValue !== '') {
          setInternalValue('');
        }
      } else {
        const externalNumeric = typeof value === 'number' ? value : parseCurrency(value);
        const currentInternalNumeric = parseCurrency(internalValue);
        // Only update internalValue when external value changes externally
        if (externalNumeric !== currentInternalNumeric) {
          setInternalValue(formatCurrencyMask(value));
        }
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const rawInput = input.value;
      const selectionStart = input.selectionStart ?? rawInput.length;

      // Count digits before cursor in current raw input
      const digitsBefore = rawInput.slice(0, selectionStart).replace(/\D/g, '').length;

      // Clean digits (remove non-digits and leading zeros)
      let cleanDigits = rawInput.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      if (maxDigits && cleanDigits.length > maxDigits) {
        cleanDigits = cleanDigits.slice(0, maxDigits);
      }

      const formatted = formatCurrencyMask(cleanDigits);
      const numericVal = parseCurrency(cleanDigits);

      setInternalValue(formatted);

      // Restore caret position after formatting
      requestAnimationFrame(() => {
        if (internalInputRef.current) {
          if (digitsBefore === 0) {
            internalInputRef.current.setSelectionRange(0, 0);
            return;
          }
          let count = 0;
          let newCaret = formatted.length;
          for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) {
              count++;
            }
            if (count === digitsBefore) {
              newCaret = i + 1;
              break;
            }
          }
          internalInputRef.current.setSelectionRange(newCaret, newCaret);
        }
      });

      if (onChangeValue) {
        onChangeValue(numericVal, formatted);
      }
      if (onChange) {
        onChange(e);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        const input = e.currentTarget;
        const { selectionStart, selectionEnd } = input;
        if (selectionStart !== null && selectionStart === selectionEnd && selectionStart > 0) {
          // If backspacing right after a dot, move caret left of the dot so the preceding digit gets deleted
          if (input.value[selectionStart - 1] === '.') {
            input.setSelectionRange(selectionStart - 1, selectionStart - 1);
          }
        }
      }
      if (props.onKeyDown) {
        props.onKeyDown(e);
      }
    };

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
            ref={internalInputRef}
            type="text"
            inputMode="numeric"
            value={internalValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full h-10 border border-[#e4eae6] rounded-[8px] text-sm text-[#2b3a32] bg-white outline-none transition-all placeholder:text-[#9aa59f] focus:border-[#75a994] focus:ring-2 focus:ring-[#176b58]/10 disabled:bg-[#f6f8f6] disabled:text-[#81908a] ${
              icon ? 'pl-9' : 'pl-3'
            } ${suffix ? 'pr-9' : 'pr-3'} ${
              error ? 'border-[#bc5b52] focus:border-[#bc5b52] focus:ring-[#bc5b52]/10' : ''
            } ${className}`}
            {...props}
          />
          {suffix && (
            <div className="absolute right-3 text-[#176b58] font-bold text-sm pointer-events-none flex items-center select-none">
              {suffix}
            </div>
          )}
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

CurrencyInput.displayName = 'CurrencyInput';
