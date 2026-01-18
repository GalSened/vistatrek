/**
 * LoadingSpinner Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders spinner element', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('renders without message by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-message')).not.toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<LoadingSpinner message="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('renders in small size when size="small"', () => {
    const { container } = render(<LoadingSpinner size="small" />);
    expect(container.querySelector('.loading-spinner--small')).toBeInTheDocument();
  });

  it('renders in medium size by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.loading-spinner--medium')).toBeInTheDocument();
  });

  it('renders in large size when size="large"', () => {
    const { container } = render(<LoadingSpinner size="large" />);
    expect(container.querySelector('.loading-spinner--large')).toBeInTheDocument();
  });
});
