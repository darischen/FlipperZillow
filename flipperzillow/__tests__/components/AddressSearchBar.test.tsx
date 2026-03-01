import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  setupGoogleMapsMock,
  teardownGoogleMapsMock,
  triggerPlaceChanged,
  mockAutocompleteInstance,
  resetGoogleMapsMock,
} from '../../src/test/mocks/google-maps';
import AddressSearchBar from '@/app/components/AddressSearchBar';

describe('AddressSearchBar', () => {
  const mockOnAddressSelect = vi.fn();

  beforeEach(() => {
    mockOnAddressSelect.mockClear();
    resetGoogleMapsMock();
    // Ensure google maps mock is available
    setupGoogleMapsMock();
  });

  it('renders an input with correct placeholder', () => {
    render(<AddressSearchBar onAddressSelect={mockOnAddressSelect} />);

    const input = screen.getByPlaceholderText('Enter a property address...');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('initializes Google Places Autocomplete on mount', () => {
    render(<AddressSearchBar onAddressSelect={mockOnAddressSelect} />);

    const google = (window as unknown as Record<string, unknown>).google as {
      maps: { places: { Autocomplete: ReturnType<typeof vi.fn> } };
    };

    expect(google.maps.places.Autocomplete).toHaveBeenCalled();

    // Verify the Autocomplete was called with an HTMLInputElement
    const constructorCall = google.maps.places.Autocomplete.mock.calls[0];
    expect(constructorCall[0]).toBeInstanceOf(HTMLInputElement);
  });

  it('calls onAddressSelect when a place is selected', () => {
    render(<AddressSearchBar onAddressSelect={mockOnAddressSelect} />);

    // Verify that the autocomplete registered a place_changed listener
    expect(mockAutocompleteInstance.addListener).toHaveBeenCalledWith(
      'place_changed',
      expect.any(Function)
    );

    // Trigger the place_changed event
    triggerPlaceChanged();

    // Verify onAddressSelect was called with the correct data
    expect(mockOnAddressSelect).toHaveBeenCalledTimes(1);
    expect(mockOnAddressSelect).toHaveBeenCalledWith({
      address: '123 Test St, San Francisco, CA 94102',
      lat: 37.7749,
      lng: -122.4194,
    });
  });

  it('handles missing google.maps gracefully', () => {
    // Remove the Google Maps mock
    teardownGoogleMapsMock();

    // Should not throw when rendered without google.maps
    expect(() => {
      render(<AddressSearchBar onAddressSelect={mockOnAddressSelect} />);
    }).not.toThrow();

    // Should still render the input
    const input = screen.getByPlaceholderText('Enter a property address...');
    expect(input).toBeInTheDocument();

    // Restore the mock for other tests
    setupGoogleMapsMock();
  });

  it('renders as an input element that can receive user typing', () => {
    render(<AddressSearchBar onAddressSelect={mockOnAddressSelect} />);

    const input = screen.getByPlaceholderText(
      'Enter a property address...'
    ) as HTMLInputElement;
    expect(input).toBeEnabled();
    expect(input.type).toBe('text');
  });
});
