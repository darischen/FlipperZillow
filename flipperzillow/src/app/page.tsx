'use client';

import { useState } from 'react';
import AddressSearchBar, { AddressSearchResult } from './components/AddressSearchBar';
import MapEmbed from './components/MapEmbed';

export default function Home() {
  const [selectedAddress, setSelectedAddress] = useState<AddressSearchResult | null>(null);
  const [isStartingTour, setIsStartingTour] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);

  const handleAddressSelect = (result: AddressSearchResult) => {
    setSelectedAddress(result);
    setTourError(null);
  };

  const handleStartTour = async () => {
    if (!selectedAddress) return;

    setIsStartingTour(true);
    setTourError(null);

    try {
      const response = await fetch('/api/tour/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: selectedAddress.address }),
      });

      const data = await response.json();

      if (!response.ok) {
        setTourError(data.error || 'Failed to start tour');
        return;
      }

      console.log('Tour started:', data);
    } catch (err) {
      console.error('Error starting tour:', err);
      setTourError('An unexpected error occurred. Please try again.');
    } finally {
      setIsStartingTour(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <main className="flex flex-col items-center px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12 max-w-3xl">
          <h1 className="text-6xl font-bold tracking-tight mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            FlipperZillow
          </h1>
          <p className="text-2xl text-neutral-300 mb-2">AI-Powered House Tours</p>
          <p className="text-neutral-500 text-lg max-w-xl mx-auto">
            Enter any property address to experience an immersive 3D tour with
            AI-generated narration and intelligent room analysis.
          </p>
        </div>

        {/* Address Search */}
        <div className="w-full max-w-2xl mb-12">
          <AddressSearchBar onAddressSelect={handleAddressSelect} />
        </div>

        {/* Map and Tour Controls */}
        {selectedAddress && (
          <div className="w-full max-w-4xl space-y-8 animate-in fade-in duration-500">
            <MapEmbed
              lat={selectedAddress.lat}
              lng={selectedAddress.lng}
              address={selectedAddress.address}
            />

            <div className="flex flex-col items-center gap-4">
              <button
                onClick={handleStartTour}
                disabled={isStartingTour}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-lg font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/25"
              >
                {isStartingTour ? 'Starting Tour...' : 'Start Tour'}
              </button>

              {tourError && (
                <p className="text-red-400 text-sm">{tourError}</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
