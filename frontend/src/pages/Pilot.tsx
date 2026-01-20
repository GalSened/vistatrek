/**
 * Pilot Page
 * Per PRD: Active trip navigation with real-time tracking
 * Features: WakeLock, Pacing Engine, Geofence Auto-Arrival
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTrip } from '../context/TripContext';
import { useUser } from '../context/UserContext';
import TripMap from '../components/map/TripMap';
import PilotStopCard from '../components/stops/PilotStopCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useGeolocation } from '../hooks/useGeolocation';
import { useWakeLock } from '../hooks/useWakeLock';
import { usePacing, formatTime } from '../hooks/usePacing';
import { useGeofence } from '../hooks/useGeofence';
import { generateNavLink } from '../utils/deepLinks';
import { tripApi } from '../api';
import { Stop, Coordinates } from '../types';

export default function Pilot() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const { t } = useTranslation();
  const { currentTrip, setTrip, completeStop, skipStop } = useTrip();
  const { profile, settings } = useUser();
  const { position, error: geoError, isTracking } = useGeolocation();

  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showArrivalPrompt, setShowArrivalPrompt] = useState(false);

  // Keep screen awake during pilot mode
  const { isActive: wakeLockActive } = useWakeLock(true);

  // Get current stop for pacing and geofence
  const currentStopIndex = currentTrip?.execution?.current_stop_index ?? 0;
  const currentStop: Stop | undefined = currentTrip?.stops[currentStopIndex];

  // Pacing engine - 30 second updates
  const { pacingInfo, currentTime } = usePacing(currentStop);

  // Geofence auto-arrival detection
  const handleAutoArrival = useCallback(() => {
    if (settings.smart_alerts) {
      setShowArrivalPrompt(true);
    }
  }, [settings.smart_alerts]);

  const positionCoords: Coordinates | null = position
    ? { lat: position.lat, lon: position.lon }
    : null;

  const { isWithinGeofence, distanceMeters, dwellProgress } = useGeofence(
    positionCoords,
    currentStop,
    handleAutoArrival,
    { radiusMeters: 200, dwellTimeMs: 5000 }
  );

  // Load trip if needed
  useEffect(() => {
    const loadTrip = async () => {
      if (tripId && (!currentTrip || currentTrip.id !== tripId)) {
        setIsLoading(true);
        try {
          const trip = await tripApi.get(tripId);
          setTrip(trip);
        } catch {
          navigate('/');
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadTrip();
  }, [tripId, currentTrip, setTrip, navigate]);

  if (isLoading) {
    return (
      <div className="pilot-page loading">
        <LoadingSpinner message={t('pilot.loadingTrip')} />
      </div>
    );
  }

  if (!currentTrip || !currentTrip.execution) {
    return (
      <div className="pilot-page error">
        <p>{t('pilot.noActiveTrip')}</p>
        <button onClick={() => navigate('/')}>{t('pilot.goHome')}</button>
      </div>
    );
  }

  // currentStopIndex and currentStop are defined above for pacing/geofence hooks
  const nextStop: Stop | undefined = currentTrip.stops[currentStopIndex + 1];
  const completedCount = currentTrip.execution.completed_stops.length;
  const totalStops = currentTrip.stops.length;
  const progress = totalStops > 0 ? (completedCount / totalStops) * 100 : 0;

  const handleConfirmArrival = () => {
    if (currentStop) {
      completeStop(currentStop.id);
    }
    setShowArrivalPrompt(false);
  };

  const handleDismissArrival = () => {
    setShowArrivalPrompt(false);
  };

  const handleNavigate = () => {
    if (currentStop) {
      const navUrl = generateNavLink(
        currentStop.coordinates,
        profile.preferred_nav_app,
        currentStop.name
      );
      window.open(navUrl, '_blank');
    }
  };

  const handleArrive = () => {
    if (currentStop) {
      completeStop(currentStop.id);
    }
  };

  const handleSkip = () => {
    if (currentStop) {
      skipStop(currentStop.id);
    }
  };

  const handleEndTrip = () => {
    navigate('/');
  };

  // Trip completed
  if (currentStopIndex >= totalStops) {
    return (
      <div className="pilot-page completed">
        <div className="completion-screen">
          <h1>🎉 {t('pilot.tripComplete')}</h1>
          <p>
            {t('pilot.youVisited')} {completedCount} {t('pilot.of')} {totalStops} {t('pilot.stopsText')}
          </p>
          <div className="trip-stats">
            <div className="stat">
              <span className="value">
                {(currentTrip.route.distance_meters / 1000).toFixed(1)}
              </span>
              <span className="label">{t('pilot.kmTraveled')}</span>
            </div>
            <div className="stat">
              <span className="value">
                {Math.round(currentTrip.route.duration_seconds / 60)}
              </span>
              <span className="label">{t('pilot.minutes')}</span>
            </div>
          </div>
          <button className="finish-btn" onClick={handleEndTrip}>
            {t('pilot.finish')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pilot-page">
      <header className="pilot-header">
        <button className="end-trip-btn" onClick={handleEndTrip}>
          {t('pilot.endTrip')}
        </button>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
          <span className="progress-text">
            {completedCount + 1} / {totalStops}
          </span>
        </div>
        <button
          className="chat-btn"
          onClick={() => setShowChat(!showChat)}
          aria-label={t('pilot.chat')}
        >
          💬
        </button>
      </header>

      {/* Pacing Status Bar */}
      {pacingInfo && currentStop && (
        <div className={`pacing-status pacing-${pacingInfo.status}`}>
          <div className="pacing-time">
            <span className="current-time">{formatTime(currentTime.toISOString())}</span>
            <span className="separator">/</span>
            <span className="planned-time">{formatTime(currentStop.planned_arrival)}</span>
          </div>
          <span className="pacing-label">
            {pacingInfo.status === 'early' && `⏰ ${t('pilot.aheadOfSchedule')}`}
            {pacingInfo.status === 'on_time' && `✓ ${t('pilot.onTime')}`}
            {pacingInfo.status === 'late' && `⚠️ ${t('pilot.runningLate')}`}
          </span>
          {pacingInfo.suggestion && (
            <span className="pacing-suggestion">{pacingInfo.suggestion}</span>
          )}
        </div>
      )}

      {/* Geofence Proximity Indicator */}
      {isWithinGeofence && distanceMeters !== null && (
        <div className="geofence-indicator">
          <div className="geofence-progress" style={{ width: `${dwellProgress}%` }} />
          <span>📍 {Math.round(distanceMeters)}m {t('pilot.from')} {currentStop?.name || 'stop'}</span>
        </div>
      )}

      <main className="pilot-main">
        <div className="map-container">
          <TripMap
            route={currentTrip.route}
            stops={currentTrip.stops}
            startLocation={currentTrip.start_location}
            endLocation={currentTrip.end_location}
            currentPosition={position}
            currentStopIndex={currentStopIndex}
            isPilotMode={true}
          />
        </div>

        <div className="stop-cards">
          {currentStop && (
            <PilotStopCard
              stop={currentStop}
              isCurrent={true}
              onNavigate={handleNavigate}
              onArrive={handleArrive}
              onSkip={handleSkip}
            />
          )}

          {nextStop && (
            <PilotStopCard stop={nextStop} isCurrent={false} isNext={true} />
          )}
        </div>

        {geoError && (
          <div className="geo-warning">
            <p>{t('pilot.gpsUnavailable')}</p>
          </div>
        )}

        {!isTracking && !geoError && (
          <div className="geo-info">
            <p>{t('pilot.gpsOff')}</p>
          </div>
        )}
      </main>

      {showChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>{t('chat.title')}</h3>
            <button onClick={() => setShowChat(false)}>×</button>
          </div>
          <div className="chat-body">
            <p className="chat-placeholder">
              {t('chat.comingSoon')}
            </p>
          </div>
        </div>
      )}

      {/* Auto-Arrival Prompt */}
      {showArrivalPrompt && currentStop && (
        <div className="arrival-modal-overlay">
          <div className="arrival-modal">
            <h3>📍 {t('pilot.youveArrived')}</h3>
            <p>{t('pilot.looksLikeAt')} <strong>{currentStop.name}</strong></p>
            <div className="arrival-actions">
              <button className="confirm-btn" onClick={handleConfirmArrival}>
                {t('pilot.yesImHere')}
              </button>
              <button className="dismiss-btn" onClick={handleDismissArrival}>
                {t('pilot.notYet')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wake Lock indicator (debug) */}
      {!wakeLockActive && (
        <div className="wakelock-warning">
          {t('pilot.screenMayTurnOff')}
        </div>
      )}
    </div>
  );
}
