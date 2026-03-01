import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

// ---------- local cache ----------
// Cache lives at src/data/realtor_cache.json (relative to Next.js src/)
// Structure: { [cacheKey]: { ts: number, data: RealtorAPIResponse } }
const CACHE_PATH = path.join(
  process.cwd(),
  'src',
  'data',
  'realtor_cache.json',
);

function readCache(): Record<string, { ts: number; data: any }> {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    }
  } catch {
    // corrupted file – start fresh
  }
  return {};
}

function writeCache(cache: Record<string, { ts: number; data: any }>) {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function cacheKey(location: string, limit: number): string {
  return `${location.toLowerCase().trim()}__${limit}`;
}

// ---------- Zod schemas ----------
const SearchRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
});

const ParsedQuerySchema = z.object({
  error: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(['for_sale', 'for_rent']).optional().nullable(),
  beds_min: z.number().int().positive().optional().nullable(),
  beds_max: z.number().int().positive().optional().nullable(),
  baths_min: z.number().positive().optional().nullable(),
  baths_max: z.number().positive().optional().nullable(),
  price_min: z.number().int().positive().optional().nullable(),
  price_max: z.number().int().positive().optional().nullable(),
  keywords: z.string().optional().nullable(),
});

type ParsedQuery = z.infer<typeof ParsedQuerySchema>;

// ---------- Realtor.com API helpers ----------
interface RealtorListing {
  title: string;
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  thumbnail_url: string | null;
  photo_urls: string[];
  listing_url: string;
  lat: number | null;
  lon: number | null;
}

function parseRealtorResults(apiData: any): RealtorListing[] {
  const results =
    apiData?.data?.home_search?.results ?? apiData?.data?.results ?? [];
  const listings: RealtorListing[] = [];

  for (const r of results) {
    try {
      const desc = r.description ?? {};
      const addr = r.location?.address ?? {};
      const coord = addr.coordinate ?? {};

      const photos: string[] = (r.photos ?? [])
        .map((p: any) => p.href)
        .filter(Boolean);
      const primaryPhoto = r.primary_photo?.href ?? null;
      const thumbnail = primaryPhoto ?? photos[0] ?? null;

      const line = addr.line ?? addr.formattedStreetLine ?? '';
      const city = addr.city ?? '';
      const stateCode = addr.state_code ?? addr.state ?? '';
      const fullAddress = [line, city, stateCode].filter(Boolean).join(', ');

      const beds = desc.beds ?? r.rentalExtension?.bedRange?.max ?? null;
      const bathsRaw =
        desc.baths_consolidated ?? r.rentalExtension?.bathRange?.max ?? null;
      const baths = bathsRaw != null ? parseFloat(String(bathsRaw)) : null;

      const listPrice = r.list_price ?? r.rentalExtension?.rentPriceRange?.max ?? null;
      const priceStr = listPrice != null ? `$${Number(listPrice).toLocaleString()}` : null;

      const sqft = desc.sqft ?? r.rentalExtension?.sqftRange?.max ?? null;

      const realtorUrl =
        r.href ??
        (r.permalink
          ? `https://www.realtor.com/realestateandhomes-detail/${r.permalink}`
          : 'https://www.realtor.com');

      const title =
        `${beds ?? '?'}bd ${baths ?? '?'}ba` +
        (sqft ? ` · ${sqft.toLocaleString()} sqft` : '') +
        ` – ${line || city || 'Unknown'}`;

      listings.push({
        title,
        price: priceStr,
        beds,
        baths,
        sqft,
        address: fullAddress || null,
        city,
        state: stateCode,
        thumbnail_url: thumbnail,
        photo_urls: photos,
        listing_url: realtorUrl,
        lat: coord.lat ?? null,
        lon: coord.lon ?? null,
      });
    } catch {
      // skip malformed entry
    }
  }

  return listings;
}

