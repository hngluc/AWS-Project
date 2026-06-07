import { create } from 'zustand';

let toastIdCounter = 0;

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: ({ message, title, type = 'info', duration = 5000 }) => {
    const id = ++toastIdCounter;
    set((state) => ({
      toasts: [...state.toasts, { id, message, title, type, duration, createdAt: Date.now() }],
    }));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

/**
 * useToast hook – convenience API for showing toast notifications.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('Image uploaded!');
 *   toast.error('Upload failed', 'Please try again.');
 */
export function useToast() {
  const addToast = useToastStore((s) => s.addToast);

  return {
    success: (message, title = 'Success') =>
      addToast({ message, title, type: 'success' }),

    error: (message, title = 'Error') =>
      addToast({ message, title, type: 'error' }),

    warning: (message, title = 'Warning') =>
      addToast({ message, title, type: 'warning' }),

    info: (message, title = 'Info') =>
      addToast({ message, title, type: 'info' }),

    custom: (opts) => addToast(opts),
  };
}
