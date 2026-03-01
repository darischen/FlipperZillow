'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import PropertyCard from './components/PropertyCard';

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

interface ParsedQuery {
  location?: string;
  status?: string | null;
  beds_min?: number | null;
  beds_max?: number | null;
  baths_min?: number | null;
  baths_max?: number | null;
  price_min?: number | null;
  price_max?: number | null;
}

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError('');
    setListings([]);
    setParsedQuery(null);

    try {
      const res = await fetch('/api/tour/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Search failed');
      }

      const data = await res.json();
      setListings(data.listings || []);
      setParsedQuery(data.parsedQuery);
      setFromCache(data.fromCache || false);

      if (data.listings.length === 0) {
        setError('No listings found. Try a different search.');
      }
    } catch (err) {
      setError(String(err).replace('Error: ', ''));
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (listing: Listing) => {
    const target = listing.address || listing.title;
    const params = new URLSearchParams({ address: target });

    // Pass photos as JSON in URL if available
    if (listing.photo_urls && listing.photo_urls.length > 0) {
      params.append('photos', JSON.stringify(listing.photo_urls));
    }

    router.push(`/map?${params.toString()}`);
  };

  const hasResults = listings.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e27', color: '#fff' }}>
      {/* Hero */}
      <div
        style={{
          padding: hasResults ? '40px 20px' : '100px 20px 40px',
          textAlign: 'center',
          transition: 'padding 0.3s ease',
        }}
      >
        <h1 style={{ fontSize: '3rem', fontWeight: 'bold', margin: 0, marginBottom: 8 }}>
          FlipperZillow
        </h1>
        <p
          style={{
            fontSize: '1.1rem',
            opacity: 0.6,
            margin: 0,
            marginBottom: hasResults ? 20 : 36,
          }}
        >
          AI-Powered Property Search with 3D Tours
        </p>

        {/* Search */}
        <form
          onSubmit={handleSearch}
          style={{
            maxWidth: 620,
            margin: '0 auto',
            display: 'flex',
            gap: 12,
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder='e.g. "houses in San Diego" or "3 bed apartment in LA under 3000"'
            style={{
              flex: 1,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8,
              color: '#fff',
              fontSize: 16,
              outline: 'none',
            }}
            disabled={loading}
          />
          <button
            type="submit"
            style={{
              padding: '14px 32px',
              background: '#FBBF24',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Parsed query badge */}
      {parsedQuery && (
        <div style={{ textAlign: 'center', marginBottom: 20, padding: '0 20px' }}>
          <div
            style={{
              display: 'inline-flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'center',
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13,
              color: '#FBBF24',
            }}
          >
            {parsedQuery.location && <span>{parsedQuery.location}</span>}
            {parsedQuery.status && (
              <span>{parsedQuery.status === 'for_rent' ? 'For Rent' : 'For Sale'}</span>
            )}
            {parsedQuery.beds_min != null && <span>≥{parsedQuery.beds_min} bed</span>}
            {parsedQuery.baths_min != null && <span>≥{parsedQuery.baths_min} bath</span>}
            {parsedQuery.price_max != null && (
              <span>under ${parsedQuery.price_max.toLocaleString()}</span>
            )}
            {fromCache && (
              <span style={{ opacity: 0.6 }}>(cached)</span>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ maxWidth: 1200, margin: '0 auto 24px', padding: '0 20px' }}>
          <div
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 14,
              color: '#FCA5A5',
            }}
          >
            {error}
          </div>
        </div>
      )}

      {/* Results grid */}
      {hasResults && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 60px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 24 }}>
            {listings.length} Listings Found
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {listings.map((listing, idx) => (
              <PropertyCard
                key={idx}
                listing={listing}
                onClick={() => handleCardClick(listing)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
