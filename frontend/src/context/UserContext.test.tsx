/**
 * UserContext Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserProvider, useUser } from './UserContext';
import { STORAGE_KEYS } from '../types';

// Test component to access context
function TestConsumer() {
  const { profile, settings, updateProfile, updateSettings, completeOnboarding, setNavApp } = useUser();
  return (
    <div>
      <span data-testid="hiking-score">{profile.hiking_score}</span>
      <span data-testid="foodie-score">{profile.foodie_score}</span>
      <span data-testid="patience-score">{profile.patience_score}</span>
      <span data-testid="nav-app">{profile.preferred_nav_app}</span>
      <span data-testid="onboarding">{profile.onboarding_completed ? 'done' : 'pending'}</span>
      <span data-testid="gps-tracking">{settings.gps_tracking ? 'on' : 'off'}</span>
      <button onClick={() => updateProfile({ hiking_score: 8 })}>Update Hiking</button>
      <button onClick={() => setNavApp('google')}>Change Nav</button>
      <button onClick={completeOnboarding}>Complete Onboarding</button>
      <button onClick={() => updateSettings({ gps_tracking: false })}>Disable GPS</button>
    </div>
  );
}

describe('UserContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides default user profile values', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('hiking-score').textContent).toBe('5');
    expect(screen.getByTestId('foodie-score').textContent).toBe('5');
    expect(screen.getByTestId('patience-score').textContent).toBe('5');
    expect(screen.getByTestId('nav-app').textContent).toBe('waze');
  });

  it('provides default settings values', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('gps-tracking').textContent).toBe('on');
  });

  it('updates user profile', async () => {
    const user = userEvent.setup();
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    await user.click(screen.getByText('Update Hiking'));
    expect(screen.getByTestId('hiking-score').textContent).toBe('8');
  });

  it('updates navigation app preference', async () => {
    const user = userEvent.setup();
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    await user.click(screen.getByText('Change Nav'));
    expect(screen.getByTestId('nav-app').textContent).toBe('google');
  });

  it('tracks onboarding completion', async () => {
    const user = userEvent.setup();
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('onboarding').textContent).toBe('pending');
    await user.click(screen.getByText('Complete Onboarding'));
    expect(screen.getByTestId('onboarding').textContent).toBe('done');
  });

  it('updates settings', async () => {
    const user = userEvent.setup();
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('gps-tracking').textContent).toBe('on');
    await user.click(screen.getByText('Disable GPS'));
    expect(screen.getByTestId('gps-tracking').textContent).toBe('off');
  });

  it('persists user profile to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    await user.click(screen.getByText('Update Hiking'));

    // Wait for effect to run
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.hiking_score).toBe(8);
  });

  it('loads user profile from localStorage', async () => {
    // Pre-populate localStorage
    localStorage.setItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify({
        id: 'test-id',
        hiking_score: 10,
        foodie_score: 3,
        patience_score: 7,
        preferred_nav_app: 'apple',
        onboarding_completed: false,
      })
    );

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    // Wait for hydration
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('hiking-score').textContent).toBe('10');
    expect(screen.getByTestId('foodie-score').textContent).toBe('3');
    expect(screen.getByTestId('patience-score').textContent).toBe('7');
    expect(screen.getByTestId('nav-app').textContent).toBe('apple');
  });

  it('throws error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useUser must be used within UserProvider');

    consoleSpy.mockRestore();
  });
});
