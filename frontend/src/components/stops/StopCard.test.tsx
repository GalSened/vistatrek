/**
 * StopCard Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StopCard from './StopCard';
import { Stop } from '../../types';

const mockStop: Stop = {
  id: 'stop-1',
  name: 'Mountain Viewpoint',
  type: 'viewpoint',
  coordinates: { lat: 32.5, lon: 35.5 },
  duration_minutes: 30,
  planned_arrival: '2024-01-15T10:00:00Z',
  planned_departure: '2024-01-15T10:30:00Z',
  is_anchor: false,
};

describe('StopCard', () => {
  it('renders stop name', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.getByText('Mountain Viewpoint')).toBeInTheDocument();
  });

  it('renders stop type icon', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.getByText('🏔️')).toBeInTheDocument();
  });

  it('renders duration', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.getByText(/30 min/)).toBeInTheDocument();
  });

  it('renders formatted arrival time', () => {
    render(<StopCard stop={mockStop} />);
    // Check that time element exists
    expect(screen.getByText(/Arrive:/)).toBeInTheDocument();
  });

  it('shows anchor badge when is_anchor is true', () => {
    const anchorStop = { ...mockStop, is_anchor: true };
    render(<StopCard stop={anchorStop} />);
    expect(screen.getByText('🔒')).toBeInTheDocument();
  });

  it('does not show anchor badge when is_anchor is false', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.queryByText('🔒')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<StopCard stop={mockStop} onRemove={onRemove} />);

    const removeButton = screen.getByRole('button', { name: /Remove stop/ });
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalled();
  });

  it('does not render remove button when onRemove is not provided', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.queryByRole('button', { name: /Remove stop/ })).not.toBeInTheDocument();
  });

  it('shows drag handle when dragHandleProps is provided', () => {
    render(<StopCard stop={mockStop} dragHandleProps={{}} />);
    expect(screen.getByText('⋮⋮')).toBeInTheDocument();
  });

  it('does not show drag handle when dragHandleProps is not provided', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.queryByText('⋮⋮')).not.toBeInTheDocument();
  });

  it('renders different icons for different stop types', () => {
    const types: Array<{ type: Stop['type']; icon: string }> = [
      { type: 'viewpoint', icon: '🏔️' },
      { type: 'coffee', icon: '☕' },
      { type: 'food', icon: '🍕' },
      { type: 'spring', icon: '💧' },
      { type: 'parking', icon: '🅿️' },
      { type: 'hotel', icon: '🏨' },
      { type: 'custom', icon: '📍' },
    ];

    types.forEach(({ type, icon }) => {
      const stop = { ...mockStop, type };
      const { unmount } = render(<StopCard stop={stop} />);
      expect(screen.getByText(icon)).toBeInTheDocument();
      unmount();
    });
  });

  it('renders stop type label', () => {
    render(<StopCard stop={mockStop} />);
    expect(screen.getByText('viewpoint')).toBeInTheDocument();
  });

  it('handles invalid date gracefully', () => {
    const invalidStop = { ...mockStop, planned_arrival: 'invalid-date' };
    render(<StopCard stop={invalidStop} />);
    // Date parsing returns Invalid Date string when given invalid input
    expect(screen.getByText(/Invalid Date/)).toBeInTheDocument();
  });
});
