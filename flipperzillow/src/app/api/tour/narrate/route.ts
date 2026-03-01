import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { generateScript } from '@/lib/claude/generateScript';
import { generateVoice } from '@/lib/elevenlabs/generateVoice';

/**
 * POST /api/tour/narrate
 * 1. SSH to AMD cloud → read /root/outputs/property_summary.json
 * 2. Pass to Claude for realtor script
 * 3. Pass script to ElevenLabs TTS
 * 4. Return MP3 audio
 */
export async function POST() {
  try {
    // --- Step 1: SSH to AMD cloud and read property_summary.json ---
    const host = process.env.AMD_CLOUD_HOST;
    const keyPath = process.env.SSH_KEY_PATH;

    if (!host || !keyPath) {
      return NextResponse.json(
        { error: 'AMD_CLOUD_HOST or SSH_KEY_PATH not configured' },
        { status: 500 },
      );
    }

    const resolvedKey = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);

    if (!fs.existsSync(resolvedKey)) {
      return NextResponse.json(
        { error: `SSH key not found at ${resolvedKey}` },
        { status: 500 },
      );
    }

    const remoteCmd = 'cat /root/outputs/property_summary.json';
    const sshArgs = [
      '-i', resolvedKey,
      '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=no',
      `root@${host}`,
      remoteCmd,
    ];

    console.log(`[narrate] SSH to ${host} — reading property_summary.json`);

    const summaryJson = await new Promise<string>((resolve, reject) => {
      execFile('ssh', sshArgs, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[narrate] SSH error:', err.message);
          reject(err);
          return;
        }
        if (stderr) console.warn('[narrate] stderr:', stderr);
        resolve(stdout);
      });
    }).catch((sshErr) => {
      console.warn('[narrate] SSH failed, falling back to local property_summary.json:', sshErr.message);
      const localPath = path.resolve(process.cwd(), 'src/data/property_summary.json');
      if (!fs.existsSync(localPath)) {
        throw new Error(`SSH failed and no local fallback found at ${localPath}`);
      }
      return fs.readFileSync(localPath, 'utf-8');
    });

    const summary = JSON.parse(summaryJson);
    console.log(`[narrate] Got property summary: ${summary.room_count} rooms`);

    // --- Step 2: Generate realtor script with Claude ---
    console.log('[narrate] Generating script with Claude...');
    const { script, word_count } = await generateScript(summary);
    console.log(`[narrate] Script generated: ${word_count} words`);

    // --- Step 3: Generate voice with ElevenLabs ---
    console.log('[narrate] Generating voice with ElevenLabs...');
    const audioBuffer = await generateVoice(script);
    console.log(`[narrate] Audio generated: ${audioBuffer.length} bytes`);

    // --- Return MP3 with metadata headers ---
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.length),
        'X-Script-Word-Count': String(word_count),
        'X-Script-Preview': script.slice(0, 200).replace(/\n/g, ' '),
      },
    });
  } catch (error) {
    console.error('[narrate] Error:', error);
    return NextResponse.json(
      { error: 'Narration failed: ' + String(error) },
      { status: 500 },
    );
  }
}
