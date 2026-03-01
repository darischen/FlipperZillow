import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchSold, normalizeListings } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  location: z.string().min(1, 'location is required'),
  zoneId: z.string().optional(),
  minSoldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  resultsPerPage: z.coerce.number().int().min(0).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['lowest_price', 'highest_price']).optional(),
  expandSearchArea: z.coerce.number().optional(),
  propertyType: z.string().optional(),
  prices: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(5).optional(),
  bathrooms: z.coerce.number().int().min(1).max(5).optional(),
  homeSize: z.string().optional(),
  lotSize: z.string().optional(),
  homeAge: z.string().optional(),
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
    const data = await searchSold(apiParams);
    if (normalize) return NextResponse.json({ listings: normalizeListings(data), raw: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[search-sold]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
