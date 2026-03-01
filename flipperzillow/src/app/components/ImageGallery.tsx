'use client';

import { useState, useEffect } from 'react';

interface ImageGalleryProps {
  address: string;
  initialPhotos?: string[];
}

export default function ImageGallery({ address, initialPhotos = [] }: ImageGalleryProps) {
  const [images, setImages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (initialPhotos.length > 0) {
      setImages(initialPhotos);
      setSelectedIndex(0);
    }
  }, [initialPhotos]);

  const selectedImage = selectedIndex !== null ? images[selectedIndex] : null;

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
    </div>
  );
}
