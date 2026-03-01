import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchRent, normalizeListings } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  location: z.string().min(1, 'location is required'),
  zoneId: z.string().optional(),
  resultsPerPage: z.coerce.number().int().min(0).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['best_match', 'newest', 'lowest_price', 'highest_price', 'photo_count']).optional(),
  expandSearchArea: z.coerce.number().optional(),
  propertyType: z.string().optional(),
  prices: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(5).optional(),
  bathrooms: z.coerce.number().int().min(1).max(5).optional(),
  homeSize: z.string().optional(),
  moveInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  /** Comma-separated: cats, dogs, no_pets_allowed */
  pets: z.string().optional(),
  /** Comma-separated: washer_dryer, garage_1_or_more, central_air, swimming_pool, community_gym */
  features: z.string().optional(),
  nycAmenities: z.string().optional(),
  threeDtoursOnly: z.coerce.boolean().optional(),
  normalize: z.coerce.boolean().default(false),
});

export async function GET(req: NextRequest) {
  try {
    const raw: Record<string, string | undefined> = {};
    req.nextUrl.searchParams.forEach((v, k) => { raw[k] = v; });

    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { normalize, ...apiParams } = parsed.data;
    const data = await searchRent(apiParams);
    if (normalize) return NextResponse.json({ listings: normalizeListings(data), raw: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[search-rent]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
