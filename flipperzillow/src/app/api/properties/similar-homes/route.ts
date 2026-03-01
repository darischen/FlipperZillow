import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { similarHomes, normalizeListings } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  propertyId: z.string().min(1, 'propertyId is required'),
  resultsPerPage: z.coerce.number().int().positive().optional(),
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
    const data = await similarHomes(apiParams);
    if (normalize) return NextResponse.json({ listings: normalizeListings(data), raw: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[similar-homes]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
