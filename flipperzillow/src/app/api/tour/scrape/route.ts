import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ScrapeRequestSchema = z.object({
  address: z.string().min(1, 'Address is required'),
});

interface ScrapeResponse {
  address: string;
  images: string[];
  count: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[tour/scrape] Request received at ${new Date(startTime).toISOString()}`);

  try {
    const body = await request.json();
    const parsed = ScrapeRequestSchema.safeParse(body);

    if (!parsed.success) {
      console.log('[tour/scrape] Validation failed:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { address } = parsed.data;
    const backendUrl = process.env.PYTHON_BACKEND_URL;

    if (!backendUrl) {
      console.error('[tour/scrape] PYTHON_BACKEND_URL is not configured');
      return NextResponse.json(
        { error: 'Server configuration error: Python backend URL is missing' },
        { status: 500 }
      );
    }

    const scrapeUrl = `${backendUrl}/scrape`;

    console.log(`[tour/scrape] Proxying scrape request to: "${scrapeUrl}"`);
    const scrapeStart = Date.now();

    const scrapeResponse = await fetch(scrapeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    });

    const scrapeDuration = Date.now() - scrapeStart;
    console.log(`[tour/scrape] Scrape completed in ${scrapeDuration}ms, status: ${scrapeResponse.status}`);

    if (!scrapeResponse.ok) {
      const errorData = await scrapeResponse.json().catch(() => ({}));
      console.error('[tour/scrape] Scrape failed:', scrapeResponse.status, errorData);
      return NextResponse.json(
        { error: `Scrape failed: ${errorData.detail || scrapeResponse.statusText}` },
        { status: scrapeResponse.status }
      );
    }

    const scrapeData: ScrapeResponse = await scrapeResponse.json();

    if (!scrapeData.images || scrapeData.images.length === 0) {
      console.error('[tour/scrape] No images returned from scraper');
      return NextResponse.json(
        { error: 'No images found for address' },
        { status: 404 }
      );
    }

    const responseData = {
      success: true,
      address: scrapeData.address,
      images: scrapeData.images,
      count: scrapeData.count,
    };

    const totalDuration = Date.now() - startTime;
    console.log(`[tour/scrape] Total request duration: ${totalDuration}ms`);
    console.log(`[tour/scrape] Response: ${responseData.count} images found`);

    return NextResponse.json(responseData);
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[tour/scrape] Error after ${totalDuration}ms:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
