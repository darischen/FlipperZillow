import { NextResponse } from 'next/server';

const SLAT_HEALTH_URL = 'http://localhost:8001/health';

export async function GET() {
  try {
    const response = await fetch(SLAT_HEALTH_URL, {
      method: 'GET',
      timeout: 5000,
    });

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
