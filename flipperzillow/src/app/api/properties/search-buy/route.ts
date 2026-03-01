import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchBuy, normalizeListings } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  location: z.string().min(1, 'location is required'),
  zoneId: z.string().optional(),
  resultsPerPage: z.coerce.number().int().min(8).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['relevance', 'newest', 'lowest_price', 'highest_price', 'open_house_date', 'price_reduced', 'largest_squarefoot', 'photo_count']).optional(),
  expandSearchArea: z.coerce.number().optional(),
  propertyType: z.string().optional(),
  prices: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(5).optional(),
  bathrooms: z.coerce.number().int().min(1).max(5).optional(),
  homeSize: z.string().optional(),
  lotSize: z.string().optional(),
  homeAge: z.string().optional(),
  heatingCooling: z.string().optional(),
  homeFeatures: z.string().optional(),
  lotFeatures: z.string().optional(),
  communityFeatures: z.string().optional(),
  nycAmenities: z.string().optional(),
  garageParking: z.string().optional(),
  daysOnRealtor: z.coerce.number().int().positive().optional(),
  minListDate: z.string().optional(),
  maxListDate: z.string().optional(),
  maxHoaFeesPerMonth: z.coerce.number().optional(),
  hidePendingContingent: z.coerce.boolean().optional(),
  newConstructionOnly: z.coerce.boolean().optional(),
  hideHomesNotYetBuilt: z.coerce.boolean().optional(),
  foreclosuresOnly: z.coerce.boolean().optional(),
  hideForeclosures: z.coerce.boolean().optional(),
  seniorCommunityOnly: z.coerce.boolean().optional(),
  openHousesOnly: z.coerce.boolean().optional(),
  priceRecentlyReducedOnly: z.coerce.boolean().optional(),
  virtualToursOnly: z.coerce.boolean().optional(),
  threeDtoursOnly: z.coerce.boolean().optional(),
  showHomesWhereHoaIsNotKnown: z.coerce.boolean().optional(),
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
    const data = await searchBuy(apiParams);
    if (normalize) return NextResponse.json({ listings: normalizeListings(data), raw: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[search-buy]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
