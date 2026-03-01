'use client';

import Map3DViewer from './components/Map3DViewer';

export default function Home() {
  return (
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, background: '#0a0e27' }}>
      <Map3DViewer />
    </div>
  );
}
