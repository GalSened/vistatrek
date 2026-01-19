/**
 * Onboarding Modal Component
 * Per PRD: First-time user setup
 * iOS-style 2026 design with glass morphism
 */

import { useState } from 'react';
import { useUser } from '../../context/UserContext';
import { NavApp } from '../../types';

interface OnboardingModalProps {
  onClose: () => void;
}

type Step = 'welcome' | 'preferences' | 'nav-app' | 'complete';

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
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
            <h2>Welcome to VistaTrek!</h2>
            <p className="welcome-subtitle">
              Discover hidden gems along your route - viewpoints, cafes, and
              natural wonders that make road trips unforgettable.
            </p>
            <div className="features-preview">
              <div className="feature glass-feature">
                <span className="feature-icon">🗺️</span>
                <div className="feature-text">
                  <span className="feature-title">Smart Route Planning</span>
                  <span className="feature-desc">AI-powered stop suggestions</span>
                </div>
              </div>
              <div className="feature glass-feature">
                <span className="feature-icon">💎</span>
                <div className="feature-text">
                  <span className="feature-title">Golden Clusters</span>
                  <span className="feature-desc">Perfect 3-stop combinations</span>
                </div>
              </div>
              <div className="feature glass-feature">
                <span className="feature-icon">🧭</span>
                <div className="feature-text">
                  <span className="feature-title">Pilot Mode</span>
                  <span className="feature-desc">Real-time trip guidance</span>
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
            <h2>Tell us about yourself</h2>
            <p className="step-subtitle">Help us personalize your trip suggestions</p>

            <div className="form-group">
              <label htmlFor="onboard-name">Your Name (optional)</label>
              <input
                id="onboard-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="glass-input"
              />
            </div>

            <div className="form-group slider-group">
              <div className="slider-header">
                <label>
                  <span className="label-icon">🥾</span>
                  How much do you enjoy hiking?
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
                Higher = more challenging viewpoints suggested
              </p>
            </div>

            <div className="form-group slider-group">
              <div className="slider-header">
                <label>
                  <span className="label-icon">🍕</span>
                  How much do you love food stops?
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
              <p className="hint">Higher = more cafes and restaurants</p>
            </div>
          </div>
        )}

        {step === 'nav-app' && (
          <div className="onboarding-step nav-app">
            <div className="step-icon-container">
              <span className="step-icon">🧭</span>
            </div>
            <h2>Choose your navigation app</h2>
            <p className="step-subtitle">We'll open this app when you're ready to drive</p>

            <div className="nav-app-options">
              {[
                { value: 'waze' as NavApp, label: 'Waze', icon: '🚗', desc: 'Community traffic alerts' },
                { value: 'google' as NavApp, label: 'Google Maps', icon: '🗺️', desc: 'Comprehensive directions' },
                { value: 'apple' as NavApp, label: 'Apple Maps', icon: '🍎', desc: 'Native iOS integration' },
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
                    <span className="nav-app-desc">{option.desc}</span>
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
            <h2>You're all set!</h2>
            <p className="step-subtitle">Start planning your first adventure</p>
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
              Skip for now
            </button>
          )}
          <button type="button" className="next-btn primary-btn" onClick={handleNext}>
            {step === 'complete' ? "Let's Go!" : 'Continue'}
            <span className="btn-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
