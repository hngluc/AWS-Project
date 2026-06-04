import React from 'react';

export const Spinner = ({ size = 'md', className = '' }) => {
  const getSizeClass = () => {
    switch (size) {
      case 'sm':
        return 'w-5 h-5';
      case 'lg':
        return 'w-12 h-12';
      case 'md':
      default:
        return 'w-8 h-8';
    }
  };

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <svg
        className={`animate-spin text-purple-500 ${getSizeClass()}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        style={{
          width: size === 'sm' ? '20px' : size === 'lg' ? '48px' : '32px',
          height: size === 'sm' ? '20px' : size === 'lg' ? '48px' : '32px',
        }}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};
