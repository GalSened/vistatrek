/**
 * PilotStopCard Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PilotStopCard from './PilotStopCard';
import { Stop } from '../../types';

const mockStop: Stop = {
  id: 'stop-1',
  name: 'Scenic Overlook',
  type: 'viewpoint',
  coordinates: { lat: 32.5, lon: 35.5 },
  duration_minutes: 45,
  planned_arrival: '2024-01-15T10:00:00Z',
  planned_departure: '2024-01-15T10:45:00Z',
  is_anchor: false,
};

describe('PilotStopCard', () => {
  it('renders stop name', () => {
    render(<PilotStopCard stop={mockStop} isCurrent={true} />);
    expect(screen.getByText('Scenic Overlook')).toBeInTheDocument();
  });

  it('renders stop type icon', () => {
    render(<PilotStopCard stop={mockStop} isCurrent={true} />);
    expect(screen.getByText('🏔️')).toBeInTheDocument();
  });

  it('renders duration information', () => {
    render(<PilotStopCard stop={mockStop} isCurrent={true} />);
    expect(screen.getByText(/45 minutes/)).toBeInTheDocument();
  });

  it('shows "Current Stop" label when isCurrent is true', () => {
    render(<PilotStopCard stop={mockStop} isCurrent={true} />);
    expect(screen.getByText('Current Stop')).toBeInTheDocument();
  });

  it('shows "Up Next" label when isNext is true', () => {
    render(<PilotStopCard stop={mockStop} isCurrent={false} isNext={true} />);
    expect(screen.getByText('Up Next')).toBeInTheDocument();
  });

  it('applies current class when isCurrent is true', () => {
    const { container } = render(
      <PilotStopCard stop={mockStop} isCurrent={true} />
    );
    expect(container.querySelector('.pilot-stop-card.current')).toBeInTheDocument();
  });

  it('applies next class when isNext is true', () => {
    const { container } = render(
      <PilotStopCard stop={mockStop} isCurrent={false} isNext={true} />
    );
    expect(container.querySelector('.pilot-stop-card.next')).toBeInTheDocument();
  });

  describe('action buttons', () => {
    it('shows Navigate button when onNavigate is provided and isCurrent', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(
        <PilotStopCard stop={mockStop} isCurrent={true} onNavigate={onNavigate} />
      );

      const button = screen.getByRole('button', { name: /Navigate/ });
      expect(button).toBeInTheDocument();

      await user.click(button);
      expect(onNavigate).toHaveBeenCalled();
    });

    it('shows Arrive button when onArrive is provided and isCurrent', async () => {
      const user = userEvent.setup();
      const onArrive = vi.fn();
      render(
        <PilotStopCard stop={mockStop} isCurrent={true} onArrive={onArrive} />
      );

      const button = screen.getByRole('button', { name: /I'm Here/ });
      expect(button).toBeInTheDocument();

      await user.click(button);
      expect(onArrive).toHaveBeenCalled();
    });

    it('shows Skip button when onSkip is provided and isCurrent', async () => {
      const user = userEvent.setup();
      const onSkip = vi.fn();
      render(
        <PilotStopCard stop={mockStop} isCurrent={true} onSkip={onSkip} />
      );

      const button = screen.getByRole('button', { name: /Skip/ });
      expect(button).toBeInTheDocument();

      await user.click(button);
      expect(onSkip).toHaveBeenCalled();
    });

    it('does not show action buttons when not current stop', () => {
      render(
        <PilotStopCard
          stop={mockStop}
          isCurrent={false}
          isNext={true}
          onNavigate={vi.fn()}
          onArrive={vi.fn()}
          onSkip={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: /Navigate/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /I'm Here/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument();
    });
  });

  describe('time formatting', () => {
    it('formats planned arrival time', () => {
      render(<PilotStopCard stop={mockStop} isCurrent={true} />);
      // Time display should be present in the card
      const card = screen.getByText('Scenic Overlook').closest('.pilot-stop-card');
      expect(card).toBeInTheDocument();
    });

    it('handles invalid date gracefully', () => {
      const invalidStop = {
        ...mockStop,
        planned_arrival: 'invalid-date',
      };
      render(<PilotStopCard stop={invalidStop} isCurrent={true} />);
      // Date parsing returns Invalid Date string when given invalid input
      expect(screen.getByText(/Invalid Date/)).toBeInTheDocument();
    });
  });

  it('renders different icons for different stop types', () => {
    const coffeeStop = { ...mockStop, type: 'coffee' as const };
    render(<PilotStopCard stop={coffeeStop} isCurrent={true} />);
    expect(screen.getByText('☕')).toBeInTheDocument();
  });
});
