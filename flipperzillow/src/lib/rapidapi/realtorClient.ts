import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
const CACHE_PATH = path.join(process.cwd(), 'src', 'data', 'realtor_cache.json');
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function readCache(): Record<string, { ts: number; data: any }> {
  try {
    if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch { /* corrupted — start fresh */ }
  return {};
}

function writeCache(cache: Record<string, { ts: number; data: any }>) {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function cacheGet(key: string, ttlMs?: number): any | null {
  const entry = readCache()[key];
  if (!entry) return null;
  if (ttlMs !== undefined && Date.now() - entry.ts > ttlMs) return null;
  return entry.data;
}

function cacheSet(key: string, data: any) {
  const cache = readCache();
  cache[key] = { ts: Date.now(), data };
  writeCache(cache);
}

// ---------------------------------------------------------------------------
// HTTP client — uses RAPIDAPI_KEY + RAPIDAPI_HOST from env
// ---------------------------------------------------------------------------
function getHost(): string {
  return process.env.RAPIDAPI_HOST ?? 'realtor-search.p.rapidapi.com';
}

function getHeaders(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY env var is not set');
  const host = getHost();
  return { 'x-rapidapi-key': key, 'x-rapidapi-host': host };
}

async function apiGet(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined | null>,
  ck?: string,
  ttl?: number,
): Promise<any> {
  if (ck) {
    const hit = cacheGet(ck, ttl);
    if (hit !== null) { console.log(`[realtorClient] CACHE HIT ${ck}`); return hit; }
  }

  const url = new URL(`https://${getHost()}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  console.log(`[realtorClient] GET ${url.toString()}`);

  const res = await fetch(url.toString(), { method: 'GET', headers: getHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RapidAPI ${endpoint} → ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (ck) { cacheSet(ck, data); console.log(`[realtorClient] CACHED ${ck}`); }
  return data;
}

// ---------------------------------------------------------------------------
// Input parameter types (exact match to rapidapi.txt docs)
// ---------------------------------------------------------------------------

export interface AutoCompleteParams {
  /** States, cities, districts, addresses, zipcode. Required. */
  input: string;
  /** Number of items per response. Default: 10 */
  limit?: number;
}

export interface SearchBuyParams {
  /** Retrieved from auto-complete endpoint (data->autocomplete->id). Required. */
  location: string;
  /** Timezone ID. Default: America/New_York */
  zoneId?: string;
  /** 8–200. Default: 20 */
  resultsPerPage?: number;
  /** Default: 1 */
  page?: number;
  /** Default: relevance */
  sortBy?: 'relevance' | 'newest' | 'lowest_price' | 'highest_price' | 'open_house_date' | 'price_reduced' | 'largest_squarefoot' | 'photo_count';
  /** Miles: 0 | 1 | 5 | 10 | 25 | 50. Default: 0 */
  expandSearchArea?: number;
  /** Comma-separated: condo, co_op, cond_op, townhome, single_family_home, multi_family, mobile_mfd, farm_ranch, land */
  propertyType?: string;
  /** "min,max" e.g. "200000,500000". Omit side for open-ended: ",500000" or "200000" */
  prices?: string;
  /** 0=Studio+, 1–5. Default: any */
  bedrooms?: number;
  /** 1–5. Default: any */
  bathrooms?: number;
  /** "min,max" sqft e.g. "500,2000" */
  homeSize?: string;
  /** "min,max" sqft e.g. "2000,10000" */
  lotSize?: string;
  /** "min,max" years e.g. "0,10" */
  homeAge?: string;
  /** Comma-separated: central_air, central_heat, forced_air, energy_efficient */
  heatingCooling?: string;
  /** Comma-separated: basement, den_or_office, dining_room, family_room, washer_dryer, fireplace, hardwood_floors, swimming_pool, etc. */
  homeFeatures?: string;
  /** Comma-separated: corner_lot, cul_de_sac, waterfront, city_view, ocean_view, etc. */
  lotFeatures?: string;
  /** Comma-separated: community_swimming_pool, community_golf, community_clubhouse, senior_community, etc. */
  communityFeatures?: string;
  /** NYC only — comma-separated: community_doorman, community_elevator, dishwasher, etc. */
  nycAmenities?: string;
  /** Comma-separated: garage_1_or_more, garage_2_or_more, garage_3_or_more, carport, rv_or_boat_parking */
  garageParking?: string;
  /** Days on realtor.com: 1, 2, 7, 14, 21, 30 */
  daysOnRealtor?: number;
  /** Format: yyyy-MM-ddTHH:mm:ss. Takes precedence over daysOnRealtor. */
  minListDate?: string;
  /** Format: yyyy-MM-ddTHH:mm:ss */
  maxListDate?: string;
  /** Max HOA fee/month. 0 = No HOA. */
  maxHoaFeesPerMonth?: number;
  hidePendingContingent?: boolean;
  newConstructionOnly?: boolean;
  hideHomesNotYetBuilt?: boolean;
  foreclosuresOnly?: boolean;
  hideForeclosures?: boolean;
  seniorCommunityOnly?: boolean;
  openHousesOnly?: boolean;
  priceRecentlyReducedOnly?: boolean;
  virtualToursOnly?: boolean;
  threeDtoursOnly?: boolean;
  showHomesWhereHoaIsNotKnown?: boolean;
}

export interface SearchRentParams {
  /** Retrieved from auto-complete endpoint (data->autocomplete->id). Required. */
  location: string;
  /** Timezone ID. Default: America/New_York */
  zoneId?: string;
  /** 0–200. Default: 20 */
  resultsPerPage?: number;
  /** Default: 1 */
  page?: number;
  /** Default: best_match */
  sortBy?: 'best_match' | 'newest' | 'lowest_price' | 'highest_price' | 'photo_count';
  /** Miles: 0 | 1 | 5 | 10 | 25 | 50. Default: 0 */
  expandSearchArea?: number;
  /** Comma-separated: condo, co_op, cond_op, townhome, apartment, single_family, other */
  propertyType?: string;
  /** "min,max" monthly rent e.g. "1000,3000" */
  prices?: string;
  /** 0=Studio+, 1–5. Default: any */
  bedrooms?: number;
  /** 1–5. Default: any */
  bathrooms?: number;
  /** "min,max" sqft */
  homeSize?: string;
  /** Format: YYYY-MM-DD */
  moveInDate?: string;
  /** Comma-separated: cats, dogs, no_pets_allowed */
  pets?: string;
  /** Comma-separated: washer_dryer, garage_1_or_more, central_air, swimming_pool, community_gym */
  features?: string;
  /** NYC only — comma-separated: community_doorman, community_elevator, dishwasher, furnished, etc. */
  nycAmenities?: string;
  threeDtoursOnly?: boolean;
}

export interface SearchSoldParams {
  /** Retrieved from auto-complete endpoint (data->autocomplete->id). Required. */
  location: string;
  /** Timezone ID. Default: America/New_York */
  zoneId?: string;
  /** Format: YYYY-MM-DD. Default: six months ago */
  minSoldDate?: string;
  /** 0–200. Default: 20 */
  resultsPerPage?: number;
  /** Default: 1 */
  page?: number;
  /** Default: lowest_price */
  sortBy?: 'lowest_price' | 'highest_price';
  /** Miles: 0 | 1 | 5 | 10 | 25 | 50. Default: 0 */
  expandSearchArea?: number;
  /** Comma-separated: condo, co_op, cond_op, townhome, single_family_home, multi_family, mobile_mfd, farm_ranch, land */
  propertyType?: string;
  /** "min,max" e.g. "200000,500000" */
  prices?: string;
  /** 0=Studio+, 1–5 */
  bedrooms?: number;
  /** 1–5 */
  bathrooms?: number;
  /** "min,max" sqft */
  homeSize?: string;
  /** "min,max" sqft */
  lotSize?: string;
  /** "min,max" years */
  homeAge?: string;
}

export interface SearchMlsIdParams {
  /** MLS ID number. Required. */
  mlsId: string;
  /** 0–200. Default: 20 */
  resultsPerPage?: number;
  /** Default: 1 */
  page?: number;
  /** Default: relevance */
  sortBy?: 'relevance' | 'newest' | 'lowest_price' | 'highest_price' | 'open_house_date' | 'price_reduced' | 'largest_squarefoot' | 'photo_count';
}

export interface SearchUrlParams {
  /** Full realtor.com search URL copied from browser. Required. */
  url: string;
  /** Default: depends on URL */
  page?: number;
}

export interface DetailParams {
  /** Retrieved from search results (data->results->property_id). Required. */
  propertyId: string;
  /** Retrieved from search results (data->results->listing_id). */
  listingId?: string;
}

export interface DetailUrlParams {
  /** Full realtor.com property detail URL. Required. */
  url: string;
}

export interface SimilarHomesParams {
  /** Retrieved from search results (data->results->property_id). Required. */
  propertyId: string;
  /** Default: 12 */
  resultsPerPage?: number;
}

export interface GetSurroundingsParams {
  /** Retrieved from search results (data->results->property_id). Required. */
  propertyId: string;
  /** Whether to include flood info. Default: true */
  enableFlood?: boolean;
}

// ---------------------------------------------------------------------------
// Output Zod schemas
// ---------------------------------------------------------------------------

export const AutoCompleteItemSchema = z.object({
  area_type: z.string(),
  _id: z.string(),
  _score: z.number().optional(),
  id: z.string(),
  slug_id: z.string().optional(),
  country: z.string().optional(),
  centroid: z.object({ lon: z.number(), lat: z.number() }).optional(),
  state_code: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  county_needed_for_uniq: z.boolean().optional(),
}).passthrough();

export const AutoCompleteResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    meta: z.object({ version: z.string().optional(), es_took: z.number().optional(), es_total_hits: z.number().optional() }).passthrough().optional(),
    autocomplete: z.array(AutoCompleteItemSchema),
  }),
});

export const ListingPhotoSchema = z.object({ href: z.string().url() });

export const ListingAddressSchema = z.object({
  line: z.string().nullish(),
  city: z.string().nullish(),
  state_code: z.string().nullish(),
  state: z.string().nullish(),
  postal_code: z.string().nullish(),
  coordinate: z.object({ lat: z.number(), lon: z.number() }).nullish(),
}).passthrough();

export const ListingDescriptionSchema = z.object({
  beds: z.number().nullish(),
  baths: z.number().nullish(),
  baths_full: z.number().nullish(),
  baths_half: z.number().nullish(),
  baths_consolidated: z.number().nullish(),
  sqft: z.number().nullish(),
  lot_sqft: z.number().nullish(),
  type: z.string().nullish(),
}).passthrough();

export const SearchResultItemSchema = z.object({
  property_id: z.string(),
  listing_id: z.string().nullish(),
  status: z.string().nullish(),
  list_price: z.number().nullish(),
  last_sold_price: z.number().nullish(),
  href: z.string().nullish(),
  primary_photo: ListingPhotoSchema.nullish(),
  photo_count: z.number().nullish(),
  photos: z.array(ListingPhotoSchema).optional(),
  description: ListingDescriptionSchema.optional(),
  location: z.object({ address: ListingAddressSchema }).optional(),
}).passthrough();

export const SearchResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    count: z.number(),
    total: z.number(),
    results: z.array(SearchResultItemSchema),
  }).passthrough(),
});

export const SurroundingsResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    home: z.object({
      local: z.object({
        flood: z.object({
          flood_factor_score: z.number().nullish(),
          flood_factor_severity: z.string().nullish(),
          fema_zone: z.array(z.string()).optional(),
          flood_trend_paragraph: z.string().nullish(),
          flood_insurance_text: z.string().nullish(),
        }).passthrough().nullish(),
        noise: z.object({
          noise_categories: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
        }).passthrough().nullish(),
      }).passthrough(),
    }).passthrough(),
  }),
});

export type AutoCompleteResponse = z.infer<typeof AutoCompleteResponseSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type SurroundingsResponse = z.infer<typeof SurroundingsResponseSchema>;

// ---------------------------------------------------------------------------
// Exported API functions
// ---------------------------------------------------------------------------

export async function autoComplete(params: AutoCompleteParams): Promise<AutoCompleteResponse> {
  const ck = `autocomplete__${params.input.toLowerCase().trim()}__${params.limit ?? 10}`;
  const raw = await apiGet('properties/auto-complete', params as any, ck, SEARCH_CACHE_TTL_MS);
  return AutoCompleteResponseSchema.parse(raw);
}

export async function searchBuy(params: SearchBuyParams): Promise<SearchResponse> {
  const ck = `searchbuy__${JSON.stringify(params)}`;
  const raw = await apiGet('properties/search-buy', params as any, ck, SEARCH_CACHE_TTL_MS);
  return SearchResponseSchema.parse(raw);
}

export async function searchRent(params: SearchRentParams): Promise<SearchResponse> {
  const ck = `searchrent__${JSON.stringify(params)}`;
  const raw = await apiGet('properties/search-rent', params as any, ck, SEARCH_CACHE_TTL_MS);
  return SearchResponseSchema.parse(raw);
}

export async function searchSold(params: SearchSoldParams): Promise<SearchResponse> {
  const ck = `searchsold__${JSON.stringify(params)}`;
  const raw = await apiGet('properties/search-sold', params as any, ck, SEARCH_CACHE_TTL_MS);
  return SearchResponseSchema.parse(raw);
}

export async function searchMlsId(params: SearchMlsIdParams): Promise<SearchResponse> {
  const ck = `searchmlsid__${JSON.stringify(params)}`;
  const raw = await apiGet('properties/search-mls-id', params as any, ck, SEARCH_CACHE_TTL_MS);
  return SearchResponseSchema.parse(raw);
}

export async function searchUrl(params: SearchUrlParams): Promise<any> {
  const ck = `searchurl__${params.url}__${params.page ?? 0}`;
  return apiGet('properties/search-url', params as any, ck, SEARCH_CACHE_TTL_MS);
}

export async function propertyDetail(params: DetailParams): Promise<any> {
  const ck = `detail__${params.propertyId}__${params.listingId ?? ''}`;
  return apiGet('properties/detail', params as any, ck);
}

export async function propertyDetailUrl(params: DetailUrlParams): Promise<any> {
  const ck = `detailurl__${params.url}`;
  return apiGet('properties/detail-url', params as any, ck);
}

export async function similarHomes(params: SimilarHomesParams): Promise<any> {
  const ck = `similarhomes__${params.propertyId}__${params.resultsPerPage ?? 12}`;
  return apiGet('properties/similar-homes', params as any, ck);
}

export async function getSurroundings(params: GetSurroundingsParams): Promise<SurroundingsResponse> {
  const ck = `surroundings__${params.propertyId}__${params.enableFlood ?? true}`;
  const raw = await apiGet('properties/get-surroundings', params as any, ck);
  return SurroundingsResponseSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Normalizer — collapses any search response into a flat listing array
// ---------------------------------------------------------------------------
export interface NormalizedListing {
  property_id: string | null;
  listing_id: string | null;
  status: string | null;
  title: string;
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  thumbnail_url: string | null;
  photo_urls: string[];
  listing_url: string;
  lat: number | null;
  lon: number | null;
}

export function normalizeListings(apiData: any): NormalizedListing[] {
  const raw: any[] =
    Array.isArray(apiData?.data) ? apiData.data :
    apiData?.data?.results ?? apiData?.data?.home_search?.results ?? [];

  return raw.flatMap((r: any) => {
    try {
      const desc = r.description ?? {};
      const addr = r.location?.address ?? {};
      const coord = addr.coordinate ?? {};
      const photos: string[] = (r.photos ?? []).map((p: any) => p?.href).filter(Boolean);
      const thumbnail = r.primary_photo?.href ?? photos[0] ?? null;
      const line = addr.line ?? '';
      const city = addr.city ?? '';
      const stateCode = addr.state_code ?? addr.state ?? '';
      const fullAddress = [line, city, stateCode].filter(Boolean).join(', ');
      const beds = desc.beds ?? null;
      const baths = desc.baths_consolidated ?? desc.baths ?? null;
      const listPrice = r.list_price ?? r.last_sold_price ?? null;

      return [{
        property_id: r.property_id ?? null,
        listing_id: r.listing_id ?? null,
        status: r.status ?? null,
        title: `${beds ?? '?'}bd ${baths ?? '?'}ba${desc.sqft ? ` · ${Number(desc.sqft).toLocaleString()} sqft` : ''} – ${line || city || 'Unknown'}`,
        price: listPrice != null ? `$${Number(listPrice).toLocaleString()}` : null,
        beds,
        baths,
        sqft: desc.sqft ?? null,
        address: fullAddress || null,
        city,
        state: stateCode,
        postal_code: addr.postal_code ?? null,
        thumbnail_url: thumbnail,
        photo_urls: photos,
        listing_url: r.href ?? (r.permalink ? `https://www.realtor.com/realestateandhomes-detail/${r.permalink}` : 'https://www.realtor.com'),
        lat: coord.lat ?? null,
        lon: coord.lon ?? null,
      } satisfies NormalizedListing];
    } catch { return []; }
  });
}
