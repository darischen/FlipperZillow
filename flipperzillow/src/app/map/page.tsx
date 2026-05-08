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
      // Upgrade realtor.com CDN URLs to high-res immediately
      photoUrls = photoUrls.map(url => {
        if (url.includes('ap.rdcpix.com')) {
          if (url.endsWith('s.jpg')) {
            return url.slice(0, -5) + 'rd-w1024_h768.jpg';
          } else if (url.includes('rd-w')) {
            return url.replace(/rd-w\d+_h\d+/g, 'rd-w1024_h768');
          }
        }
        return url;
      });
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
