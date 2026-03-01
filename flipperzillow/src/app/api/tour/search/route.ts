import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import {
  autoComplete,
  searchBuy,
  searchRent,
  normalizeListings,
  type NormalizedListing,
} from '@/lib/rapidapi/realtorClient';

// ---------- Zod schemas ----------
const SearchRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
});

const ParsedQuerySchema = z.object({
  error: z.string().nullish(),
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

// ---------- Location resolution via properties/auto-complete ----------
async function resolveLocationId(location: string): Promise<string | null> {
  try {
    const data = await autoComplete({ input: location, limit: 5 });
    const completions: any[] = data?.data?.autocomplete ?? [];

    // Prefer city → county → state match
    const preferred = completions.find((c: any) =>
      ['city', 'county', 'state', 'postal_code'].includes(c.area_type),
    );
    const result = preferred ?? completions[0];

    if (!result?.id) return null;
    console.log(`[search] Resolved "${location}" → id="${result.id}" (${result.area_type})`);
    return result.id as string;
  } catch (e) {
    console.error('[search] autoComplete error:', e);
    return null;
  }
}

// ---------- Fetch listings using the property search APIs ----------
async function fetchListings(
  parsedQuery: ParsedQuery,
  limit: number = 12,
): Promise<{ listings: NormalizedListing[]; fromCache: boolean }> {
  const location = parsedQuery.location!;
  const isRent = parsedQuery.status === 'for_rent';

  // Step 1: resolve to a location ID
  const locationId = await resolveLocationId(location);
  if (!locationId) {
    console.warn(`[search] Could not resolve location ID for "${location}"`);
    return { listings: [], fromCache: false };
  }

  // Step 2: build filter params
  const baseParams = {
    location: locationId,
    resultsPerPage: limit,
    ...(parsedQuery.beds_min != null && { bedrooms: parsedQuery.beds_min }),
    ...(parsedQuery.baths_min != null && { bathrooms: Math.ceil(parsedQuery.baths_min) }),
    ...(parsedQuery.price_min != null || parsedQuery.price_max != null
      ? {
          prices: [
            parsedQuery.price_min ?? '',
            parsedQuery.price_max ?? '',
          ].join(','),
        }
      : {}),
  };

  try {
    let rawData: any;
    if (isRent) {
      rawData = await searchRent(baseParams);
    } else {
      rawData = await searchBuy(baseParams);
    }

    const listings = normalizeListings(rawData);
    // Detect cache hit via console (we don't track it externally, default false)
    return { listings, fromCache: false };
  } catch (e) {
    console.error('[search] fetchListings error:', e);
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

    // 2. Fetch listings using properties/auto-complete → properties/search-buy or search-rent
    const { listings, fromCache } = await fetchListings(parsedQuery, 12);

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