async function fetchRealtorListings(
  location: string,
  limit: number = 12,
  status: string = 'for_sale',
): Promise<{ listings: RealtorListing[]; fromCache: boolean }> {
  const key = cacheKey(location, limit);
  const cache = readCache();

  // Serve from cache if available (no TTL – preserve API calls)
  if (cache[key]) {
    console.log(`[search] Cache HIT for "${location}"`);
    return { listings: parseRealtorResults(cache[key].data), fromCache: true };
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST ?? 'realtor-search.p.rapidapi.com';

  if (!rapidApiKey) {
    console.error('[search] RAPIDAPI_KEY not set');
    return { listings: [], fromCache: false };
  }

  const headers = {
    'x-rapidapi-key': rapidApiKey,
    'x-rapidapi-host': rapidApiHost,
  };

  try {
    // Step 1: Search location to get city ID
    const searchUrl = `https://${rapidApiHost}/agents/v2/search-location?query=${encodeURIComponent(location)}`;
    console.log(`[search] Search location: ${searchUrl}`);

    const searchRes = await fetch(searchUrl, { method: 'GET', headers });
    if (!searchRes.ok) {
      console.error(`[search] search-location ${searchRes.status}: ${await searchRes.text()}`);
      return { listings: [], fromCache: false };
    }

    const searchData = await searchRes.json();
    const autoComplete = searchData?.data?.agents_location_search?.auto_complete ?? [];
    console.log(`[search] Found ${autoComplete.length} auto_complete results`);

    if (autoComplete.length === 0) {
      console.warn('[search] No location found');
      return { listings: [], fromCache: false };
    }

    // Get the top city result
    const topCity = autoComplete[0];
    const cityId = topCity?.id ?? '';
    console.log(`[search] Using location ID: ${cityId}`);

    // Step 2: Query search-location again with the ID to get all listings in that location
    const listingsUrl = `https://${rapidApiHost}/agents/v2/search-location?id=${encodeURIComponent(cityId)}&limit=${limit}`;
    console.log(`[search] Get listings for location: ${listingsUrl}`);

    const listingsRes = await fetch(listingsUrl, { method: 'GET', headers });
    if (!listingsRes.ok) {
      console.error(`[search] listings request ${listingsRes.status}: ${await listingsRes.text()}`);
      return { listings: [], fromCache: false };
    }

    const listingsData = await listingsRes.json();
    const results =
      listingsData?.data?.home_search?.results ??
      listingsData?.data?.results ??
      listingsData?.results ??
      [];

    console.log(`[search] Got ${results.length} listings for "${location}"`);

    // Cache results
    const mergedData = { data: { home_search: { results: results.slice(0, limit) } } };
    cache[key] = { ts: Date.now(), data: mergedData };
    writeCache(cache);
    console.log(`[search] Cached ${results.length} listings for "${location}"`);

    return { listings: parseRealtorResults(mergedData), fromCache: false };
  } catch (e) {
    console.error(`[search] Realtor API error: ${e}`);
    return { listings: [], fromCache: false };
  }
}

// ---------- POST handler ----------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query } = SearchRequestSchema.parse(body);

    // 1. Claude parses the natural language query
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log(`[search] Parsing query with Claude: "${query}"`);
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Extract search parameters from this property search query. Return ONLY valid JSON, no markdown.
If the query is invalid or has no location, include an "error" field.

Query: "${query}"

Return JSON:
{
  "location": "city, state (e.g. San Diego, CA)",
  "status": "for_sale" or "for_rent" — infer from query, default "for_sale",
  "beds_min": number or null,
  "beds_max": number or null,
  "baths_min": number or null,
  "baths_max": number or null,
  "price_min": number or null,
  "price_max": number or null,
  "keywords": "extra keywords" or null,
  "error": "message" (optional, only if query is invalid)
}`,
        },
      ],
    });

    let claudeText =
      claudeResponse.content[0].type === 'text'
        ? claudeResponse.content[0].text
        : '';
    console.log(`[search] Claude response: ${claudeText}`);

    // Strip markdown code blocks if present
    claudeText = claudeText
      .replace(/^```json\n?/, '')
      .replace(/^```\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    let parsedQuery: ParsedQuery;
    try {
      parsedQuery = ParsedQuerySchema.parse(JSON.parse(claudeText));
    } catch {
      return NextResponse.json(
        { error: 'Failed to understand your search query. Try something like "houses in San Diego".' },
        { status: 400 },
      );
    }

    if (parsedQuery.error) {
      return NextResponse.json({ error: parsedQuery.error }, { status: 400 });
    }
    if (!parsedQuery.location) {
      return NextResponse.json(
        { error: 'Could not find a location in your query. Try "apartments in San Francisco".' },
        { status: 400 },
      );
    }

    // 2. Fetch from Realtor.com (cache-first)
    const { listings, fromCache } = await fetchRealtorListings(
      parsedQuery.location,
      12,
      parsedQuery.status ?? 'for_sale',
    );

    console.log(
      `[search] ${listings.length} listings (${fromCache ? 'from cache' : 'live API call'})`,
    );

    return NextResponse.json({
      listings,
      parsedQuery,
      count: listings.length,
      fromCache,
    });
  } catch (e) {
    console.error(`[search] Error: ${e}`);
    return NextResponse.json(
      { error: 'Search failed: ' + String(e) },
      { status: 500 },
    );
  }
}
