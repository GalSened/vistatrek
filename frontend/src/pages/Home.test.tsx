/**
 * Home Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import { TripProvider } from '../context/TripContext';
import { UserProvider } from '../context/UserContext';
import { tripApi } from '../api';
import { Trip } from '../types';

// Mock the API
vi.mock('../api', () => ({
  tripApi: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
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

// Mock LocationSearch to simplify testing
vi.mock('../components/ui/LocationSearch', () => ({
  default: ({
    onSelect,
    placeholder,
  }: {
    onSelect: (coords: { lat: number; lon: number }) => void;
    placeholder: string;
  }) => (
    <button
      data-testid={`location-search-${placeholder.includes('start') ? 'start' : 'end'}`}
      onClick={() => onSelect({ lat: 40.7128, lon: -74.006 })}
    >
      {placeholder}
    </button>
  ),
}));

// Mock TripHistoryList
vi.mock('../components/ui/TripHistoryList', () => ({
  default: ({
    trips,
    onSelect,
  }: {
    trips: Trip[];
    onSelect: (trip: Trip) => void;
  }) => (
    <div data-testid="trip-history">
      {trips.map((trip) => (
        <button key={trip.id} onClick={() => onSelect(trip)}>
          {trip.name}
        </button>
      ))}
    </div>
  ),
}));

// Mock OnboardingModal
vi.mock('../components/ui/OnboardingModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="onboarding-modal">
      <button onClick={onClose}>Close Onboarding</button>
    </div>
  ),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <UserProvider>
        <TripProvider>
          <Home />
        </TripProvider>
      </UserProvider>
    </MemoryRouter>
  );
}

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('rendering', () => {
    it('should render the home page with header', () => {
      renderHome();

      expect(screen.getByText('VistaTrek')).toBeInTheDocument();
      expect(
        screen.getByText("Discover nature's hidden gems along your route")
      ).toBeInTheDocument();
    });

    it('should render create trip form', () => {
      renderHome();

      expect(screen.getByText('Plan a New Trip')).toBeInTheDocument();
      expect(screen.getByLabelText('Trip Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Date')).toBeInTheDocument();
      expect(screen.getByText('Trip Vibes')).toBeInTheDocument();
    });

    it('should render vibe options', () => {
      renderHome();

      expect(screen.getByText('Nature')).toBeInTheDocument();
      expect(screen.getByText('Chill')).toBeInTheDocument();
      expect(screen.getByText('Hiking')).toBeInTheDocument();
      expect(screen.getByText('Foodie')).toBeInTheDocument();
      expect(screen.getByText('Adventure')).toBeInTheDocument();
    });

    it('should render settings button', () => {
      renderHome();

      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
    });
  });

  describe('trip creation', () => {
    it('should disable create button when locations not selected', () => {
      renderHome();

      const createBtn = screen.getByText('Plan My Trip');
      expect(createBtn).toBeDisabled();
    });

    it('should enable create button when locations are selected', async () => {
      const user = userEvent.setup();
      renderHome();

      // Select start and end locations
      await user.click(screen.getByTestId('location-search-start'));
      await user.click(screen.getByTestId('location-search-end'));

      const createBtn = screen.getByText('Plan My Trip');
      expect(createBtn).not.toBeDisabled();
    });

    it('should create trip and navigate to planner', async () => {
      const mockTrip: Trip = {
        id: 'trip-123',
        name: 'Test Trip',
        status: 'planning',
        start_location: { lat: 40.7128, lon: -74.006 },
        end_location: { lat: 34.0522, lon: -118.2437 },
        date: '2025-01-20',
        stops: [],
        route: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      vi.mocked(tripApi.create).mockResolvedValue(mockTrip);

      const user = userEvent.setup();
      renderHome();

      // Fill in trip name
      await user.type(screen.getByLabelText('Trip Name'), 'Weekend Getaway');

      // Select locations
      await user.click(screen.getByTestId('location-search-start'));
      await user.click(screen.getByTestId('location-search-end'));

      // Create trip
      await user.click(screen.getByText('Plan My Trip'));

      await waitFor(() => {
        expect(tripApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Weekend Getaway',
          })
        );
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/planner/trip-123');
      });
    });

    it('should use default name when not provided', async () => {
      const mockTrip: Trip = {
        id: 'trip-123',
        name: 'My Trip',
        status: 'planning',
        start_location: { lat: 40.7128, lon: -74.006 },
        end_location: { lat: 34.0522, lon: -118.2437 },
        date: '2025-01-20',
        stops: [],
        route: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      vi.mocked(tripApi.create).mockResolvedValue(mockTrip);

      const user = userEvent.setup();
      renderHome();

      // Select locations without filling name
      await user.click(screen.getByTestId('location-search-start'));
      await user.click(screen.getByTestId('location-search-end'));

      await user.click(screen.getByText('Plan My Trip'));

      await waitFor(() => {
        expect(tripApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'My Trip',
          })
        );
      });
    });

    it('should show error on API failure', async () => {
      vi.mocked(tripApi.create).mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      renderHome();

      await user.click(screen.getByTestId('location-search-start'));
      await user.click(screen.getByTestId('location-search-end'));
      await user.click(screen.getByText('Plan My Trip'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show loading state while creating', async () => {
      vi.mocked(tripApi.create).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'trip-123',
                  name: 'Test',
                  status: 'planning',
                  start_location: { lat: 0, lon: 0 },
                  end_location: { lat: 0, lon: 0 },
                  date: '2025-01-20',
                  stops: [],
                  route: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }),
              100
            )
          )
      );

      const user = userEvent.setup();
      renderHome();

      await user.click(screen.getByTestId('location-search-start'));
      await user.click(screen.getByTestId('location-search-end'));
      await user.click(screen.getByText('Plan My Trip'));

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  describe('vibe selection', () => {
    it('should toggle vibes on click', async () => {
      const user = userEvent.setup();
      renderHome();

      const natureBtn = screen.getByText('Nature').closest('button');
      expect(natureBtn).not.toHaveClass('selected');

      await user.click(natureBtn!);
      expect(natureBtn).toHaveClass('selected');

      await user.click(natureBtn!);
      expect(natureBtn).not.toHaveClass('selected');
    });

    it('should include selected vibes in trip creation', async () => {
      const mockTrip: Trip = {
        id: 'trip-123',
        name: 'Test',
        status: 'planning',
        start_location: { lat: 0, lon: 0 },
        end_location: { lat: 0, lon: 0 },
        date: '2025-01-20',
        stops: [],
        route: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      vi.mocked(tripApi.create).mockResolvedValue(mockTrip);

      const user = userEvent.setup();
      renderHome();

      // Select vibes
      await user.click(screen.getByText('Nature').closest('button')!);
      await user.click(screen.getByText('Hiking').closest('button')!);

      // Select locations
      await user.click(screen.getByTestId('location-search-start'));
      await user.click(screen.getByTestId('location-search-end'));

      // Create trip
      await user.click(screen.getByText('Plan My Trip'));

      await waitFor(() => {
        expect(tripApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            vibes: ['nature', 'hiking'],
          })
        );
      });
    });
  });

  describe('navigation', () => {
    it('should navigate to settings when settings button clicked', async () => {
      const user = userEvent.setup();
      renderHome();

      await user.click(screen.getByLabelText('Settings'));

      expect(mockNavigate).toHaveBeenCalledWith('/settings');
    });
  });

  describe('onboarding modal', () => {
    it('should show onboarding modal for new users', () => {
      renderHome();

      expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
    });

    it('should close onboarding when dismissed', async () => {
      const user = userEvent.setup();
      renderHome();

      await user.click(screen.getByText('Close Onboarding'));

      expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument();
    });
  });
});
