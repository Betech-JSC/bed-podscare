import React from 'react';

export interface AvatarProps {
  initials: string;
  variant?: 0 | 1 | 2 | 3 | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  initials,
  variant = 0,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  }[size];

  const variantClasses = {
    0: 'bg-[#f1ded2] text-[#745340]',
    1: 'bg-[#e0e9f3] text-[#4a6481]',
    2: 'bg-[#f2ead1] text-[#88703c]',
    3: 'bg-[#e2eee6] text-[#547863]',
    dark: 'bg-[#dcebe4] text-[#21654e]',
  }[variant];

  return (
    <div
      className={`rounded-full grid place-items-center font-bold flex-none select-none ${sizeClasses} ${variantClasses} ${className}`}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
};
