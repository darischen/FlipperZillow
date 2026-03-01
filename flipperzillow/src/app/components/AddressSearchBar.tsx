'use client';

import { useRef, useEffect, useCallback } from 'react';

export interface AddressSearchResult {
  address: string;
  lat: number;
  lng: number;
}

interface AddressSearchBarProps {
  onAddressSelect: (result: AddressSearchResult) => void;
}

export default function AddressSearchBar({ onAddressSelect }: AddressSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const handlePlaceChanged = useCallback(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete) return;

    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;

    const result: AddressSearchResult = {
      address: place.formatted_address || '',
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };

    onAddressSelect(result);
  }, [onAddressSelect]);

  const handleGeocodeAddress = useCallback(async () => {
    const input = inputRef.current?.value.trim();
    if (!input || !geocoderRef.current) return;

    try {
      const response = await geocoderRef.current.geocode({ address: input });

      if (!response.results || response.results.length === 0) {
        console.error('Address not found');
        return;
      }

      const location = response.results[0];
      const result: AddressSearchResult = {
        address: location.formatted_address || input,
        lat: location.geometry.location.lat(),
        lng: location.geometry.location.lng(),
      };

      onAddressSelect(result);
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  }, [onAddressSelect]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGeocodeAddress();
      }
    },
    [handleGeocodeAddress]
  );

  useEffect(() => {
    if (!inputRef.current) return;
    if (typeof window === 'undefined' || !window.google || !window.google.maps) return;

    // Initialize Geocoder
    const Geocoder = (window.google.maps as any).Geocoder;
    geocoderRef.current = new Geocoder();

    // Initialize Autocomplete
    if (window.google.maps.places?.Autocomplete) {
      const autocomplete = new window.google.maps.places!.Autocomplete!(inputRef.current, {
        types: ['address'],
        fields: ['formatted_address', 'geometry'],
      });

      autocomplete.addListener('place_changed', handlePlaceChanged);
      autocompleteRef.current = autocomplete;

      return () => {
        window.google?.maps?.event?.clearInstanceListeners(autocomplete);
      };
    }
  }, [handlePlaceChanged]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <input
        ref={inputRef}
        type="text"
        placeholder="Enter a property address (or select from suggestions)..."
        onKeyPress={handleKeyPress}
        className="w-full px-6 py-4 text-lg rounded-xl border border-neutral-700 bg-neutral-900 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-lg"
      />
    </div>
  );
}
