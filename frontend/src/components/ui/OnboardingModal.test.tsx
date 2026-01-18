/**
 * OnboardingModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingModal from './OnboardingModal';
import { UserProvider } from '../../context/UserContext';

function renderModal(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <UserProvider>
        <OnboardingModal onClose={onClose} />
      </UserProvider>
    ),
  };
}

describe('OnboardingModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('welcome step', () => {
    it('should render welcome step initially', () => {
      renderModal();

      expect(screen.getByText(/Welcome to VistaTrek/)).toBeInTheDocument();
      expect(
        screen.getByText(/Discover hidden gems along your route/)
      ).toBeInTheDocument();
    });

    it('should show feature previews', () => {
      renderModal();

      expect(screen.getByText('Smart Route Planning')).toBeInTheDocument();
      expect(screen.getByText('Golden Triangle Clusters')).toBeInTheDocument();
      expect(screen.getByText('Real-time Navigation')).toBeInTheDocument();
    });

    it('should show Continue button', () => {
      renderModal();

      expect(screen.getByText('Continue')).toBeInTheDocument();
    });

    it('should not show Skip button on welcome step', () => {
      renderModal();

      expect(screen.queryByText('Skip')).not.toBeInTheDocument();
    });
  });

  describe('preferences step', () => {
    it('should navigate to preferences step when Continue clicked', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));

      expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
      expect(screen.getByLabelText(/Your Name/)).toBeInTheDocument();
    });

    it('should show hiking score slider', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));

      expect(
        screen.getByText(/How much do you enjoy hiking/)
      ).toBeInTheDocument();
      // Both sliders show 5/10 initially
      expect(screen.getAllByText('5/10').length).toBeGreaterThanOrEqual(1);
    });

    it('should show foodie score slider', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));

      expect(
        screen.getByText(/How much do you love food stops/)
      ).toBeInTheDocument();
    });

    it('should allow entering name', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));

      const nameInput = screen.getByLabelText(/Your Name/);
      await user.type(nameInput, 'John');

      expect(nameInput).toHaveValue('John');
    });

    it('should show Skip button on preferences step', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));

      expect(screen.getByText('Skip')).toBeInTheDocument();
    });
  });

  describe('nav-app step', () => {
    it('should navigate to nav-app step from preferences', async () => {
      const user = userEvent.setup();
      renderModal();

      // Welcome -> Preferences
      await user.click(screen.getByText('Continue'));
      // Preferences -> Nav App
      await user.click(screen.getByText('Continue'));

      expect(
        screen.getByText('Choose your navigation app')
      ).toBeInTheDocument();
    });

    it('should show navigation app options', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));

      expect(screen.getByText('Waze')).toBeInTheDocument();
      expect(screen.getByText('Google Maps')).toBeInTheDocument();
      expect(screen.getByText('Apple Maps')).toBeInTheDocument();
    });

    it('should allow selecting a navigation app', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));

      const googleBtn = screen.getByText('Google Maps').closest('button');
      await user.click(googleBtn!);

      expect(googleBtn).toHaveClass('selected');
    });
  });

  describe('complete step', () => {
    it('should navigate to complete step from nav-app', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));

      expect(screen.getByText(/You're all set/)).toBeInTheDocument();
      expect(
        screen.getByText('Start planning your first adventure')
      ).toBeInTheDocument();
    });

    it('should show Let\'s Go button on complete step', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));

      expect(screen.getByText("Let's Go!")).toBeInTheDocument();
    });

    it('should not show Skip button on complete step', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));

      expect(screen.queryByText('Skip')).not.toBeInTheDocument();
    });

    it('should call onClose when Let\'s Go clicked', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText("Let's Go!"));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('skip functionality', () => {
    it('should call onClose when Skip clicked on preferences', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Skip'));

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when Skip clicked on nav-app', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Continue'));
      await user.click(screen.getByText('Skip'));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('full flow', () => {
    it('should complete full onboarding flow', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      // Welcome
      expect(screen.getByText(/Welcome to VistaTrek/)).toBeInTheDocument();
      await user.click(screen.getByText('Continue'));

      // Preferences
      expect(screen.getByText('Tell us about yourself')).toBeInTheDocument();
      await user.type(screen.getByLabelText(/Your Name/), 'Test User');
      await user.click(screen.getByText('Continue'));

      // Nav App
      expect(
        screen.getByText('Choose your navigation app')
      ).toBeInTheDocument();
      await user.click(screen.getByText('Google Maps').closest('button')!);
      await user.click(screen.getByText('Continue'));

      // Complete
      expect(screen.getByText(/You're all set/)).toBeInTheDocument();
      await user.click(screen.getByText("Let's Go!"));

      expect(onClose).toHaveBeenCalled();
    });
  });
});
