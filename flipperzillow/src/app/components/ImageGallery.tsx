'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface ImageGalleryProps {
  address: string;
}

export default function ImageGallery({ address }: ImageGalleryProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrapeImages = useCallback(async (addr: string) => {
    if (!addr || !addr.trim()) return;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setImages([]);
    setSelectedImageIndex(null);

    try {
      console.log('[ImageGallery] Scraping images for:', addr);
      const response = await fetch('/api/tour/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Scrape failed (${response.status})`);
      }

      const data = await response.json();
      console.log('[ImageGallery] Received', data.count, 'images');

      if (!data.images || data.images.length === 0) {
        throw new Error('No images found for this address');
      }

      setImages(data.images);
      setSelectedImageIndex(0);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Failed to scrape images';
      console.error('[ImageGallery] Error:', msg);
      setError(msg);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Expose scrapeImages to window so Map3DViewer's vanilla JS can call it
  useEffect(() => {
    (window as any).evScrapeImages = scrapeImages;
    return () => {
      delete (window as any).evScrapeImages;
    };
  }, [scrapeImages]);

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginTop: 12 }}>
        {/* Selected image preview */}
        {selectedImageIndex !== null && images.length > 0 && (
          <div style={{ marginBottom: 12 }}>
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
                src={images[selectedImageIndex]}
                alt={`Property image ${selectedImageIndex + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
                {selectedImageIndex + 1} / {images.length}
              </p>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setSelectedImageIndex(Math.max(0, (selectedImageIndex ?? 0) - 1))}
                  disabled={selectedImageIndex === 0}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    color: 'white',
                    padding: '2px 8px',
                    cursor: selectedImageIndex === 0 ? 'default' : 'pointer',
                    opacity: selectedImageIndex === 0 ? 0.3 : 1,
                    fontSize: 12,
                  }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setSelectedImageIndex(Math.min(images.length - 1, (selectedImageIndex ?? 0) + 1))}
                  disabled={selectedImageIndex === images.length - 1}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    color: 'white',
                    padding: '2px 8px',
                    cursor: selectedImageIndex === images.length - 1 ? 'default' : 'pointer',
                    opacity: selectedImageIndex === images.length - 1 ? 0.3 : 1,
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
        {images.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              overflow: 'auto',
              maxHeight: 180,
              paddingRight: 4,
            }}
          >
            {images.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedImageIndex(idx)}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: selectedImageIndex === idx ? '2px solid #2196F3' : '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                  opacity: selectedImageIndex === idx ? 1 : hoveredIndex === idx ? 0.9 : 0.65,
                  position: 'relative',
                }}
              >
                <img
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div
              style={{
                display: 'inline-block',
                width: 28,
                height: 28,
                border: '3px solid rgba(33,150,243,0.2)',
                borderTop: '3px solid #2196F3',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ fontSize: 12, opacity: 0.5, margin: '12px 0 0' }}>Scraping property images...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{
            background: 'rgba(211,47,47,0.15)',
            padding: 12,
            borderRadius: 6,
            borderLeft: '3px solid #f44336',
            marginTop: 8,
          }}>
            <p style={{ fontSize: 12, color: '#ff8a80', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && images.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', opacity: 0.4 }}>
            <p style={{ fontSize: 13, margin: 0 }}>No images yet</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Search an address to load photos</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
