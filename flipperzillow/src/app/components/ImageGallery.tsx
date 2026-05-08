'use client';

import { useState, useEffect } from 'react';
import { SAM3DClient } from '@/lib/sam3d/client';
import SAM3DViewer from './SAM3DViewer';

interface ImageGalleryProps {
  address: string;
  initialPhotos?: string[];
}

export default function ImageGallery({ address, initialPhotos = [] }: ImageGalleryProps) {
  const [images, setImages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [sam3dLoading, setSam3dLoading] = useState(false);
  const [sam3dError, setSam3dError] = useState<string | null>(null);
  const [sam3dGlbUrl, setSam3dGlbUrl] = useState<string | null>(null);
  const [sam3dProgress, setSam3dProgress] = useState<string>('');

  useEffect(() => {
    if (initialPhotos.length > 0) {
      console.log('[ImageGallery] Displaying images:', initialPhotos.length);
      setImages(initialPhotos);
      setSelectedIndex(0);
    }
  }, [initialPhotos]);

  const selectedImage = selectedIndex !== null ? images[selectedIndex] : null;

  const handle3DGeneration = async () => {
    if (selectedIndex === null || !selectedImage) return;

    setSam3dLoading(true);
    setSam3dError(null);
    setSam3dGlbUrl(null);
    setSam3dProgress('Starting Docker container...');

    try {
      const client = SAM3DClient.getInstance();
      const result = await client.inferenceWithCleanup(
        selectedImage,
        (status) => setSam3dProgress(status)
      );

      if (result.success && result.glbUrl) {
        setSam3dGlbUrl(result.glbUrl);
        setSam3dProgress('');
        console.log('[ImageGallery] 3D mesh generated:', result.glbUrl);
      } else {
        setSam3dError(result.error || 'Unknown error generating 3D mesh');
        setSam3dProgress('');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setSam3dError(errorMsg);
      setSam3dProgress('');
    } finally {
      setSam3dLoading(false);
    }
  };

  if (images.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: 'rgba(0, 0, 0, 0.85)',
          padding: 16,
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
          zIndex: 10,
          width: 340,
          color: 'white',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, paddingBottom: 12 }}>
          Property Images
        </h2>
        <div style={{ textAlign: 'center', padding: '32px 0', opacity: 0.4 }}>
          <p style={{ fontSize: 13, margin: 0 }}>No images available</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Search from the home page to see listing photos</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        background: 'rgba(0, 0, 0, 0.85)',
        padding: 16,
        borderRadius: 12,
        backdropFilter: 'blur(10px)',
        zIndex: 10,
        width: 340,
        maxHeight: 'calc(100vh - 40px)',
        color: 'white',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
        Property Images
      </h2>

      {/* Selected image preview */}
      {selectedImage && (
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <div
            style={{
              width: '100%',
              height: 200,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <img
              src={selectedImage}
              alt={`Property image ${selectedIndex! + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
              {selectedIndex! + 1} / {images.length}
            </p>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={handle3DGeneration}
                disabled={sam3dLoading || selectedIndex === null}
                title="Generate 3D mesh for this room"
                style={{
                  background: sam3dLoading ? 'rgba(33, 150, 243, 0.3)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  color: 'white',
                  padding: '2px 8px',
                  cursor: sam3dLoading || selectedIndex === null ? 'default' : 'pointer',
                  opacity: sam3dLoading || selectedIndex === null ? 0.3 : 1,
                  fontSize: 12,
                }}
              >
                {sam3dLoading ? '⏳ 3D' : '3D'}
              </button>
              <button
                onClick={() => setSelectedIndex(Math.max(0, (selectedIndex ?? 0) - 1))}
                disabled={selectedIndex === 0}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  color: 'white',
                  padding: '2px 8px',
                  cursor: selectedIndex === 0 ? 'default' : 'pointer',
                  opacity: selectedIndex === 0 ? 0.3 : 1,
                  fontSize: 12,
                }}
              >
                Prev
              </button>
              <button
                onClick={() => setSelectedIndex(Math.min(images.length - 1, (selectedIndex ?? 0) + 1))}
                disabled={selectedIndex === images.length - 1}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  color: 'white',
                  padding: '2px 8px',
                  cursor: selectedIndex === images.length - 1 ? 'default' : 'pointer',
                  opacity: selectedIndex === images.length - 1 ? 0.3 : 1,
                  fontSize: 12,
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          maxHeight: 140,
          overflow: 'auto',
        }}
      >
        {images.map((url, idx) => (
          <div
            key={idx}
            onClick={() => setSelectedIndex(idx)}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 4,
              overflow: 'hidden',
              border: selectedIndex === idx ? '2px solid #2196F3' : '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
              opacity: selectedIndex === idx ? 1 : hoveredIndex === idx ? 0.9 : 0.65,
            }}
          >
            <img
              src={url}
              alt={`Thumbnail ${idx + 1}`}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ))}
      </div>

      {/* 3D mesh status/loading indicator */}
      {(sam3dLoading || sam3dError || sam3dGlbUrl) && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 12, paddingTop: 12 }}>
          {sam3dLoading && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 6px 0', color: '#2196F3' }}>
                Generating 3D...
              </p>
              <p style={{ fontSize: 10, opacity: 0.7, margin: 0 }}>
                {sam3dProgress}
              </p>
            </div>
          )}
          {sam3dError && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 6px 0', color: '#FF6B6B' }}>
                Error
              </p>
              <p style={{ fontSize: 10, opacity: 0.7, margin: 0, wordBreak: 'break-word' }}>
                {sam3dError}
              </p>
              <button
                onClick={() => setSam3dError(null)}
                style={{
                  background: 'rgba(255,100,100,0.2)',
                  border: '1px solid rgba(255,100,100,0.4)',
                  borderRadius: 4,
                  color: 'rgba(255,150,150,1)',
                  padding: '2px 6px',
                  marginTop: 6,
                  cursor: 'pointer',
                  fontSize: 10,
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          {sam3dGlbUrl && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 6px 0', color: '#4CAF50' }}>
                ✓ 3D Model Ready
              </p>
              <button
                onClick={() => setSam3dGlbUrl(null)}
                style={{
                  background: 'rgba(76,175,80,0.2)',
                  border: '1px solid rgba(76,175,80,0.4)',
                  borderRadius: 4,
                  color: 'rgba(150,255,150,1)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: 10,
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>

    {sam3dGlbUrl && <SAM3DViewer glbUrl={sam3dGlbUrl} onClose={() => setSam3dGlbUrl(null)} />}
    </>
  );
}
