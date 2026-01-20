/**
 * Settings Page
 * Per PRD: User preferences and app settings
 * iOS-style 2026 design with glass morphism
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { NavApp } from '../types';

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, settings, updateProfile, updateSettings, setNavApp } =
    useUser();

  const navAppOptions: { value: NavApp; labelKey: string; icon: string }[] = [
    { value: 'waze', labelKey: 'settings.waze', icon: '🗺️' },
    { value: 'google', labelKey: 'settings.googleMaps', icon: '📍' },
    { value: 'apple', labelKey: 'settings.appleMaps', icon: '🍎' },
  ];

  return (
    <div className="settings-page">
      <header className="settings-header glass-header">
        <button className="back-btn icon-btn" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1>{t('settings.title')}</h1>
        <div className="header-spacer" />
      </header>

      <main className="settings-main">
        <section className="settings-section glass-card">
          <div className="section-header">
            <span className="section-icon">👤</span>
            <h2>{t('settings.profile')}</h2>
          </div>

          <div className="setting-item">
            <label htmlFor="profile-name">{t('settings.name')}</label>
            <input
              id="profile-name"
              type="text"
              value={profile.name || ''}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder={t('settings.namePlaceholder')}
              className="glass-input"
            />
          </div>

          <div className="setting-item slider-setting">
            <div className="setting-label-row">
              <label>
                <span className="label-icon">🥾</span>
                {t('settings.hikingScore')}
              </label>
              <span className="value-badge">{profile.hiking_score}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={profile.hiking_score}
              onChange={(e) =>
                updateProfile({ hiking_score: parseInt(e.target.value) })
              }
              className="ios-slider"
            />
            <p className="setting-hint">
              {t('settings.hikingHint')}
            </p>
          </div>

          <div className="setting-item slider-setting">
            <div className="setting-label-row">
              <label>
                <span className="label-icon">🍕</span>
                {t('settings.foodieScore')}
              </label>
              <span className="value-badge">{profile.foodie_score}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={profile.foodie_score}
              onChange={(e) =>
                updateProfile({ foodie_score: parseInt(e.target.value) })
              }
              className="ios-slider"
            />
            <p className="setting-hint">
              {t('settings.foodieHint')}
            </p>
          </div>

          <div className="setting-item slider-setting">
            <div className="setting-label-row">
              <label>
                <span className="label-icon">⏱️</span>
                {t('settings.patienceScore')}
              </label>
              <span className="value-badge">{profile.patience_score}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={profile.patience_score}
              onChange={(e) =>
                updateProfile({ patience_score: parseInt(e.target.value) })
              }
              className="ios-slider"
            />
            <p className="setting-hint">
              {t('settings.patienceHint')}
            </p>
          </div>
        </section>

        <section className="settings-section glass-card">
          <div className="section-header">
            <span className="section-icon">🧭</span>
            <h2>{t('settings.navigation')}</h2>
          </div>

          <div className="setting-item nav-app-setting">
            <label>{t('settings.preferredNavApp')}</label>
            <div className="nav-app-selector">
              {navAppOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`nav-app-option ${
                    profile.preferred_nav_app === option.value ? 'selected' : ''
                  }`}
                  onClick={() => setNavApp(option.value)}
                >
                  <span className="nav-app-icon">{option.icon}</span>
                  <span className="nav-app-label">{t(option.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section glass-card">
          <div className="section-header">
            <span className="section-icon">⚙️</span>
            <h2>{t('settings.appSettings')}</h2>
          </div>

          <div className="setting-item toggle-setting">
            <div className="toggle-content">
              <div className="toggle-label">
                <span className="label-icon">📡</span>
                <div>
                  <span className="toggle-title">{t('settings.gpsTracking')}</span>
                  <span className="toggle-description">
                    {t('settings.gpsTrackingDesc')}
                  </span>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.gps_tracking}
                  onChange={(e) =>
                    updateSettings({ gps_tracking: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="setting-item toggle-setting">
            <div className="toggle-content">
              <div className="toggle-label">
                <span className="label-icon">🔔</span>
                <div>
                  <span className="toggle-title">{t('settings.smartAlerts')}</span>
                  <span className="toggle-description">
                    {t('settings.smartAlertsDesc')}
                  </span>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.smart_alerts}
                  onChange={(e) =>
                    updateSettings({ smart_alerts: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="setting-item toggle-setting">
            <div className="toggle-content">
              <div className="toggle-label">
                <span className="label-icon">⭐</span>
                <div>
                  <span className="toggle-title">{t('settings.feedbackPopups')}</span>
                  <span className="toggle-description">
                    {t('settings.feedbackPopupsDesc')}
                  </span>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.feedback_popups}
                  onChange={(e) =>
                    updateSettings({ feedback_popups: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="setting-item toggle-setting">
            <div className="toggle-content">
              <div className="toggle-label">
                <span className="label-icon">🌙</span>
                <div>
                  <span className="toggle-title">{t('settings.darkMode')}</span>
                  <span className="toggle-description">
                    {t('settings.darkModeDesc')}
                  </span>
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.dark_mode}
                  onChange={(e) => updateSettings({ dark_mode: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </section>

        <section className="settings-section glass-card about-section">
          <div className="section-header">
            <span className="section-icon">ℹ️</span>
            <h2>{t('settings.about')}</h2>
          </div>
          <div className="about-info">
            <div className="app-logo">🏔️</div>
            <h3>{t('app.name')}</h3>
            <p className="version">{t('app.version')} 0.1.0</p>
            <p className="motto">{t('app.motto')}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
