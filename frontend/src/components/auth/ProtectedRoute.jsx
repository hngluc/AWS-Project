import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { Spinner } from '../ui/Spinner';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-main)',
        }}
      >
        <Spinner size="lg" />
      </div>
    );
  }

  return isAuthenticated ? children : null;
};
