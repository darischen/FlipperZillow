import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { propertyDetailUrl } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  url: z.string().url('url must be a valid realtor.com property URL'),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = QuerySchema.safeParse({ url: searchParams.get('url') });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const data = await propertyDetailUrl(parsed.data);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[detail-url]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
