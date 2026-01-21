/**
 * Planner Page
 * Per PRD: Route planning with map, stop list, and suggestions
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  // Track if we've already attempted to plan the route (prevents infinite loop)
  const hasAttemptedPlan = useRef(false);

  // Load trip if needed
  useEffect(() => {
    const loadTrip = async () => {
      if (tripId && (!currentTrip || currentTrip.id !== tripId)) {
        setIsLoading(true);
        try {
          const trip = await tripApi.get(tripId);
          setTrip(trip);
        } catch {
          setError(t('planner.failedToLoad'));
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadTrip();
  }, [tripId, currentTrip, setTrip]);

  // Reset plan attempt tracking when trip changes
  useEffect(() => {
    hasAttemptedPlan.current = false;
  }, [currentTrip?.id]);

  // Plan route when trip is loaded but has no route
  useEffect(() => {
    const planRoute = async () => {
      if (
        currentTrip &&
        currentTrip.route.polyline.length === 0 &&
        !isPlanningRoute &&
        !hasAttemptedPlan.current
      ) {
        hasAttemptedPlan.current = true;
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
          setError(t('planner.failedToPlan'));
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
        <LoadingSpinner message={t('planner.loadingTrip')} />
      </div>
    );
  }

  if (!currentTrip) {
    return (
      <div className="planner-page error">
        <p>{error || t('planner.noTripSelected')}</p>
        <button onClick={() => navigate('/')}>{t('planner.goHome')}</button>
      </div>
    );
  }

  return (
    <div className={`planner-page view-${viewMode}`}>
      <header className="planner-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← {t('planner.back')}
        </button>
        <h1>{currentTrip.name}</h1>
        <div className="view-toggle">
          <button
            className={viewMode === 'map' ? 'active' : ''}
            onClick={() => setViewMode('map')}
          >
            {t('planner.map')}
          </button>
          <button
            className={viewMode === 'split' ? 'active' : ''}
            onClick={() => setViewMode('split')}
          >
            {t('planner.split')}
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            {t('planner.list')}
          </button>
        </div>
      </header>

      <main className="planner-main">
        {(viewMode === 'map' || viewMode === 'split') && (
          <div className="map-container">
            {isPlanningRoute ? (
              <LoadingSpinner message={t('planner.planningRoute')} />
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
              <h2>{t('planner.yourStops')} ({currentTrip.stops.length})</h2>
              <StopList
                stops={currentTrip.stops}
                onRemove={removeStop}
                onReorder={handleStopReorder}
                editable={true}
              />
            </section>

            {currentTrip.suggestions && currentTrip.suggestions.length > 0 && (
              <section className="suggestions-section">
                <h2>{t('planner.suggestedStops')}</h2>
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
            {Math.round(currentTrip.route.duration_seconds / 60)} {t('planner.minDrive')}
          </span>
          <span className="distance">
            {(currentTrip.route.distance_meters / 1000).toFixed(1)} {t('common.km')}
          </span>
          <span className="stops">{currentTrip.stops.length} {t('planner.stops')}</span>
        </div>
        <div className="footer-actions">
          <button
            className="view-report-btn"
            onClick={() => navigate(`/report/${currentTrip.id}`)}
          >
            {t('planner.viewReport')}
          </button>
          <button
            className="start-trip-btn"
            onClick={handleStartTrip}
            disabled={currentTrip.stops.length === 0}
          >
            {t('planner.startTrip')}
          </button>
        </div>
      </footer>
    </div>
  );
}
