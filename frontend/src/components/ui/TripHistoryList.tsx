/**
 * Trip History List Component
 */

import { useTranslation } from 'react-i18next';
import { Trip } from '../../types';
import { format } from 'date-fns';

interface TripHistoryListProps {
  trips: Trip[];
  onSelect: (trip: Trip) => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  planned: '#f59e0b',
  active: '#10b981',
  completed: '#3b82f6',
};

export default function TripHistoryList({
  trips,
  onSelect,
}: TripHistoryListProps) {
  const { t } = useTranslation();

  if (trips.length === 0) {
    return (
      <div className="trip-history-empty">
        <p>{t('home.noTripsYet')}</p>
      </div>
    );
  }

  return (
    <ul className="trip-history-list">
      {trips.map((trip) => {
        const statusColor = STATUS_COLORS[trip.status] || STATUS_COLORS.draft;
        const statusLabel = t(`trip.status.${trip.status}`);
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
                  style={{ backgroundColor: statusColor }}
                >
                  {statusLabel}
                </span>
                <span className="trip-stops">
                  {trip.stops.length} {trip.stops.length !== 1 ? t('home.stops') : t('home.stop')}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
