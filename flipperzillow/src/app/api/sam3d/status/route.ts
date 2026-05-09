import { NextResponse } from 'next/server';

const SLAT_HEALTH_URL = 'http://localhost:8001/health';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(SLAT_HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const isRunning = response.ok;

    return NextResponse.json({
      running: isRunning,
      healthy: isRunning,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      running: false,
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
}
