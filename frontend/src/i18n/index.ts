/**
 * i18n Configuration
 * Hebrew as primary language with RTL support
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import he from './locales/he.json';
import en from './locales/en.json';

// RTL languages
const RTL_LANGUAGES = ['he', 'ar'];

// Update document direction based on language
export function updateDirection(language: string) {
  const dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', language);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      he: { translation: he },
      en: { translation: en },
    },
    lng: 'he', // Hebrew as default
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Set initial direction
updateDirection(i18n.language);

// Update direction when language changes
i18n.on('languageChanged', (lng) => {
  updateDirection(lng);
});

export default i18n;
