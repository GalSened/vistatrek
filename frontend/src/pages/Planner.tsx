/**
 * Planner Page
 * Per PRD: Route planning with map, stop list, and suggestions
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext';
import TripMap from '../components/map/TripMap';
import StopList from '../components/stops/StopList';
import SuggestionList from '../components/stops/SuggestionList';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { tripApi } from '../api';
import { PlanTripResponse } from '../types';

type ViewMode = 'map' | 'list' | 'split';

export default function Planner() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const {
    currentTrip,
    setTrip,
    setRoute,
    setSuggestions,
    addSuggestionAsStop,
    removeStop,
    reorderStops,
    startTrip,
    saveToHistory,
  } = useTrip();

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load trip if needed
  useEffect(() => {
    const loadTrip = async () => {
      if (tripId && (!currentTrip || currentTrip.id !== tripId)) {
        setIsLoading(true);
        try {
          const trip = await tripApi.get(tripId);
          setTrip(trip);
        } catch (err) {
          setError('Failed to load trip');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadTrip();
  }, [tripId, currentTrip, setTrip]);

  // Plan route when trip is loaded but has no route
  useEffect(() => {
    const planRoute = async () => {
      if (
        currentTrip &&
        currentTrip.route.polyline.length === 0 &&
        !isPlanningRoute
      ) {
        setIsPlanningRoute(true);
        try {
          const response: PlanTripResponse = await tripApi.plan({
            start_lat: currentTrip.start_location.lat,
            start_lon: currentTrip.start_location.lon,
            end_lat: currentTrip.end_location.lat,
            end_lon: currentTrip.end_location.lon,
            date: currentTrip.date,
            vibes: currentTrip.vibes,
          });

          setRoute(response.macro_route);
          setSuggestions(response.micro_stops);
        } catch (err) {
          console.error('Route planning failed:', err);
        } finally {
          setIsPlanningRoute(false);
        }
      }
    };

    planRoute();
  }, [currentTrip, isPlanningRoute, setRoute, setSuggestions]);

  const handleStartTrip = () => {
    if (currentTrip) {
      startTrip();
      saveToHistory();
      navigate(`/pilot/${currentTrip.id}`);
    }
  };

  const handleStopReorder = (newOrder: string[]) => {
    reorderStops(newOrder);
  };

  if (isLoading) {
    return (
      <div className="planner-page loading">
        <LoadingSpinner message="Loading trip..." />
      </div>
    );
  }

  if (!currentTrip) {
    return (
      <div className="planner-page error">
        <p>{error || 'No trip selected'}</p>
        <button onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  return (
    <div className={`planner-page view-${viewMode}`}>
      <header className="planner-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1>{currentTrip.name}</h1>
        <div className="view-toggle">
          <button
            className={viewMode === 'map' ? 'active' : ''}
            onClick={() => setViewMode('map')}
          >
            Map
          </button>
          <button
            className={viewMode === 'split' ? 'active' : ''}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>
      </header>

      <main className="planner-main">
        {(viewMode === 'map' || viewMode === 'split') && (
          <div className="map-container">
            {isPlanningRoute ? (
              <LoadingSpinner message="Planning route..." />
            ) : (
              <TripMap
                route={currentTrip.route}
                stops={currentTrip.stops}
                suggestions={currentTrip.suggestions}
                startLocation={currentTrip.start_location}
                endLocation={currentTrip.end_location}
                onSuggestionClick={addSuggestionAsStop}
              />
            )}
          </div>
        )}

        {(viewMode === 'list' || viewMode === 'split') && (
          <div className="stops-container">
            <section className="stops-section">
              <h2>Your Stops ({currentTrip.stops.length})</h2>
              <StopList
                stops={currentTrip.stops}
                onRemove={removeStop}
                onReorder={handleStopReorder}
                editable={true}
              />
            </section>

            {currentTrip.suggestions && currentTrip.suggestions.length > 0 && (
              <section className="suggestions-section">
                <h2>Suggested Stops</h2>
                <SuggestionList
                  suggestions={currentTrip.suggestions}
                  onAdd={addSuggestionAsStop}
                />
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="planner-footer">
        <div className="trip-summary">
          <span className="duration">
            {Math.round(currentTrip.route.duration_seconds / 60)} min drive
          </span>
          <span className="distance">
            {(currentTrip.route.distance_meters / 1000).toFixed(1)} km
          </span>
          <span className="stops">{currentTrip.stops.length} stops</span>
        </div>
        <button
          className="start-trip-btn"
          onClick={handleStartTrip}
          disabled={currentTrip.stops.length === 0}
        >
          Start Trip 🚗
        </button>
      </footer>
    </div>
  );
}
