import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const TourStartRequestSchema = z.object({
  address: z.string().min(1, 'Address is required'),
});

interface GeocodeResult {
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

interface GeocodeApiResponse {
  status: string;
  results: GeocodeResult[];
  error_message?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[tour/start] Request received at ${new Date(startTime).toISOString()}`);

  try {
    const body = await request.json();
    const parsed = TourStartRequestSchema.safeParse(body);

    if (!parsed.success) {
      console.log('[tour/start] Validation failed:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { address } = parsed.data;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error('[tour/start] GOOGLE_MAPS_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Server configuration error: Google Maps API key is missing' },
        { status: 500 }
      );
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    console.log(`[tour/start] Geocoding address: "${address}"`);
    const geocodeStart = Date.now();

    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData: GeocodeApiResponse = await geocodeResponse.json();

    const geocodeDuration = Date.now() - geocodeStart;
    console.log(`[tour/start] Geocoding completed in ${geocodeDuration}ms, status: ${geocodeData.status}`);

    if (geocodeData.status !== 'OK' || geocodeData.results.length === 0) {
      console.error('[tour/start] Geocoding failed:', geocodeData.status, geocodeData.error_message);
      return NextResponse.json(
        { error: `Geocoding failed: ${geocodeData.error_message || geocodeData.status}` },
        { status: 500 }
      );
    }

    const result = geocodeData.results[0];
    const responseData = {
      success: true,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };

    const totalDuration = Date.now() - startTime;
    console.log(`[tour/start] Total request duration: ${totalDuration}ms`);
    console.log(`[tour/start] Response:`, responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[tour/start] Error after ${totalDuration}ms:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
