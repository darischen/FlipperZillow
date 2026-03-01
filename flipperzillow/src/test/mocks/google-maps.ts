import { vi } from 'vitest';

let placeChangedCallback: (() => void) | null = null;
let lastAutocompleteInput: HTMLInputElement | null = null;

export const mockPlace = {
  formatted_address: '123 Test St, San Francisco, CA 94102',
  geometry: {
    location: {
      lat: () => 37.7749,
      lng: () => -122.4194,
    },
  },
};

export const mockAutocompleteInstance = {
  addListener: vi.fn((event: string, callback: () => void) => {
    if (event === 'place_changed') {
      placeChangedCallback = callback;
    }
  }),
  getPlace: vi.fn(() => mockPlace),
  setFields: vi.fn(),
};

export const mockPanoramaInstance = {
  setPosition: vi.fn(),
  setPov: vi.fn(),
  addListener: vi.fn(),
};

export const mockGeocoderInstance = {
  geocode: vi.fn().mockResolvedValue([
    [
      {
        geometry: {
          location: {
            lat: () => 37.7749,
            lng: () => -122.4194,
          },
        },
        formatted_address: '123 Test St, San Francisco, CA 94102',
      },
    ],
  ]),
};

// Use class-based mocks so they work with `new` keyword
const MockAutocomplete = vi.fn(function (this: typeof mockAutocompleteInstance, input: HTMLInputElement) {
  lastAutocompleteInput = input;
  Object.assign(this, mockAutocompleteInstance);
}) as unknown as typeof google.maps.places.Autocomplete;

const MockStreetViewPanorama = vi.fn(function (this: typeof mockPanoramaInstance) {
  Object.assign(this, mockPanoramaInstance);
}) as unknown as typeof google.maps.StreetViewPanorama;

const MockGeocoder = vi.fn(function (this: typeof mockGeocoderInstance) {
  Object.assign(this, mockGeocoderInstance);
}) as unknown as typeof google.maps.Geocoder;

const MockLatLng = vi.fn(function () {}) as unknown as typeof google.maps.LatLng;

export function setupGoogleMapsMock() {
  const google = {
    maps: {
      places: {
        Autocomplete: MockAutocomplete,
      },
      StreetViewPanorama: MockStreetViewPanorama,
      Geocoder: MockGeocoder,
      LatLng: MockLatLng,
      event: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        clearInstanceListeners: vi.fn(),
      },
    },
  };

  (window as unknown as Record<string, unknown>).google = google;
  return google;
}

export function teardownGoogleMapsMock() {
  delete (window as unknown as Record<string, unknown>).google;
}

export function triggerPlaceChanged() {
  if (placeChangedCallback) {
    placeChangedCallback();
  }
}

export function getLastAutocompleteInput() {
  return lastAutocompleteInput;
}

export function resetGoogleMapsMock() {
  placeChangedCallback = null;
  lastAutocompleteInput = null;
  mockAutocompleteInstance.addListener.mockClear();
  mockAutocompleteInstance.getPlace.mockClear();
  mockAutocompleteInstance.setFields.mockClear();
  mockPanoramaInstance.setPosition.mockClear();
  mockPanoramaInstance.setPov.mockClear();
  mockPanoramaInstance.addListener.mockClear();
  mockGeocoderInstance.geocode.mockClear();
  (MockAutocomplete as ReturnType<typeof vi.fn>).mockClear();
  (MockStreetViewPanorama as ReturnType<typeof vi.fn>).mockClear();
  (MockGeocoder as ReturnType<typeof vi.fn>).mockClear();

  // Restore default getPlace behavior after clearing
  mockAutocompleteInstance.getPlace.mockReturnValue(mockPlace);
}
