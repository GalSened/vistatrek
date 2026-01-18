/**
 * Pilot Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Pilot from './Pilot';
import { TripProvider, useTrip } from '../context/TripContext';
import { UserProvider } from '../context/UserContext';
import { tripApi } from '../api';
import { Trip, Route as TripRoute, TripExecution, Stop } from '../types';

// Mock the API
vi.mock('../api', () => ({
  tripApi: {
    get: vi.fn(),
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

// Mock hooks
vi.mock('../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    position: null,
    error: null,
    isTracking: true,
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
  }),
}));

vi.mock('../hooks/useWakeLock', () => ({
  useWakeLock: () => ({
    isActive: true,
    request: vi.fn(),
    release: vi.fn(),
  }),
}));

vi.mock('../hooks/usePacing', () => ({
  usePacing: () => ({
    pacingInfo: { status: 'on_time', suggestion: null },
    currentTime: new Date('2025-01-20T10:00:00'),
  }),
  formatTime: (time: string) => time,
}));

vi.mock('../hooks/useGeofence', () => ({
  useGeofence: () => ({
    isWithinGeofence: false,
    distanceMeters: null,
    dwellProgress: 0,
  }),
}));

// Mock child components
vi.mock('../components/map/TripMap', () => ({
  default: () => <div data-testid="trip-map">TripMap</div>,
}));

vi.mock('../components/stops/PilotStopCard', () => ({
  default: ({
    stop,
    isCurrent,
    onNavigate,
    onArrive,
    onSkip,
  }: {
    stop: Stop;
    isCurrent: boolean;
    onNavigate?: () => void;
    onArrive?: () => void;
    onSkip?: () => void;
  }) => (
    <div data-testid={isCurrent ? 'current-stop-card' : 'next-stop-card'}>
      <span>{stop.name}</span>
      {onNavigate && <button onClick={onNavigate}>Navigate</button>}
      {onArrive && <button onClick={onArrive}>I'm Here</button>}
      {onSkip && <button onClick={onSkip}>Skip</button>}
    </div>
  ),
}));

const mockRoute: TripRoute = {
  polyline: [[0, 0], [1, 1]],
  duration_seconds: 3600,
  distance_meters: 50000,
};

const mockExecution: TripExecution = {
  current_stop_index: 0,
  completed_stops: [],
  skipped_stops: [],
  started_at: new Date().toISOString(),
};

const createMockTrip = (overrides?: Partial<Trip>): Trip => ({
  id: 'trip-123',
  name: 'Test Trip',
  status: 'active',
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
    {
      id: 'stop-2',
      name: 'Lake Trail',
      type: 'hiking',
      coordinates: { lat: 40.85, lon: -74.15 },
      description: 'Beautiful lake trail',
      planned_arrival: '11:00',
      planned_departure: '11:45',
      suggested_duration: 45,
      source: 'ai',
    },
  ],
  route: mockRoute,
  execution: mockExecution,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// Component that sets up trip context for testing
function TripSetter({ trip }: { trip: Trip }) {
  const { setTrip, startTrip } = useTrip();
  setTrip(trip);
  if (trip.execution) {
    startTrip();
  }
  return null;
}

function renderPilot(initialTrip?: Trip) {
  return render(
    <MemoryRouter initialEntries={['/pilot/trip-123']}>
      <UserProvider>
        <TripProvider>
          {initialTrip && <TripSetter trip={initialTrip} />}
          <Routes>
            <Route path="/pilot/:tripId" element={<Pilot />} />
          </Routes>
        </TripProvider>
      </UserProvider>
    </MemoryRouter>
  );
}

describe('Pilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('loading state', () => {
    it('should show loading when trip is being fetched', async () => {
      vi.mocked(tripApi.get).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockTrip()), 100))
      );

      render(
        <MemoryRouter initialEntries={['/pilot/trip-123']}>
          <UserProvider>
            <TripProvider>
              <Routes>
                <Route path="/pilot/:tripId" element={<Pilot />} />
              </Routes>
            </TripProvider>
          </UserProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('Loading trip...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error when no active trip', () => {
      const tripWithNoExecution = createMockTrip({ execution: undefined });

      render(
        <MemoryRouter initialEntries={['/pilot/trip-123']}>
          <UserProvider>
            <TripProvider>
              <TripSetter trip={tripWithNoExecution} />
              <Routes>
                <Route path="/pilot/:tripId" element={<Pilot />} />
              </Routes>
            </TripProvider>
          </UserProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('No active trip')).toBeInTheDocument();
    });

    it('should navigate home when Go Home clicked', async () => {
      const user = userEvent.setup();
      const tripWithNoExecution = createMockTrip({ execution: undefined });

      render(
        <MemoryRouter initialEntries={['/pilot/trip-123']}>
          <UserProvider>
            <TripProvider>
              <TripSetter trip={tripWithNoExecution} />
              <Routes>
                <Route path="/pilot/:tripId" element={<Pilot />} />
              </Routes>
            </TripProvider>
          </UserProvider>
        </MemoryRouter>
      );

      await user.click(screen.getByText('Go Home'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('active trip', () => {
    it('should render end trip button', () => {
      renderPilot(createMockTrip());

      expect(screen.getByText('End Trip')).toBeInTheDocument();
    });

    it('should render progress bar with stop count', () => {
      renderPilot(createMockTrip());

      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('should render chat button', () => {
      renderPilot(createMockTrip());

      expect(screen.getByLabelText('Chat')).toBeInTheDocument();
    });

    it('should render current stop card', () => {
      renderPilot(createMockTrip());

      expect(screen.getByTestId('current-stop-card')).toBeInTheDocument();
      expect(screen.getByText('Mountain View')).toBeInTheDocument();
    });

    it('should render next stop card', () => {
      renderPilot(createMockTrip());

      expect(screen.getByTestId('next-stop-card')).toBeInTheDocument();
      expect(screen.getByText('Lake Trail')).toBeInTheDocument();
    });

    it('should render map', () => {
      renderPilot(createMockTrip());

      expect(screen.getByTestId('trip-map')).toBeInTheDocument();
    });
  });

  describe('end trip', () => {
    it('should navigate home when End Trip clicked', async () => {
      const user = userEvent.setup();
      renderPilot(createMockTrip());

      await user.click(screen.getByText('End Trip'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('chat panel', () => {
    it('should toggle chat panel when chat button clicked', async () => {
      const user = userEvent.setup();
      renderPilot(createMockTrip());

      expect(screen.queryByText('Trip Assistant')).not.toBeInTheDocument();

      await user.click(screen.getByLabelText('Chat'));

      expect(screen.getByText('Trip Assistant')).toBeInTheDocument();
    });

    it('should close chat panel when close button clicked', async () => {
      const user = userEvent.setup();
      renderPilot(createMockTrip());

      await user.click(screen.getByLabelText('Chat'));
      expect(screen.getByText('Trip Assistant')).toBeInTheDocument();

      await user.click(screen.getByText('×'));

      expect(screen.queryByText('Trip Assistant')).not.toBeInTheDocument();
    });
  });

  describe('trip completion', () => {
    it('should show completion screen when all stops done', () => {
      const completedTrip = createMockTrip({
        execution: {
          current_stop_index: 2, // Past all stops
          completed_stops: ['stop-1', 'stop-2'],
          skipped_stops: [],
          started_at: new Date().toISOString(),
        },
      });

      renderPilot(completedTrip);

      expect(screen.getByText('🎉 Trip Complete!')).toBeInTheDocument();
    });

    it('should show stop count on completion', () => {
      const completedTrip = createMockTrip({
        execution: {
          current_stop_index: 2,
          completed_stops: ['stop-1', 'stop-2'],
          skipped_stops: [],
          started_at: new Date().toISOString(),
        },
      });

      renderPilot(completedTrip);

      expect(screen.getByText(/You visited 2 of 2 stops/)).toBeInTheDocument();
    });

    it('should show trip stats on completion', () => {
      const completedTrip = createMockTrip({
        execution: {
          current_stop_index: 2,
          completed_stops: ['stop-1', 'stop-2'],
          skipped_stops: [],
          started_at: new Date().toISOString(),
        },
      });

      renderPilot(completedTrip);

      expect(screen.getByText('50.0')).toBeInTheDocument(); // km
      expect(screen.getByText('km traveled')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument(); // minutes
      expect(screen.getByText('minutes')).toBeInTheDocument();
    });

    it('should navigate home on Finish click', async () => {
      const user = userEvent.setup();
      const completedTrip = createMockTrip({
        execution: {
          current_stop_index: 2,
          completed_stops: ['stop-1', 'stop-2'],
          skipped_stops: [],
          started_at: new Date().toISOString(),
        },
      });

      renderPilot(completedTrip);

      await user.click(screen.getByText('Finish'));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('pacing status', () => {
    it('should show pacing status bar', () => {
      renderPilot(createMockTrip());

      expect(screen.getByText('✓ On time')).toBeInTheDocument();
    });
  });
});
