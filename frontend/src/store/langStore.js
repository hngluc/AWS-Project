import { create } from 'zustand';

export const useLangStore = create((set) => ({
  currentLang: localStorage.getItem('app_lang') || 'en',
  setLang: (lang) => {
    localStorage.setItem('app_lang', lang);
    set({ currentLang: lang });
  }
}));
