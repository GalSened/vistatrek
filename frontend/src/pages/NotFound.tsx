/**
 * 404 Not Found Page
 * Displayed when user navigates to an invalid route
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  return (
    <div className="not-found-page" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="not-found-content glass-card">
        <span className="not-found-icon">🏔️</span>
        <h1>404</h1>
        <p>{t('errors.pageNotFound')}</p>
        <button className="primary-btn" onClick={() => navigate('/')}>
          {t('common.goHome')}
        </button>
      </div>
    </div>
  );
}
