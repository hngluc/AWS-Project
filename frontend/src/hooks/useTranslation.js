import { useLangStore } from '../store/langStore';
import { translations } from '../i18n/translations';

export const useTranslation = () => {
  const currentLang = useLangStore((state) => state.currentLang);

  const t = (key) => {
    const langDict = translations[currentLang] || translations.en;
    return langDict[key] || translations.en[key] || key;
  };

  return { t, currentLang, setLang: useLangStore.getState().setLang };
};
