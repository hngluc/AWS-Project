import { create } from 'zustand';
import { authService } from '../services/auth';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isGuest: false,
  isLoading: true,
  error: null,
  config: authService.getConfig(),

  initialize: async () => {
    try {
      const user = await authService.getCurrentUser();
      set({ user, isAuthenticated: !!user, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false, error: error.message });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const user = await authService.login(email, password);
      set({ user, isAuthenticated: true, isLoading: false });
      return user;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  signUp: async (email, password, name) => {
    set({ error: null });
    try {
      const result = await authService.signUp(email, password, name);
      return result;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  confirmSignUp: async (email, code) => {
    set({ error: null });
    try {
      const result = await authService.confirmSignUp(email, code);
      return result;
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  resendConfirmationCode: async (email) => {
    set({ error: null });
    try {
      await authService.resendConfirmationCode(email);
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  enterGuestMode: () => {
    sessionStorage.setItem('smart_image_guest', 'true');
    set({ user: null, isAuthenticated: false, isGuest: true, isLoading: false, error: null });
  },

  exitGuestMode: () => {
    sessionStorage.removeItem('smart_image_guest');
    set({ isGuest: false });
  },

  logout: () => {
    authService.logout();
    sessionStorage.removeItem('smart_image_guest');
    set({ user: null, isAuthenticated: false, isGuest: false, error: null });
  },

  updateUserProfile: (updates) => {
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            ...(updates.displayName ? { name: updates.displayName } : {}),
            ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
            ...(updates.phoneNumber !== undefined ? { phoneNumber: updates.phoneNumber } : {}),
          }
        : state.user,
    }));
  },

  clearError: () => set({ error: null }),
}));

// Initialize guest state from storage immediately
if (typeof window !== 'undefined' && sessionStorage.getItem('smart_image_guest') === 'true') {
  useAuthStore.setState({ isGuest: true });
}
