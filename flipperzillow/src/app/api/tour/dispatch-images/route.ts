import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const RequestSchema = z.object({
  image_urls: z.array(z.string().url()).min(1),
  address: z.string().optional(),
});

/**
 * SSH into AMD cloud and write image URLs as a JSON file.
 * Reads AMD_CLOUD_HOST and SSH_KEY_PATH from .env.local.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { image_urls, address } = parsed.data;

    const host = process.env.AMD_CLOUD_HOST;
    const keyPath = process.env.SSH_KEY_PATH;

    if (!host || !keyPath) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'AMD_CLOUD_HOST or SSH_KEY_PATH not configured',
      });
    }

    // Resolve key path relative to project root
    const resolvedKey = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);

    if (!fs.existsSync(resolvedKey)) {
      return NextResponse.json({
        status: 'error',
        error: `SSH key not found at ${resolvedKey}`,
      });
    }

    // Single-line JSON (no newlines) to avoid bash multiline issues
    const payload = JSON.stringify({ image_urls, address });

    // Escape single quotes for shell
    const escaped = payload.replace(/'/g, "'\\''");

    // mkdir -p first in case /workspace doesn't exist, then write the file
    const remoteCmd = `mkdir -p /workspace && echo '${escaped}' > /workspace/image_urls.json`;
    const sshArgs = [
      '-i', resolvedKey,
      '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=no',
      `root@${host}`,
      remoteCmd,
    ];

    console.log(`[dispatch] SSH to ${host} — writing ${image_urls.length} image URLs`);

    await new Promise<string>((resolve, reject) => {
      execFile('ssh', sshArgs, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[dispatch] SSH error:', err.message);
          reject(err);
          return;
        }
        if (stderr) console.warn('[dispatch] stderr:', stderr);
        console.log('[dispatch] Wrote /workspace/image_urls.json on AMD cloud');
        resolve(stdout);
      });
    });

    return NextResponse.json({
      status: 'dispatched',
      image_count: image_urls.length,
      host,
      remote_path: '/workspace/image_urls.json',
    });
  } catch (error) {
    console.error('[dispatch] Error:', error);
    return NextResponse.json({
      status: 'error',
      error: String(error),
    });
  }
}
