/**
 * Trip History List Component
 */

import { Trip } from '../../types';
import { format } from 'date-fns';

interface TripHistoryListProps {
  trips: Trip[];
  onSelect: (trip: Trip) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#6b7280' },
  active: { label: 'In Progress', color: '#10b981' },
  completed: { label: 'Completed', color: '#3b82f6' },
};

export default function TripHistoryList({
  trips,
  onSelect,
}: TripHistoryListProps) {
  if (trips.length === 0) {
    return (
      <div className="trip-history-empty">
        <p>No trips yet. Create your first trip above!</p>
      </div>
    );
  }

  return (
    <ul className="trip-history-list">
      {trips.map((trip) => {
        const statusInfo = STATUS_LABELS[trip.status] || STATUS_LABELS.draft;
        const dateStr = format(new Date(trip.created_at), 'MMM d, yyyy');

        return (
          <li key={trip.id} className="trip-history-item">
            <button
              type="button"
              onClick={() => onSelect(trip)}
              className="trip-history-btn"
            >
              <div className="trip-info">
                <h3 className="trip-name">{trip.name}</h3>
                <span className="trip-date">{dateStr}</span>
              </div>
              <div className="trip-meta">
                <span
                  className="trip-status"
                  style={{ backgroundColor: statusInfo.color }}
                >
                  {statusInfo.label}
                </span>
                <span className="trip-stops">
                  {trip.stops.length} stop{trip.stops.length !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
