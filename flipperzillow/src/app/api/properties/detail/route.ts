import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { propertyDetail } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  propertyId: z.string().min(1, 'propertyId is required'),
  listingId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = QuerySchema.safeParse({
      propertyId: searchParams.get('propertyId'),
      listingId: searchParams.get('listingId') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const data = await propertyDetail(parsed.data);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[detail]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
