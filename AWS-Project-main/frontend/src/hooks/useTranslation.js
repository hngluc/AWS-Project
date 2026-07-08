import { useLangStore } from '../store/langStore';
import { translations } from '../i18n/translations';

export const useTranslation = () => {
  const currentLang = useLangStore((state) => state.currentLang);

  const t = (key, params = {}) => {
    const langDict = translations[currentLang] || translations.en;
    let str = langDict[key] || translations.en[key] || key;
    
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`{${k}}`, 'g'), v);
      });
    }
    return str;
  };

  return { t, currentLang, setLang: useLangStore.getState().setLang };
};
