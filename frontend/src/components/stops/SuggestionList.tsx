/**
 * Suggestion List Component
 * Shows POI suggestions that can be added to trip
 */

import { POI, StopType } from '../../types';

interface SuggestionListProps {
  suggestions: POI[];
  onAdd: (poi: POI) => void;
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

export default function SuggestionList({
  suggestions,
  onAdd,
}: SuggestionListProps) {
  if (suggestions.length === 0) {
    return (
      <div className="suggestion-list-empty">
        <p>No suggestions available</p>
      </div>
    );
  }

  // Group by type
  const grouped = suggestions.reduce<Record<string, POI[]>>((acc, poi) => {
    const type = poi.type || 'custom';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(poi);
    return acc;
  }, {});

  return (
    <div className="suggestion-list">
      {Object.entries(grouped).map(([type, pois]) => (
        <div key={type} className="suggestion-group">
          <h3 className="suggestion-group-title">
            {TYPE_ICONS[type as StopType] || '📍'} {type}
            <span className="count">({pois.length})</span>
          </h3>
          <ul className="suggestion-items">
            {pois.slice(0, 5).map((poi) => (
              <li key={poi.id} className="suggestion-item">
                <div className="suggestion-info">
                  <span className="suggestion-name">{poi.name}</span>
                  {poi.distance_from_route_km && (
                    <span className="suggestion-distance">
                      {poi.distance_from_route_km.toFixed(1)} km
                    </span>
                  )}
                  {poi.match_score && (
                    <span className="suggestion-score">
                      {poi.match_score}% match
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="add-suggestion-btn"
                  onClick={() => onAdd(poi)}
                  aria-label={`Add ${poi.name} to trip`}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
