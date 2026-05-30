import React from 'react';

interface AvatarProps {
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
};

const palette = [
  'bg-accent-light text-accent',
  'bg-success-light text-success',
  'bg-warning-light text-warning',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

export default function Avatar({ name, size = 'sm', className = '' }: AvatarProps) {
  const initials = (name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const colorIndex = (name?.charCodeAt(0) || 0) % palette.length;

  return (
    <div
      className={`
        rounded-full flex-shrink-0 flex items-center justify-center
        font-semibold select-none
        ${sizeClasses[size]}
        ${palette[colorIndex]}
        ${className}
      `}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
