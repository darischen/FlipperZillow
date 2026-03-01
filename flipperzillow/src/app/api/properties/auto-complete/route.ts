import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { autoComplete } from '@/lib/rapidapi/realtorClient';

const QuerySchema = z.object({
  input: z.string().min(1, 'input is required'),
  limit: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const parsed = QuerySchema.safeParse({
      input: searchParams.get('input'),
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const data = await autoComplete(parsed.data);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[auto-complete]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
