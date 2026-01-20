/**
 * Onboarding Modal Component
 * Per PRD: First-time user setup
 * iOS-style 2026 design with glass morphism
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/UserContext';
import { NavApp } from '../../types';

interface OnboardingModalProps {
  onClose: () => void;
}

type Step = 'welcome' | 'preferences' | 'nav-app' | 'complete';

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  const { t } = useTranslation();
  const { updateProfile, setNavApp, completeOnboarding } = useUser();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [hikingScore, setHikingScore] = useState(5);
  const [foodieScore, setFoodieScore] = useState(5);
  const [selectedNavApp, setSelectedNavApp] = useState<NavApp>('waze');

  const steps: Step[] = ['welcome', 'preferences', 'nav-app', 'complete'];
  const currentStepIndex = steps.indexOf(step);

  const handleNext = () => {
    switch (step) {
      case 'welcome':
        setStep('preferences');
        break;
      case 'preferences':
        updateProfile({
          name: name || undefined,
          hiking_score: hikingScore,
          foodie_score: foodieScore,
        });
        setStep('nav-app');
        break;
      case 'nav-app':
        setNavApp(selectedNavApp);
        setStep('complete');
        break;
      case 'complete':
        completeOnboarding();
        onClose();
        break;
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    onClose();
  };

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-modal glass-modal">
        {/* Progress dots */}
        <div className="onboarding-progress">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`progress-dot ${i === currentStepIndex ? 'active' : ''} ${i < currentStepIndex ? 'completed' : ''}`}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="onboarding-step welcome">
            <div className="welcome-icon-container">
              <span className="welcome-icon">🏔️</span>
            </div>
            <h2>{t('onboarding.welcome.title')}</h2>
            <p className="welcome-subtitle">
              {t('onboarding.welcome.subtitle')}
            </p>
            <div className="features-preview">
              <div className="feature glass-feature">
                <span className="feature-icon">🗺️</span>
                <div className="feature-text">
                  <span className="feature-title">{t('onboarding.features.smartRoute')}</span>
                  <span className="feature-desc">{t('onboarding.features.smartRouteDesc')}</span>
                </div>
              </div>
              <div className="feature glass-feature">
                <span className="feature-icon">💎</span>
                <div className="feature-text">
                  <span className="feature-title">{t('onboarding.features.goldenClusters')}</span>
                  <span className="feature-desc">{t('onboarding.features.goldenClustersDesc')}</span>
                </div>
              </div>
              <div className="feature glass-feature">
                <span className="feature-icon">🧭</span>
                <div className="feature-text">
                  <span className="feature-title">{t('onboarding.features.pilotMode')}</span>
                  <span className="feature-desc">{t('onboarding.features.pilotModeDesc')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'preferences' && (
          <div className="onboarding-step preferences">
            <div className="step-icon-container">
              <span className="step-icon">👤</span>
            </div>
            <h2>{t('onboarding.preferences.title')}</h2>
            <p className="step-subtitle">{t('onboarding.preferences.subtitle')}</p>

            <div className="form-group">
              <label htmlFor="onboard-name">{t('onboarding.preferences.nameLabel')}</label>
              <input
                id="onboard-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('onboarding.preferences.namePlaceholder')}
                className="glass-input"
              />
            </div>

            <div className="form-group slider-group">
              <div className="slider-header">
                <label>
                  <span className="label-icon">🥾</span>
                  {t('onboarding.preferences.hikingQuestion')}
                </label>
                <span className="value-badge">{hikingScore}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={hikingScore}
                onChange={(e) => setHikingScore(parseInt(e.target.value))}
                className="ios-slider"
              />
              <p className="hint">
                {t('onboarding.preferences.hikingHint')}
              </p>
            </div>

            <div className="form-group slider-group">
              <div className="slider-header">
                <label>
                  <span className="label-icon">🍕</span>
                  {t('onboarding.preferences.foodieQuestion')}
                </label>
                <span className="value-badge">{foodieScore}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={foodieScore}
                onChange={(e) => setFoodieScore(parseInt(e.target.value))}
                className="ios-slider"
              />
              <p className="hint">{t('onboarding.preferences.foodieHint')}</p>
            </div>
          </div>
        )}

        {step === 'nav-app' && (
          <div className="onboarding-step nav-app">
            <div className="step-icon-container">
              <span className="step-icon">🧭</span>
            </div>
            <h2>{t('onboarding.navApp.title')}</h2>
            <p className="step-subtitle">{t('onboarding.navApp.subtitle')}</p>

            <div className="nav-app-options">
              {[
                { value: 'waze' as NavApp, label: 'Waze', icon: '🚗', descKey: 'onboarding.navApp.wazeDesc' },
                { value: 'google' as NavApp, label: 'Google Maps', icon: '🗺️', descKey: 'onboarding.navApp.googleDesc' },
                { value: 'apple' as NavApp, label: 'Apple Maps', icon: '🍎', descKey: 'onboarding.navApp.appleDesc' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`nav-app-btn glass-option ${
                    selectedNavApp === option.value ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedNavApp(option.value)}
                >
                  <span className="nav-app-icon">{option.icon}</span>
                  <div className="nav-app-text">
                    <span className="nav-app-label">{option.label}</span>
                    <span className="nav-app-desc">{t(option.descKey)}</span>
                  </div>
                  {selectedNavApp === option.value && (
                    <span className="check-icon">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="onboarding-step complete">
            <div className="complete-icon-container">
              <span className="complete-icon">🎉</span>
            </div>
            <h2>{t('onboarding.complete.title')}</h2>
            <p className="step-subtitle">{t('onboarding.complete.subtitle')}</p>
            <div className="completion-graphic">
              <span className="mountain-icon">🏔️</span>
              <span className="car-icon">🚗</span>
              <span className="sun-icon">☀️</span>
            </div>
          </div>
        )}

        <div className="onboarding-actions">
          {step !== 'welcome' && step !== 'complete' && (
            <button type="button" className="skip-btn glass-btn" onClick={handleSkip}>
              {t('onboarding.skipForNow')}
            </button>
          )}
          <button type="button" className="next-btn primary-btn" onClick={handleNext}>
            {step === 'complete' ? t('onboarding.letsGo') : t('onboarding.continue')}
            <span className="btn-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
