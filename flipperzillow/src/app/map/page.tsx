'use client';

import { use } from 'react';
import Map3DViewer from '../components/Map3DViewer';

interface SearchParams {
  address?: string;
  photos?: string;
}

export default function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = use(searchParams);
  const address = params.address ?? '';

  let photoUrls: string[] = [];
  if (params.photos) {
    try {
      photoUrls = JSON.parse(params.photos);
    } catch {
      photoUrls = [];
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        margin: 0,
        padding: 0,
        background: '#0a0e27',
      }}
    >
      <Map3DViewer initialAddress={address} initialPhotos={photoUrls} />
    </div>
  );
}
