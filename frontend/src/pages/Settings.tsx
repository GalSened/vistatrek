/**
 * Settings Page
 * Per PRD: User preferences and app settings
 */

import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { NavApp } from '../types';

export default function Settings() {
  const navigate = useNavigate();
  const { profile, settings, updateProfile, updateSettings, setNavApp } =
    useUser();

  const navAppOptions: { value: NavApp; label: string }[] = [
    { value: 'waze', label: 'Waze' },
    { value: 'google', label: 'Google Maps' },
    { value: 'apple', label: 'Apple Maps' },
  ];

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>Settings</h1>
      </header>

      <main className="settings-main">
        <section className="settings-section">
          <h2>Profile</h2>

          <div className="setting-item">
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              type="text"
              value={profile.name || ''}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder="Your name"
            />
          </div>

          <div className="setting-item slider-setting">
            <label>
              Hiking Score
              <span className="value">{profile.hiking_score}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={profile.hiking_score}
              onChange={(e) =>
                updateProfile({ hiking_score: parseInt(e.target.value) })
              }
            />
            <p className="setting-hint">
              Higher = more challenging trails and viewpoints
            </p>
          </div>

          <div className="setting-item slider-setting">
            <label>
              Foodie Score
              <span className="value">{profile.foodie_score}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={profile.foodie_score}
              onChange={(e) =>
                updateProfile({ foodie_score: parseInt(e.target.value) })
              }
            />
            <p className="setting-hint">
              Higher = more cafes and restaurants suggested
            </p>
          </div>

          <div className="setting-item slider-setting">
            <label>
              Patience Score
              <span className="value">{profile.patience_score}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={profile.patience_score}
              onChange={(e) =>
                updateProfile({ patience_score: parseInt(e.target.value) })
              }
            />
            <p className="setting-hint">
              Higher = more stops, longer detours OK
            </p>
          </div>
        </section>

        <section className="settings-section">
          <h2>Navigation</h2>

          <div className="setting-item">
            <label>Preferred Navigation App</label>
            <div className="radio-group">
              {navAppOptions.map((option) => (
                <label key={option.value} className="radio-option">
                  <input
                    type="radio"
                    name="nav-app"
                    value={option.value}
                    checked={profile.preferred_nav_app === option.value}
                    onChange={() => setNavApp(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>App Settings</h2>

          <div className="setting-item toggle-setting">
            <label htmlFor="gps-tracking">
              <span>GPS Tracking</span>
              <span className="setting-description">
                Enable real-time location tracking during trips
              </span>
            </label>
            <input
              id="gps-tracking"
              type="checkbox"
              checked={settings.gps_tracking}
              onChange={(e) =>
                updateSettings({ gps_tracking: e.target.checked })
              }
            />
          </div>

          <div className="setting-item toggle-setting">
            <label htmlFor="smart-alerts">
              <span>Smart Alerts</span>
              <span className="setting-description">
                Get notified about timing and pacing
              </span>
            </label>
            <input
              id="smart-alerts"
              type="checkbox"
              checked={settings.smart_alerts}
              onChange={(e) =>
                updateSettings({ smart_alerts: e.target.checked })
              }
            />
          </div>

          <div className="setting-item toggle-setting">
            <label htmlFor="feedback-popups">
              <span>Feedback Popups</span>
              <span className="setting-description">
                Quick rating popups after each stop
              </span>
            </label>
            <input
              id="feedback-popups"
              type="checkbox"
              checked={settings.feedback_popups}
              onChange={(e) =>
                updateSettings({ feedback_popups: e.target.checked })
              }
            />
          </div>

          <div className="setting-item toggle-setting">
            <label htmlFor="dark-mode">
              <span>Dark Mode</span>
              <span className="setting-description">
                Use dark theme for the app
              </span>
            </label>
            <input
              id="dark-mode"
              type="checkbox"
              checked={settings.dark_mode}
              onChange={(e) => updateSettings({ dark_mode: e.target.checked })}
            />
          </div>
        </section>

        <section className="settings-section">
          <h2>About</h2>
          <div className="about-info">
            <p>VistaTrek v0.1.0</p>
            <p>Discover nature's hidden gems along your route</p>
          </div>
        </section>
      </main>
    </div>
  );
}
