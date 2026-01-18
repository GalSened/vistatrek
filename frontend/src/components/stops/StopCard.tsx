/**
 * Stop Card Component
 */

import { Stop, StopType } from '../../types';

interface StopCardProps {
  stop: Stop;
  onRemove?: () => void;
  dragHandleProps?: Record<string, unknown>;
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

const TYPE_COLORS: Record<StopType, string> = {
  viewpoint: '#10b981',
  coffee: '#8b4513',
  food: '#f59e0b',
  spring: '#06b6d4',
  parking: '#6b7280',
  hotel: '#8b5cf6',
  custom: '#3b82f6',
};

export default function StopCard({
  stop,
  onRemove,
  dragHandleProps,
}: StopCardProps) {
  const icon = TYPE_ICONS[stop.type] || TYPE_ICONS.custom;
  const color = TYPE_COLORS[stop.type] || TYPE_COLORS.custom;

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  return (
    <div className="stop-card" style={{ borderLeftColor: color }}>
      {dragHandleProps && (
        <button
          type="button"
          className="drag-handle"
          aria-label="Drag to reorder"
          {...dragHandleProps}
        >
          ⋮⋮
        </button>
      )}

      <div className="stop-icon" style={{ backgroundColor: color }}>
        {icon}
      </div>

      <div className="stop-info">
        <h3 className="stop-name">{stop.name}</h3>
        <div className="stop-meta">
          <span className="stop-type">{stop.type}</span>
          <span className="stop-duration">{stop.duration_minutes} min</span>
        </div>
        <div className="stop-times">
          <span className="arrival">Arrive: {formatTime(stop.planned_arrival)}</span>
          <span className="departure">Leave: {formatTime(stop.planned_departure)}</span>
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          className="remove-btn"
          onClick={onRemove}
          aria-label="Remove stop"
        >
          ×
        </button>
      )}

      {stop.is_anchor && <span className="anchor-badge" title="Fixed time">🔒</span>}
    </div>
  );
}
