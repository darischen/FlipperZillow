'use client';

import React, { useState } from 'react';

interface Listing {
  title: string;
  price?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  address?: string | null;
  thumbnail_url?: string | null;
  photo_urls?: string[];
  listing_url: string;
}

interface PropertyCardProps {
  listing: Listing;
  onClick: () => void;
}

export default function PropertyCard({ listing, onClick }: PropertyCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#111827',
        border: '1px solid #1f2937',
        transition: 'transform 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.borderColor = '#FBBF24';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.borderColor = '#1f2937';
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', width: '100%', height: 200, background: '#1f2937' }}>
        {listing.thumbnail_url && !imgError ? (
          <img
            src={listing.thumbnail_url}
            alt={listing.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4b5563',
              fontSize: 48,
            }}
          >
            ⌂
          </div>
        )}

        {/* Price badge */}
        {listing.price && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: '#FBBF24',
              color: '#000',
              padding: '4px 10px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {listing.price}
          </div>
        )}

        {/* Beds/Baths badge */}
        {(listing.beds != null || listing.baths != null) && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'rgba(0,0,0,0.75)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {listing.beds != null ? `${listing.beds}bd` : ''}
            {listing.beds != null && listing.baths != null ? ' · ' : ''}
            {listing.baths != null ? `${listing.baths}ba` : ''}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px' }}>
        <h3
          style={{
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
            margin: 0,
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {listing.title}
        </h3>

        {listing.address && (
          <p style={{ color: '#9ca3af', fontSize: 12, margin: 0, marginBottom: 4 }}>
            {listing.address}
          </p>
        )}

        {listing.sqft && (
          <p style={{ color: '#6b7280', fontSize: 12, margin: 0, marginBottom: 8 }}>
            {listing.sqft.toLocaleString()} sqft
          </p>
        )}

        <a
          href={listing.listing_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#FBBF24', fontSize: 12, fontWeight: 500 }}
          onClick={(e) => e.stopPropagation()}
        >
          View on Realtor.com →
        </a>
      </div>
    </div>
  );
}
