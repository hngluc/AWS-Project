import React from 'react';

export const Badge = ({ children, variant = 'primary', className = '' }) => {
  const getBadgeClass = () => {
    switch (variant) {
      case 'success':
        return 'badge-success';
      case 'warning':
        return 'badge-warning';
      case 'danger':
        return 'badge-danger';
      case 'primary':
      default:
        return 'badge-primary';
    }
  };

  return (
    <span className={`badge ${getBadgeClass()} ${className}`}>
      {children}
    </span>
  );
};
