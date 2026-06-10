import { create } from 'zustand';

export const useThemeStore = create((set) => ({
  theme: localStorage.getItem('app_theme') || 'dark',
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('app_theme', newTheme);
    return { theme: newTheme };
  }),
}));
