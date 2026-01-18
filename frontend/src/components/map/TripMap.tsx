/**
 * Trip Map Component
 * Uses React-Leaflet for mapping
 */

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Route, Stop, POI, Coordinates } from '../../types';

// Fix Leaflet default icon issue
import 'leaflet/dist/leaflet.css';

// Custom marker icons
const createIcon = (color: string, emoji?: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 12px;">${emoji || ''}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const ICONS = {
  start: createIcon('#10b981', '🚗'),
  end: createIcon('#ef4444', '🏁'),
  stop: createIcon('#3b82f6', '📍'),
  currentStop: createIcon('#f59e0b', '⭐'),
  suggestion: createIcon('#8b5cf6', '💎'),
  position: createIcon('#ec4899', '📍'),
};

interface TripMapProps {
  route: Route;
  stops: Stop[];
  suggestions?: POI[];
  startLocation: Coordinates;
  endLocation: Coordinates;
  currentPosition?: Coordinates | null;
  currentStopIndex?: number;
  isPilotMode?: boolean;
  onSuggestionClick?: (poi: POI) => void;
}

// Component to fit map to bounds
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);

  return null;
}

export default function TripMap({
  route,
  stops,
  suggestions,
  startLocation,
  endLocation,
  currentPosition,
  currentStopIndex = 0,
  isPilotMode = false,
  onSuggestionClick,
}: TripMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Calculate bounds
  const bounds = L.latLngBounds([
    [startLocation.lat, startLocation.lon],
    [endLocation.lat, endLocation.lon],
  ]);

  // Extend bounds to include all stops
  stops.forEach((stop) => {
    bounds.extend([stop.coordinates.lat, stop.coordinates.lon]);
  });

  // Convert route polyline to Leaflet format [lat, lon]
  const routeLatLngs: L.LatLngExpression[] = route.polyline.map(([lon, lat]) => [
    lat,
    lon,
  ]);

  return (
    <MapContainer
      ref={mapRef}
      center={[startLocation.lat, startLocation.lon]}
      zoom={10}
      className="trip-map"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds bounds={bounds} />

      {/* Route polyline */}
      {routeLatLngs.length > 0 && (
        <Polyline
          positions={routeLatLngs}
          color="#3b82f6"
          weight={4}
          opacity={0.8}
        />
      )}

      {/* Start marker */}
      <Marker
        position={[startLocation.lat, startLocation.lon]}
        icon={ICONS.start}
      >
        <Popup>Start</Popup>
      </Marker>

      {/* End marker */}
      <Marker
        position={[endLocation.lat, endLocation.lon]}
        icon={ICONS.end}
      >
        <Popup>Destination</Popup>
      </Marker>

      {/* Stop markers */}
      {stops.map((stop, index) => (
        <Marker
          key={stop.id}
          position={[stop.coordinates.lat, stop.coordinates.lon]}
          icon={
            isPilotMode && index === currentStopIndex
              ? ICONS.currentStop
              : ICONS.stop
          }
        >
          <Popup>
            <div className="stop-popup">
              <strong>{stop.name}</strong>
              <p>{stop.type}</p>
              <p>{stop.duration_minutes} min</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Suggestion markers */}
      {!isPilotMode &&
        suggestions?.map((poi) => (
          <Marker
            key={poi.id}
            position={[poi.coordinates.lat, poi.coordinates.lon]}
            icon={ICONS.suggestion}
            eventHandlers={{
              click: () => onSuggestionClick?.(poi),
            }}
          >
            <Popup>
              <div className="suggestion-popup">
                <strong>{poi.name}</strong>
                <p>{poi.type}</p>
                {poi.distance_from_route_km && (
                  <p>{poi.distance_from_route_km.toFixed(1)} km from route</p>
                )}
                <button
                  type="button"
                  onClick={() => onSuggestionClick?.(poi)}
                  className="add-stop-btn"
                >
                  Add to Trip
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

      {/* Current position marker */}
      {currentPosition && (
        <Marker
          position={[currentPosition.lat, currentPosition.lon]}
          icon={ICONS.position}
        >
          <Popup>You are here</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
