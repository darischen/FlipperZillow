import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSurroundings } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  propertyId: z.string().min(1, 'propertyId is required'),
  enableFlood: z.coerce.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = QuerySchema.safeParse({
      propertyId: searchParams.get('propertyId'),
      enableFlood: searchParams.get('enableFlood') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const data = await getSurroundings(parsed.data);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[get-surroundings]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
