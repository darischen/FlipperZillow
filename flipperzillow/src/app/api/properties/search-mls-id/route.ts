import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchMlsId, normalizeListings } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  mlsId: z.string().min(1, 'mlsId is required'),
  resultsPerPage: z.coerce.number().int().min(0).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['relevance', 'newest', 'lowest_price', 'highest_price', 'open_house_date', 'price_reduced', 'largest_squarefoot', 'photo_count']).optional(),
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
    const data = await searchMlsId(apiParams);
    if (normalize) return NextResponse.json({ listings: normalizeListings(data), raw: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[search-mls-id]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
