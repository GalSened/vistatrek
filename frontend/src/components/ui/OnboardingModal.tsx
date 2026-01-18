/**
 * Onboarding Modal Component
 * Per PRD: First-time user setup
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
      <div className="onboarding-modal">
        {step === 'welcome' && (
          <div className="onboarding-step welcome">
            <h2>Welcome to VistaTrek! 🏔️</h2>
            <p>
              Discover hidden gems along your route - viewpoints, cafes, and
              natural wonders that make road trips unforgettable.
            </p>
            <div className="features-preview">
              <div className="feature">
                <span className="feature-icon">🗺️</span>
                <span>Smart Route Planning</span>
              </div>
              <div className="feature">
                <span className="feature-icon">💎</span>
                <span>Golden Triangle Clusters</span>
              </div>
              <div className="feature">
                <span className="feature-icon">🧭</span>
                <span>Real-time Navigation</span>
              </div>
            </div>
          </div>
        )}

        {step === 'preferences' && (
          <div className="onboarding-step preferences">
            <h2>Tell us about yourself</h2>
            <p>Help us personalize your trip suggestions</p>

            <div className="form-group">
              <label htmlFor="onboard-name">Your Name (optional)</label>
              <input
                id="onboard-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            <div className="form-group slider-group">
              <label>
                How much do you enjoy hiking?
                <span className="score-value">{hikingScore}/10</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={hikingScore}
                onChange={(e) => setHikingScore(parseInt(e.target.value))}
              />
              <p className="hint">
                Higher = more challenging viewpoints suggested
              </p>
            </div>

            <div className="form-group slider-group">
              <label>
                How much do you love food stops?
                <span className="score-value">{foodieScore}/10</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={foodieScore}
                onChange={(e) => setFoodieScore(parseInt(e.target.value))}
              />
              <p className="hint">Higher = more cafes and restaurants</p>
            </div>
          </div>
        )}

        {step === 'nav-app' && (
          <div className="onboarding-step nav-app">
            <h2>Choose your navigation app</h2>
            <p>We'll open this app when you're ready to drive</p>

            <div className="nav-app-options">
              {[
                { value: 'waze' as NavApp, label: 'Waze', icon: '🚗' },
                { value: 'google' as NavApp, label: 'Google Maps', icon: '🗺️' },
                { value: 'apple' as NavApp, label: 'Apple Maps', icon: '🍎' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`nav-app-btn ${
                    selectedNavApp === option.value ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedNavApp(option.value)}
                >
                  <span className="nav-app-icon">{option.icon}</span>
                  <span className="nav-app-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="onboarding-step complete">
            <h2>You're all set! 🎉</h2>
            <p>Start planning your first adventure</p>
            <div className="complete-icon">🏔️</div>
          </div>
        )}

        <div className="onboarding-actions">
          {step !== 'welcome' && step !== 'complete' && (
            <button type="button" className="skip-btn" onClick={handleSkip}>
              Skip
            </button>
          )}
          <button type="button" className="next-btn" onClick={handleNext}>
            {step === 'complete' ? "Let's Go!" : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
