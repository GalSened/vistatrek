/**
 * Location Search Component
 * Uses Nominatim (OpenStreetMap) for geocoding
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Coordinates } from '../../types';

interface LocationSearchProps {
  placeholder?: string;
  value?: Coordinates | null;
  onSelect: (coords: Coordinates) => void;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export default function LocationSearch({
  placeholder = 'Search location...',
  value,
  onSelect,
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchLocations = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        format: 'json',
        limit: '5',
        addressdetails: '1',
      });

      const response = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: {
          'User-Agent': 'VistaTrek/1.0',
        },
      });

      if (response.ok) {
        const data: SearchResult[] = await response.json();
        // Deduplicate by display_name to avoid showing identical entries
        const seen = new Set<string>();
        const deduped = data.filter((result) => {
          if (seen.has(result.display_name)) {
            return false;
          }
          seen.add(result.display_name);
          return true;
        });
        setResults(deduped);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Location search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setSelectedName(null);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchLocations(newQuery);
    }, 300);
  };

  const handleSelectResult = (result: SearchResult) => {
    const coords: Coordinates = {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    };

    setSelectedName(result.display_name.split(',')[0]);
    setQuery('');
    setResults([]);
    setShowResults(false);
    onSelect(coords);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: Coordinates = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setSelectedName('Current Location');
        setShowResults(false);
        onSelect(coords);
      },
      (error) => {
        alert(`Could not get location: ${error.message}`);
      }
    );
  };

  return (
    <div className="location-search" ref={containerRef}>
      <div className="search-input-wrapper">
        <input
          type="text"
          placeholder={placeholder}
          value={selectedName || query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className={value ? 'has-value' : ''}
        />
        {isSearching && <span className="search-loading">...</span>}
        <button
          type="button"
          className="current-location-btn"
          onClick={handleUseCurrentLocation}
          title="Use current location"
        >
          📍
        </button>
      </div>

      {showResults && results.length > 0 && (
        <ul className="search-results">
          {results.map((result) => (
            <li key={result.place_id}>
              <button
                type="button"
                onClick={() => handleSelectResult(result)}
                className="result-item"
              >
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
