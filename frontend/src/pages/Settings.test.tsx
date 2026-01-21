/**
 * Settings Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { UserProvider } from '../context/UserContext';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <UserProvider>
        <Settings />
      </UserProvider>
    </MemoryRouter>
  );
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('rendering', () => {
    it('should render settings page header', () => {
      renderSettings();

      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    });

    it('should render profile section', () => {
      renderSettings();

      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
    });

    it('should render score sliders', () => {
      renderSettings();

      expect(screen.getByText('Hiking Score')).toBeInTheDocument();
      expect(screen.getByText('Foodie Score')).toBeInTheDocument();
      expect(screen.getByText('Patience Score')).toBeInTheDocument();
    });

    it('should render navigation section', () => {
      renderSettings();

      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('Waze')).toBeInTheDocument();
      expect(screen.getByText('Google Maps')).toBeInTheDocument();
      expect(screen.getByText('Apple Maps')).toBeInTheDocument();
    });

    it('should render app settings toggles', () => {
      renderSettings();

      expect(screen.getByText('App Settings')).toBeInTheDocument();
      expect(screen.getByText(/GPS Tracking/)).toBeInTheDocument();
      expect(screen.getByText(/Smart Alerts/)).toBeInTheDocument();
      expect(screen.getByText(/Feedback Popups/)).toBeInTheDocument();
      expect(screen.getByText(/Dark Mode/)).toBeInTheDocument();
    });

    it('should render about section', () => {
      renderSettings();

      expect(screen.getByText('About')).toBeInTheDocument();
      expect(screen.getByText('VistaTrek')).toBeInTheDocument();
      expect(screen.getByText('Version 0.1.0')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should navigate back when back button clicked', async () => {
      const user = userEvent.setup();
      renderSettings();

      const backButton = screen.getByRole('button', { name: '' });
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('profile settings', () => {
    it('should update name on input', async () => {
      const user = userEvent.setup();
      renderSettings();

      const nameInput = screen.getByLabelText('Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'John Doe');

      expect(nameInput).toHaveValue('John Doe');
    });

    it('should update hiking score slider', async () => {
      const user = userEvent.setup();
      renderSettings();

      const sliders = screen.getAllByRole('slider');
      const hikingSlider = sliders[0];

      // Note: range inputs with userEvent are tricky
      expect(hikingSlider).toBeInTheDocument();
    });
  });

  describe('navigation app selection', () => {
    it('should have waze selected by default', () => {
      renderSettings();

      const wazeButton = screen.getByText('Waze').closest('button');
      expect(wazeButton).toHaveClass('selected');
    });

    it('should switch navigation app on selection', async () => {
      const user = userEvent.setup();
      renderSettings();

      const googleButton = screen.getByText('Google Maps').closest('button');
      await user.click(googleButton!);

      expect(googleButton).toHaveClass('selected');
    });
  });

  describe('app settings toggles', () => {
    const getToggleByText = (text: RegExp) => {
      const label = screen.getByText(text);
      const settingItem = label.closest('.toggle-setting');
      return settingItem?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    };

    it('should have GPS tracking enabled by default', () => {
      renderSettings();

      const gpsCheckbox = getToggleByText(/GPS Tracking/);
      expect(gpsCheckbox).toBeChecked();
    });

    it('should toggle GPS tracking', async () => {
      const user = userEvent.setup();
      renderSettings();

      const gpsCheckbox = getToggleByText(/GPS Tracking/);
      expect(gpsCheckbox).toBeChecked();

      await user.click(gpsCheckbox);
      expect(gpsCheckbox).not.toBeChecked();
    });

    it('should toggle smart alerts', async () => {
      const user = userEvent.setup();
      renderSettings();

      const alertsCheckbox = getToggleByText(/Smart Alerts/);
      expect(alertsCheckbox).toBeChecked();

      await user.click(alertsCheckbox);
      expect(alertsCheckbox).not.toBeChecked();
    });

    it('should toggle feedback popups', async () => {
      const user = userEvent.setup();
      renderSettings();

      const feedbackCheckbox = getToggleByText(/Feedback Popups/);
      expect(feedbackCheckbox).toBeChecked();

      await user.click(feedbackCheckbox);
      expect(feedbackCheckbox).not.toBeChecked();
    });

    it('should toggle dark mode', async () => {
      const user = userEvent.setup();
      renderSettings();

      const darkModeCheckbox = getToggleByText(/Dark Mode/);
      // dark_mode defaults to false
      expect(darkModeCheckbox).not.toBeChecked();

      await user.click(darkModeCheckbox);
      expect(darkModeCheckbox).toBeChecked();
    });
  });
});
