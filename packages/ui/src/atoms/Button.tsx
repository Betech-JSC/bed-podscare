import React, { forwardRef } from 'react';
import { Icon } from './Icons';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: string | React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      type = 'button',
      icon,
      iconPosition = 'left',
      loading = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const base =
      'inline-flex items-center justify-center gap-2 rounded-[8px] font-semibold transition-all active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed select-none';

    const sizeClasses = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-9 px-4 text-sm',
      lg: 'h-11 px-5 text-base',
    }[size];

    const variantClasses = {
      primary:
        'bg-[#176b58] text-white hover:bg-[#125945] border border-[#176b58] shadow-[0_3px_8px_rgba(23,107,88,0.11)]',
      secondary:
        'bg-white text-[#465b52] border border-[#dfe8e3] hover:border-[#b7ccc0] hover:bg-[#fafcfb]',
      outline:
        'bg-white text-[#465b52] border border-[#dfe8e3] hover:border-[#b7ccc0] hover:bg-[#fafcfb]',
      ghost:
        'bg-transparent text-[#708078] hover:bg-[#f1f4f2] border-0',
      danger:
        'bg-[#bc5b52] text-white hover:bg-[#a84d45] border border-[#bc5b52]',
    }[variant];

    const renderIcon = () => {
      const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
      if (loading) {
        return <Icon name="refresh" size={iconSize} className="animate-spin" />;
      }
      if (!icon) return null;
      if (typeof icon === 'string') {
        return <Icon name={icon} size={iconSize} />;
      }
      return icon;
    };

    return (
      <button
        ref={ref}
        type={type}
        className={`${base} ${sizeClasses} ${variantClasses} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {iconPosition === 'left' && renderIcon()}
        {children}
        {iconPosition === 'right' && renderIcon()}
      </button>
    );
  }
);

Button.displayName = 'Button';
