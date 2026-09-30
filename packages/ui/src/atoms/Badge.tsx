import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'brand' | 'neutral' | 'dot';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className = '',
}) => {
  const variantClasses = {
    brand: 'bg-[#eaf4ef] text-[#176b58]',
    neutral: 'bg-[#f0f3f1] text-[#708078]',
    dot: 'w-2 h-2 rounded-full bg-[#d49342] p-0',
  }[variant];

  if (variant === 'dot') {
    return <span className={`inline-block ${variantClasses} ${className}`} />;
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-[10px] ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
};
