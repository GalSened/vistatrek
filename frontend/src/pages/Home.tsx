/**
 * Home Page
 * Per PRD: Landing page with trip creation and history
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useTrip } from '../context/TripContext';
import LocationSearch from '../components/ui/LocationSearch';
import TripHistoryList from '../components/ui/TripHistoryList';
import OnboardingModal from '../components/ui/OnboardingModal';
import { Coordinates, Trip } from '../types';
import { tripApi } from '../api';

export default function Home() {
  const navigate = useNavigate();
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

  const vibeOptions = [
    { id: 'nature', label: 'Nature', emoji: '🌲' },
    { id: 'chill', label: 'Chill', emoji: '☕' },
    { id: 'hiking', label: 'Hiking', emoji: '🥾' },
    { id: 'foodie', label: 'Foodie', emoji: '🍕' },
    { id: 'adventure', label: 'Adventure', emoji: '🏔️' },
  ];

  const toggleVibe = (vibeId: string) => {
    setSelectedVibes((prev) =>
      prev.includes(vibeId)
        ? prev.filter((v) => v !== vibeId)
        : [...prev, vibeId]
    );
  };

  const handleCreateTrip = async () => {
    if (!startLocation || !endLocation) {
      setError('Please select start and end locations');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const trip = await tripApi.create({
        name: tripName || 'My Trip',
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
        <h1>VistaTrek</h1>
        <p className="tagline">Discover nature's hidden gems along your route</p>
        <button
          className="settings-btn"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>

      <main className="home-main">
        <section className="create-trip-section">
          <h2>Plan a New Trip</h2>

          <div className="form-group">
            <label htmlFor="trip-name">Trip Name</label>
            <input
              id="trip-name"
              type="text"
              placeholder="Weekend Getaway"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Start Location</label>
            <LocationSearch
              placeholder="Where are you starting from?"
              onSelect={setStartLocation}
              value={startLocation}
            />
          </div>

          <div className="form-group">
            <label>End Location</label>
            <LocationSearch
              placeholder="Where are you going?"
              onSelect={setEndLocation}
              value={endLocation}
            />
          </div>

          <div className="form-group">
            <label htmlFor="trip-date">Date</label>
            <input
              id="trip-date"
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Trip Vibes</label>
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
                  <span className="vibe-label">{vibe.label}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error-message">{error}</p>}

          <button
            className="create-trip-btn"
            onClick={handleCreateTrip}
            disabled={isCreating || !startLocation || !endLocation}
          >
            {isCreating ? 'Creating...' : 'Plan My Trip'}
          </button>
        </section>

        {tripHistory.length > 0 && (
          <section className="trip-history-section">
            <h2>Recent Trips</h2>
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
