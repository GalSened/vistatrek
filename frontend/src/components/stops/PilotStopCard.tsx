/**
 * Pilot Mode Stop Card Component
 * Shows current/next stop with navigation actions
 */

import { Stop, StopType } from '../../types';

interface PilotStopCardProps {
  stop: Stop;
  isCurrent: boolean;
  isNext?: boolean;
  onNavigate?: () => void;
  onArrive?: () => void;
  onSkip?: () => void;
}

const TYPE_ICONS: Record<StopType, string> = {
  viewpoint: '🏔️',
  coffee: '☕',
  food: '🍕',
  spring: '💧',
  parking: '🅿️',
  hotel: '🏨',
  custom: '📍',
};

export default function PilotStopCard({
  stop,
  isCurrent,
  isNext,
  onNavigate,
  onArrive,
  onSkip,
}: PilotStopCardProps) {
  const icon = TYPE_ICONS[stop.type] || TYPE_ICONS.custom;

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  return (
    <div
      className={`pilot-stop-card ${isCurrent ? 'current' : ''} ${
        isNext ? 'next' : ''
      }`}
    >
      <div className="pilot-stop-header">
        <span className="pilot-stop-label">
          {isCurrent ? 'Current Stop' : 'Up Next'}
        </span>
        <span className="pilot-stop-eta">
          {formatTime(stop.planned_arrival)}
        </span>
      </div>

      <div className="pilot-stop-content">
        <span className="pilot-stop-icon">{icon}</span>
        <div className="pilot-stop-info">
          <h3 className="pilot-stop-name">{stop.name}</h3>
          <p className="pilot-stop-duration">
            Plan to spend {stop.duration_minutes} minutes here
          </p>
        </div>
      </div>

      {isCurrent && (
        <div className="pilot-stop-actions">
          {onNavigate && (
            <button
              type="button"
              className="navigate-btn"
              onClick={onNavigate}
            >
              🧭 Navigate
            </button>
          )}
          {onArrive && (
            <button type="button" className="arrive-btn" onClick={onArrive}>
              ✓ I'm Here
            </button>
          )}
          {onSkip && (
            <button type="button" className="skip-btn" onClick={onSkip}>
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
