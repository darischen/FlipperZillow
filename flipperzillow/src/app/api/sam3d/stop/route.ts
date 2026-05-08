import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';

export async function POST() {
  try {
    console.log('[SAM3D] Stopping Docker container...');

    // Stop Docker Compose
    try {
      const nvdiaLocalPath = path.join(process.cwd(), 'nvidia_local');
      execSync('docker-compose down', {
        cwd: nvdiaLocalPath,
        timeout: 30000,
        stdio: 'pipe',
        shell: true, // Required on Windows to execute docker-compose
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[SAM3D] Docker stop error:', errorMsg);
      // Don't fail if stop fails; container may already be stopped
    }

    console.log('[SAM3D] Container stopped');

    return NextResponse.json({
      success: true,
      message: 'SAM3D service stopped',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[SAM3D] Stop error:', errorMsg);

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
