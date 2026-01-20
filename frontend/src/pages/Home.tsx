/**
 * Home Page
 * Per PRD: Landing page with trip creation and history
 * iOS-style 2026 design with glass morphism
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { useTrip } from '../context/TripContext';
import LocationSearch from '../components/ui/LocationSearch';
import TripHistoryList from '../components/ui/TripHistoryList';
import OnboardingModal from '../components/ui/OnboardingModal';
import { Coordinates, Trip } from '../types';
import { tripApi } from '../api';

export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useUser();
  const { tripHistory, setTrip } = useTrip();

  const [startLocation, setStartLocation] = useState<Coordinates | null>(null);
  const [endLocation, setEndLocation] = useState<Coordinates | null>(null);
  const [tripName, setTripName] = useState('');
  const [tripDate, setTripDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    !profile.onboarding_completed
  );

  // Ref-based guard to prevent double-submit (handles rapid clicks before state updates)
  const isSubmittingRef = useRef(false);

  const vibeOptions = [
    { id: 'nature', labelKey: 'vibes.nature', emoji: '🌲' },
    { id: 'chill', labelKey: 'vibes.chill', emoji: '☕' },
    { id: 'hiking', labelKey: 'vibes.hiking', emoji: '🥾' },
    { id: 'foodie', labelKey: 'vibes.foodie', emoji: '🍕' },
    { id: 'adventure', labelKey: 'vibes.adventure', emoji: '🏔️' },
  ];

  const toggleVibe = (vibeId: string) => {
    setSelectedVibes((prev) =>
      prev.includes(vibeId)
        ? prev.filter((v) => v !== vibeId)
        : [...prev, vibeId]
    );
  };

  const handleCreateTrip = async () => {
    // Double-submit protection using ref (synchronous check)
    if (isSubmittingRef.current) {
      return;
    }

    if (!startLocation || !endLocation) {
      setError('Please select start and end locations');
      return;
    }

    // Set ref immediately to block concurrent clicks
    isSubmittingRef.current = true;
    setIsCreating(true);
    setError(null);

    try {
      const trip = await tripApi.create({
        name: tripName.trim().slice(0, 100) || 'My Trip',
        start_location: startLocation,
        end_location: endLocation,
        date: tripDate,
        vibes: selectedVibes.length > 0 ? selectedVibes : undefined,
      });

      setTrip(trip);
      navigate(`/planner/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
    } finally {
      setIsCreating(false);
      isSubmittingRef.current = false;
    }
  };

  const handleSelectTrip = (trip: Trip) => {
    setTrip(trip);
    if (trip.status === 'active') {
      navigate(`/pilot/${trip.id}`);
    } else {
      navigate(`/planner/${trip.id}`);
    }
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="header-content">
          <div className="brand">
            <span className="brand-icon">🏔️</span>
            <div className="brand-text">
              <h1>{t('app.name')}</h1>
              <p className="tagline">{t('app.tagline')}</p>
            </div>
          </div>
          <button
            className="icon-btn glass-btn"
            onClick={() => navigate('/settings')}
            aria-label={t('settings.title')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="create-trip-section glass-card">
          <div className="section-header">
            <span className="section-icon">✨</span>
            <h2>{t('home.planNewTrip')}</h2>
          </div>

          <div className="form-group">
            <label htmlFor="trip-name">{t('home.tripName')}</label>
            <input
              id="trip-name"
              type="text"
              placeholder={t('home.tripNamePlaceholder')}
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              maxLength={100}
              className="glass-input"
            />
          </div>

          <div className="location-inputs">
            <div className="form-group">
              <label>
                <span className="label-icon">📍</span>
                {t('home.start')}
              </label>
              <LocationSearch
                placeholder={t('home.startPlaceholder')}
                onSelect={setStartLocation}
                value={startLocation}
              />
            </div>

            <div className="route-line">
              <div className="route-dot" />
              <div className="route-dash" />
              <div className="route-dot" />
            </div>

            <div className="form-group">
              <label>
                <span className="label-icon">🏁</span>
                {t('home.destination')}
              </label>
              <LocationSearch
                placeholder={t('home.destinationPlaceholder')}
                onSelect={setEndLocation}
                value={endLocation}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="trip-date">
              <span className="label-icon">📅</span>
              {t('home.date')}
            </label>
            <input
              id="trip-date"
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className="glass-input"
            />
          </div>

          <div className="form-group">
            <label>
              <span className="label-icon">🎯</span>
              {t('home.vibes')}
            </label>
            <div className="vibe-selector">
              {vibeOptions.map((vibe) => (
                <button
                  key={vibe.id}
                  type="button"
                  className={`vibe-chip ${
                    selectedVibes.includes(vibe.id) ? 'selected' : ''
                  }`}
                  onClick={() => toggleVibe(vibe.id)}
                >
                  <span className="vibe-emoji">{vibe.emoji}</span>
                  <span className="vibe-label">{t(vibe.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="error-message glass-error">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <button
            className="create-trip-btn primary-btn"
            onClick={handleCreateTrip}
            disabled={isCreating || !startLocation || !endLocation}
          >
            {isCreating ? (
              <>
                <span className="btn-spinner" />
                {t('home.creating')}
              </>
            ) : (
              <>
                <span className="btn-icon">🚗</span>
                {t('home.planMyTrip')}
              </>
            )}
          </button>
        </section>

        {tripHistory.length > 0 && (
          <section className="trip-history-section glass-card">
            <div className="section-header">
              <span className="section-icon">📜</span>
              <h2>{t('home.recentTrips')}</h2>
            </div>
            <TripHistoryList
              trips={tripHistory}
              onSelect={handleSelectTrip}
            />
          </section>
        )}
      </main>

      {showOnboarding && (
        <OnboardingModal onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
