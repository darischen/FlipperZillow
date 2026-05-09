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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(SLAT_HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
    console.log('[SAM3D] Starting Docker container...');

    // Start Docker Compose (correct path: one level up from app directory)
    try {
      const nvdiaLocalPath = path.join(process.cwd(), '..', 'nvidia_local');
      execSync('docker-compose up -d', {
        cwd: nvdiaLocalPath,
        timeout: 30000,
        stdio: 'pipe',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
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
