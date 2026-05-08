import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';

const SLAT_HEALTH_URL = 'http://localhost:8001/health';
const MAX_WAIT_TIME = 600000; // 10 minutes
const POLL_INTERVAL = 3000; // 3 seconds

async function pollHealth(timeout: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(SLAT_HEALTH_URL, {
        method: 'GET',
        timeout: 5000,
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Not ready yet, continue polling
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  return false;
}

export async function POST() {
  try {
    // First check if already running
    try {
      const statusResponse = await fetch('http://localhost:3000/api/sam3d/status', {
        method: 'GET',
      });
      const status = await statusResponse.json();
      if (status.healthy) {
        return NextResponse.json({
          success: true,
          message: 'SAM3D service already running',
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // Status check failed, proceed with startup
    }

    console.log('[SAM3D] Starting Docker container...');

    // Change to nvidia_local directory and start Docker Compose
    try {
      const nvdiaLocalPath = path.join(process.cwd(), 'nvidia_local');
      execSync('docker-compose up -d', {
        cwd: nvdiaLocalPath,
        timeout: 30000,
        stdio: 'pipe',
        shell: true, // Required on Windows to execute docker-compose
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[SAM3D] Docker start failed:', errorMsg);
      return NextResponse.json(
        { error: `Failed to start Docker: ${errorMsg}` },
        { status: 500 }
      );
    }

    console.log('[SAM3D] Waiting for health endpoint...');

    // Poll health endpoint until ready
    const isHealthy = await pollHealth(MAX_WAIT_TIME);

    if (!isHealthy) {
      return NextResponse.json(
        { error: 'SAM3D service failed to become healthy within timeout' },
        { status: 500 }
      );
    }

    console.log('[SAM3D] Service is healthy and ready');

    return NextResponse.json({
      success: true,
      message: 'SAM3D service started and healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[SAM3D] Startup error:', errorMsg);

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
