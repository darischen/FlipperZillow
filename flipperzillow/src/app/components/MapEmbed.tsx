'use client';

import { useRef, useEffect, useState } from 'react';

interface MapEmbedProps {
  lat: number;
  lng: number;
  address?: string;
}

export default function MapEmbed({ lat, lng, address }: MapEmbedProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (typeof window === 'undefined' || !window.google || !window.google.maps) return;

    const position = { lat, lng };

    if (!panoramaRef.current) {
      panoramaRef.current = new google.maps.StreetViewPanorama(mapContainerRef.current, {
        position,
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: true,
        fullscreenControl: true,
        motionTracking: false,
        motionTrackingControl: false,
      });

      panoramaRef.current.addListener('status_changed', () => {
        setIsLoading(false);
      });
    } else {
      panoramaRef.current.setPosition(position);
    }

    setIsLoading(false);
  }, [lat, lng]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      {address && (
        <p className="text-neutral-400 text-sm mb-2 text-center">{address}</p>
      )}
      <div className="relative aspect-video rounded-xl overflow-hidden shadow-2xl border border-neutral-800">
        {isLoading && (
          <div className="absolute inset-0 bg-neutral-800 animate-pulse rounded-xl z-10" />
        )}
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
