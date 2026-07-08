import { useTranslation } from '../../hooks/useTranslation';

export const LanguageSwitcher = () => {
  const { currentLang, setLang } = useTranslation();

  const toggleLang = () => {
    setLang(currentLang === 'en' ? 'vi' : 'en');
  };

  return (
    <button
      onClick={toggleLang}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem 0.75rem',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      aria-label="Toggle language"
    >
      <span style={{ opacity: currentLang === 'en' ? 1 : 0.5 }}>EN</span>
      <span style={{ opacity: 0.5 }}>|</span>
      <span style={{ opacity: currentLang === 'vi' ? 1 : 0.5 }}>VI</span>
    </button>
  );
};
