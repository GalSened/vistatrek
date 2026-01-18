/**
 * Planner Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Planner from './Planner';
import { TripProvider, useTrip } from '../context/TripContext';
import { UserProvider } from '../context/UserContext';
import { tripApi } from '../api';
import { Trip, Route as TripRoute } from '../types';

// Mock the API
vi.mock('../api', () => ({
  tripApi: {
    get: vi.fn(),
    plan: vi.fn(),
  },
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock child components
vi.mock('../components/map/TripMap', () => ({
  default: () => <div data-testid="trip-map">TripMap</div>,
}));

vi.mock('../components/stops/StopList', () => ({
  default: ({
    stops,
    onRemove,
  }: {
    stops: { id: string; name: string }[];
    onRemove: (id: string) => void;
  }) => (
    <ul data-testid="stop-list">
      {stops.map((stop) => (
        <li key={stop.id}>
          {stop.name}
          <button onClick={() => onRemove(stop.id)}>Remove</button>
        </li>
      ))}
    </ul>
  ),
}));

vi.mock('../components/stops/SuggestionList', () => ({
  default: ({
    suggestions,
    onAdd,
  }: {
    suggestions: { id: string; name: string }[];
    onAdd: (id: string) => void;
  }) => (
    <ul data-testid="suggestion-list">
      {suggestions.map((s) => (
        <li key={s.id}>
          {s.name}
          <button onClick={() => onAdd(s.id)}>Add</button>
        </li>
      ))}
    </ul>
  ),
}));

const mockRoute: TripRoute = {
  polyline: [[0, 0], [1, 1]],
  duration_seconds: 3600,
  distance_meters: 50000,
};

const mockTrip: Trip = {
  id: 'trip-123',
  name: 'Test Trip',
  status: 'planning',
  start_location: { lat: 40.7128, lon: -74.006 },
  end_location: { lat: 34.0522, lon: -118.2437 },
  date: '2025-01-20',
  stops: [
    {
      id: 'stop-1',
      name: 'Mountain View',
      type: 'viewpoint',
      coordinates: { lat: 40.8, lon: -74.1 },
      description: 'A scenic viewpoint',
      planned_arrival: '10:00',
      planned_departure: '10:30',
      suggested_duration: 30,
      source: 'manual',
    },
  ],
  route: mockRoute,
  suggestions: [
    {
      id: 'sug-1',
      name: 'Waterfall Trail',
      type: 'hiking',
      coordinates: { lat: 40.75, lon: -74.05 },
      description: 'Beautiful waterfall',
      suggested_duration: 45,
      distance_from_route: 2,
      rating: 4.5,
      tags: ['nature', 'hiking'],
    },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Component that sets up trip context for testing
function TestWrapper({ children, initialTrip }: { children: React.ReactNode; initialTrip?: Trip }) {
  return (
    <MemoryRouter initialEntries={['/planner/trip-123']}>
      <UserProvider>
        <TripProvider>
          {initialTrip && <TripSetter trip={initialTrip} />}
          <Routes>
            <Route path="/planner/:tripId" element={children} />
          </Routes>
        </TripProvider>
      </UserProvider>
    </MemoryRouter>
  );
}

function TripSetter({ trip }: { trip: Trip }) {
  const { setTrip } = useTrip();
  if (trip) {
    setTrip(trip);
  }
  return null;
}

function renderPlanner(initialTrip?: Trip) {
  return render(
    <TestWrapper initialTrip={initialTrip}>
      <Planner />
    </TestWrapper>
  );
}

describe('Planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('loading state', () => {
    it('should show loading when trip is not in context', async () => {
      vi.mocked(tripApi.get).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockTrip), 100))
      );

      render(
        <MemoryRouter initialEntries={['/planner/trip-123']}>
          <UserProvider>
            <TripProvider>
              <Routes>
                <Route path="/planner/:tripId" element={<Planner />} />
              </Routes>
            </TripProvider>
          </UserProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('Loading trip...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when no trip', async () => {
      vi.mocked(tripApi.get).mockRejectedValue(new Error('Not found'));

      render(
        <MemoryRouter initialEntries={['/planner/trip-123']}>
          <UserProvider>
            <TripProvider>
              <Routes>
                <Route path="/planner/:tripId" element={<Planner />} />
              </Routes>
            </TripProvider>
          </UserProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to load trip')).toBeInTheDocument();
      });
    });

    it('should navigate home when Go Home clicked', async () => {
      vi.mocked(tripApi.get).mockRejectedValue(new Error('Not found'));
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/planner/trip-123']}>
          <UserProvider>
            <TripProvider>
              <Routes>
                <Route path="/planner/:tripId" element={<Planner />} />
              </Routes>
            </TripProvider>
          </UserProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Go Home')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Go Home'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('with trip loaded', () => {
    it('should render trip name in header', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('Test Trip')).toBeInTheDocument();
    });

    it('should render view toggle buttons', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('Map')).toBeInTheDocument();
      expect(screen.getByText('Split')).toBeInTheDocument();
      expect(screen.getByText('List')).toBeInTheDocument();
    });

    it('should have Split view active by default', () => {
      renderPlanner(mockTrip);

      const splitBtn = screen.getByText('Split');
      expect(splitBtn).toHaveClass('active');
    });

    it('should render back button', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('← Back')).toBeInTheDocument();
    });

    it('should navigate back when back button clicked', async () => {
      const user = userEvent.setup();
      renderPlanner(mockTrip);

      await user.click(screen.getByText('← Back'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('view toggle', () => {
    it('should switch to map view', async () => {
      const user = userEvent.setup();
      renderPlanner(mockTrip);

      await user.click(screen.getByText('Map'));

      const mapBtn = screen.getByText('Map');
      expect(mapBtn).toHaveClass('active');
    });

    it('should switch to list view', async () => {
      const user = userEvent.setup();
      renderPlanner(mockTrip);

      await user.click(screen.getByText('List'));

      const listBtn = screen.getByText('List');
      expect(listBtn).toHaveClass('active');
    });
  });

  describe('trip summary', () => {
    it('should show trip duration', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('60 min drive')).toBeInTheDocument();
    });

    it('should show trip distance', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('50.0 km')).toBeInTheDocument();
    });

    it('should show stop count', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('1 stops')).toBeInTheDocument();
    });
  });

  describe('start trip', () => {
    it('should render start trip button', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('Start Trip 🚗')).toBeInTheDocument();
    });

    it('should disable start trip button when no stops', () => {
      const tripWithNoStops = { ...mockTrip, stops: [] };
      renderPlanner(tripWithNoStops);

      const startBtn = screen.getByText('Start Trip 🚗');
      expect(startBtn).toBeDisabled();
    });

    it('should enable start trip button when has stops', () => {
      renderPlanner(mockTrip);

      const startBtn = screen.getByText('Start Trip 🚗');
      expect(startBtn).not.toBeDisabled();
    });

    it('should navigate to pilot on start trip', async () => {
      const user = userEvent.setup();
      renderPlanner(mockTrip);

      await user.click(screen.getByText('Start Trip 🚗'));

      expect(mockNavigate).toHaveBeenCalledWith('/pilot/trip-123');
    });
  });

  describe('stops section', () => {
    it('should show stops count header', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('Your Stops (1)')).toBeInTheDocument();
    });

    it('should render stop list', () => {
      renderPlanner(mockTrip);

      expect(screen.getByTestId('stop-list')).toBeInTheDocument();
    });
  });

  describe('suggestions section', () => {
    it('should show suggestions header when suggestions exist', () => {
      renderPlanner(mockTrip);

      expect(screen.getByText('Suggested Stops')).toBeInTheDocument();
    });

    it('should render suggestion list', () => {
      renderPlanner(mockTrip);

      expect(screen.getByTestId('suggestion-list')).toBeInTheDocument();
    });

    it('should not show suggestions when none exist', () => {
      const tripWithNoSuggestions = { ...mockTrip, suggestions: [] };
      renderPlanner(tripWithNoSuggestions);

      expect(screen.queryByText('Suggested Stops')).not.toBeInTheDocument();
    });
  });

  describe('map', () => {
    it('should render map in split view', () => {
      renderPlanner(mockTrip);

      expect(screen.getByTestId('trip-map')).toBeInTheDocument();
    });
  });
});
