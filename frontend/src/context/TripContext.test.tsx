/**
 * TripContext Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TripProvider, useTrip } from './TripContext';
import { Stop, Trip, STORAGE_KEYS } from '../types';

// Mock stop data
const mockStop: Stop = {
  id: 'stop-1',
  name: 'Mountain View',
  type: 'viewpoint',
  coordinates: { lat: 32.5, lon: 35.5 },
  duration_minutes: 30,
  planned_arrival: '2024-01-15T10:00:00Z',
  planned_departure: '2024-01-15T10:30:00Z',
  is_anchor: false,
};

const mockStop2: Stop = {
  id: 'stop-2',
  name: 'Coffee Shop',
  type: 'coffee',
  coordinates: { lat: 32.6, lon: 35.6 },
  duration_minutes: 20,
  planned_arrival: '2024-01-15T11:00:00Z',
  planned_departure: '2024-01-15T11:20:00Z',
  is_anchor: false,
};

const mockTrip: Trip = {
  id: 'trip-1',
  name: 'Test Trip',
  status: 'draft',
  created_at: '2024-01-15T08:00:00Z',
  updated_at: '2024-01-15T08:00:00Z',
  start_location: { lat: 32.0, lon: 35.0 },
  end_location: { lat: 33.0, lon: 36.0 },
  date: '2024-01-15',
  vibes: ['nature'],
  route: {
    polyline: [[35.0, 32.0], [36.0, 33.0]],
    duration_seconds: 7200,
    distance_meters: 100000,
  },
  stops: [mockStop, mockStop2],
};

// Test component to access context
function TestConsumer() {
  const {
    currentTrip,
    tripHistory,
    setTrip,
    addStop,
    removeStop,
    reorderStops,
    startTrip,
    completeStop,
    skipStop,
    clearTrip,
  } = useTrip();

  return (
    <div>
      <span data-testid="has-trip">{currentTrip ? 'yes' : 'no'}</span>
      <span data-testid="trip-id">{currentTrip?.id || 'none'}</span>
      <span data-testid="stop-count">{currentTrip?.stops.length || 0}</span>
      <span data-testid="current-index">{currentTrip?.execution?.current_stop_index ?? -1}</span>
      <span data-testid="trip-status">{currentTrip?.status || 'idle'}</span>
      <span data-testid="history-count">{tripHistory.length}</span>
      <button onClick={() => setTrip(mockTrip)}>Set Trip</button>
      <button onClick={() => addStop({ ...mockStop, id: 'stop-3', name: 'New Stop' })}>Add Stop</button>
      <button onClick={() => removeStop('stop-1')}>Remove Stop</button>
      <button onClick={() => reorderStops(['stop-2', 'stop-1'])}>Reorder</button>
      <button onClick={startTrip}>Start Trip</button>
      <button onClick={() => completeStop('stop-1')}>Complete Stop</button>
      <button onClick={() => skipStop('stop-1')}>Skip Stop</button>
      <button onClick={clearTrip}>Clear Trip</button>
    </div>
  );
}

describe('TripContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides null trip initially', () => {
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    expect(screen.getByTestId('has-trip').textContent).toBe('no');
    expect(screen.getByTestId('trip-status').textContent).toBe('idle');
  });

  it('sets a trip', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));

    expect(screen.getByTestId('has-trip').textContent).toBe('yes');
    expect(screen.getByTestId('trip-id').textContent).toBe('trip-1');
    expect(screen.getByTestId('stop-count').textContent).toBe('2');
    expect(screen.getByTestId('trip-status').textContent).toBe('draft');
  });

  it('adds a stop to the trip', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    expect(screen.getByTestId('stop-count').textContent).toBe('2');

    await user.click(screen.getByText('Add Stop'));
    expect(screen.getByTestId('stop-count').textContent).toBe('3');
  });

  it('removes a stop from the trip', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    expect(screen.getByTestId('stop-count').textContent).toBe('2');

    await user.click(screen.getByText('Remove Stop'));
    expect(screen.getByTestId('stop-count').textContent).toBe('1');
  });

  it('starts the trip', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    await user.click(screen.getByText('Start Trip'));

    expect(screen.getByTestId('trip-status').textContent).toBe('active');
    expect(screen.getByTestId('current-index').textContent).toBe('0');
  });

  it('completes a stop and advances to next', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    await user.click(screen.getByText('Start Trip'));
    expect(screen.getByTestId('current-index').textContent).toBe('0');

    await user.click(screen.getByText('Complete Stop'));
    expect(screen.getByTestId('current-index').textContent).toBe('1');
  });

  it('skips a stop and advances to next', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    await user.click(screen.getByText('Start Trip'));

    await user.click(screen.getByText('Skip Stop'));
    expect(screen.getByTestId('current-index').textContent).toBe('1');
  });

  it('marks trip as completed when all stops done', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    await user.click(screen.getByText('Start Trip'));

    // Complete first stop
    await user.click(screen.getByText('Complete Stop'));
    // Complete second stop
    await user.click(screen.getByText('Complete Stop'));

    expect(screen.getByTestId('trip-status').textContent).toBe('completed');
  });

  it('clears the trip', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));
    expect(screen.getByTestId('has-trip').textContent).toBe('yes');

    await user.click(screen.getByText('Clear Trip'));
    expect(screen.getByTestId('has-trip').textContent).toBe('no');
    expect(screen.getByTestId('trip-status').textContent).toBe('idle');
  });

  it('persists trip to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    await user.click(screen.getByText('Set Trip'));

    // Wait for effect to run
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_TRIP);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.id).toBe('trip-1');
  });

  it('loads trip from localStorage', async () => {
    // Pre-populate localStorage
    localStorage.setItem(
      STORAGE_KEYS.CURRENT_TRIP,
      JSON.stringify({
        ...mockTrip,
        status: 'active',
        execution: {
          started_at: '2024-01-15T08:00:00Z',
          current_stop_index: 1,
          completed_stops: ['stop-1'],
        },
      })
    );

    render(
      <TripProvider>
        <TestConsumer />
      </TripProvider>
    );

    // Wait for hydration
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('has-trip').textContent).toBe('yes');
    expect(screen.getByTestId('current-index').textContent).toBe('1');
    expect(screen.getByTestId('trip-status').textContent).toBe('active');
  });

  it('throws error when used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useTrip must be used within TripProvider');

    consoleSpy.mockRestore();
  });
});
