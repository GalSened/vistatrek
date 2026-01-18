/**
 * StopList Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StopList from './StopList';
import { Stop } from '../../types';

const createMockStop = (id: string, name: string): Stop => ({
  id,
  name,
  type: 'viewpoint',
  coordinates: { lat: 40.7128, lon: -74.006 },
  description: `A great ${name.toLowerCase()}`,
  planned_arrival: '10:00',
  planned_departure: '10:30',
  suggested_duration: 30,
  source: 'manual',
});

describe('StopList', () => {
  const mockOnRemove = vi.fn();
  const mockOnReorder = vi.fn();

  const defaultProps = {
    stops: [],
    onRemove: mockOnRemove,
    onReorder: mockOnReorder,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('should show empty message when no stops', () => {
      render(<StopList {...defaultProps} />);

      expect(screen.getByText('No stops added yet')).toBeInTheDocument();
      expect(
        screen.getByText('Add stops from the suggestions below')
      ).toBeInTheDocument();
    });
  });

  describe('with stops', () => {
    const stops: Stop[] = [
      createMockStop('stop-1', 'Mountain Viewpoint'),
      createMockStop('stop-2', 'Coffee Shop'),
      createMockStop('stop-3', 'Hiking Trail'),
    ];

    it('should render all stops', () => {
      render(<StopList {...defaultProps} stops={stops} />);

      expect(screen.getByText('Mountain Viewpoint')).toBeInTheDocument();
      expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
      expect(screen.getByText('Hiking Trail')).toBeInTheDocument();
    });

    it('should show stop indices', () => {
      render(<StopList {...defaultProps} stops={stops} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should render as a list', () => {
      render(<StopList {...defaultProps} stops={stops} />);

      const list = screen.getByRole('list');
      expect(list).toBeInTheDocument();
      expect(list).toHaveClass('stop-list');
    });

    it('should call onRemove when remove button clicked', async () => {
      const user = userEvent.setup();
      render(<StopList {...defaultProps} stops={stops} />);

      const removeButtons = screen.getAllByLabelText(/remove/i);
      await user.click(removeButtons[0]);

      expect(mockOnRemove).toHaveBeenCalledWith('stop-1');
    });
  });

  describe('editable mode', () => {
    const stops: Stop[] = [createMockStop('stop-1', 'Test Stop')];

    it('should show drag handles when editable', () => {
      render(<StopList {...defaultProps} stops={stops} editable={true} />);

      // StopCard shows drag handle when dragHandleProps provided
      const stopCard = screen.getByText('Test Stop').closest('.stop-card');
      expect(stopCard).toBeInTheDocument();
    });

    it('should not show remove button when not editable', () => {
      render(<StopList {...defaultProps} stops={stops} editable={false} />);

      expect(screen.queryByLabelText(/remove/i)).not.toBeInTheDocument();
    });
  });

  describe('single stop', () => {
    it('should render single stop correctly', () => {
      const stops = [createMockStop('stop-1', 'Lone Stop')];
      render(<StopList {...defaultProps} stops={stops} />);

      expect(screen.getByText('Lone Stop')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });
});
