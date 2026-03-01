import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  setupGoogleMapsMock,
  triggerPlaceChanged,
  resetGoogleMapsMock,
} from '../../src/test/mocks/google-maps';
import Home from '@/app/page';

describe('Landing Page (Home)', () => {
  beforeEach(() => {
    resetGoogleMapsMock();
    setupGoogleMapsMock();
  });

  it('renders FlipperZillow heading', () => {
    render(<Home />);

    // Look for the heading with case-insensitive match
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/FlipperZillow/i);
  });

  it('renders address search bar', () => {
    render(<Home />);

    const input = screen.getByPlaceholderText('Enter a property address...');
    expect(input).toBeInTheDocument();
  });

  it('does not show map initially', () => {
    render(<Home />);

    const google = (window as unknown as Record<string, unknown>).google as {
      maps: { StreetViewPanorama: ReturnType<typeof import('vitest').vi.fn> };
    };

    // StreetViewPanorama should not have been created initially
    expect(google.maps.StreetViewPanorama).not.toHaveBeenCalled();
  });

  it('shows map after address selection', async () => {
    render(<Home />);

    // Trigger the place_changed event to simulate address selection
    await act(async () => {
      triggerPlaceChanged();
    });

    const google = (window as unknown as Record<string, unknown>).google as {
      maps: { StreetViewPanorama: ReturnType<typeof import('vitest').vi.fn> };
    };

    // After address selection, StreetViewPanorama should have been created
    expect(google.maps.StreetViewPanorama).toHaveBeenCalled();
  });

  it('shows Start Tour button after address selection', async () => {
    render(<Home />);

    // Before selection, there should be no Start Tour button
    expect(screen.queryByRole('button', { name: /start tour/i })).not.toBeInTheDocument();

    // Trigger place selection
    await act(async () => {
      triggerPlaceChanged();
    });

    // After selection, the Start Tour button should appear
    const startButton = screen.getByRole('button', { name: /start tour/i });
    expect(startButton).toBeInTheDocument();
  });
});
