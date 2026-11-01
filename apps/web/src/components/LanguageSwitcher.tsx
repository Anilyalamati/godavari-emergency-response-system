import { useLanguage } from '../i18n/LanguageContext.js';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="lang-switcher-container" role="region" aria-label="Select interface language">
      <div className="lang-switcher-pills">
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`lang-pill ${language === 'en' ? 'lang-pill-active' : ''}`}
          aria-pressed={language === 'en'}
          aria-label="Switch to English"
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setLanguage('te')}
          className={`lang-pill ${language === 'te' ? 'lang-pill-active' : ''}`}
          aria-pressed={language === 'te'}
          aria-label="Switch to Telugu"
        >
          తెలుగు
        </button>
      </div>
    </div>
  );
}
