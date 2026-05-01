import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

import { generateScript } from '@/lib/claude/generateScript';
import { generateVoice } from '@/lib/elevenlabs/generateVoice';

/**
 * POST /api/tour/narrate
 * Local NVIDIA version (no SSH):
 * 1. Read property_summary.json from local src/data/
 * 2. Pass to Claude for realtor script
 * 3. Pass script to ElevenLabs TTS
 * 4. Return MP3 audio
 */
export async function POST() {
  try {
    // --- Step 1: Read local property_summary.json ---
    const localPath = path.resolve(process.cwd(), 'src/data/property_summary.json');

    if (!fs.existsSync(localPath)) {
      return NextResponse.json(
        {
          error: `Property summary not found at ${localPath}. Run dispatch-images first.`,
        },
        { status: 404 },
      );
    }

    console.log('[narrate] Reading property_summary.json from:', localPath);
    const summaryJson = fs.readFileSync(localPath, 'utf-8');

    if (!summaryJson.trim()) {
      return NextResponse.json(
        {
          error: 'Property summary is empty. Run dispatch-images first to process images.',
        },
        { status: 400 },
      );
    }

    const summary = JSON.parse(summaryJson);

    if (!summary.room_count) {
      return NextResponse.json(
        {
          error: 'Property summary is incomplete. Run dispatch-images first.',
        },
        { status: 400 },
      );
    }

    console.log(`[narrate] Got property summary: ${summary.room_count} rooms`);

    // --- Step 2: Generate realtor script with Claude ---
    console.log('[narrate] Generating script with Claude...');
    const { script, word_count } = await generateScript(summary);
    console.log(`[narrate] Script generated: ${word_count} words`);

    // --- Step 3: Generate voice with Google Cloud TTS ---
    console.log('[narrate] Generating voice with Google Cloud TTS...');
    try {
      const audioBuffer = await generateVoice(script);
      console.log(`[narrate] Audio generated: ${audioBuffer.length} bytes`);

      // --- Return MP3 with metadata headers ---
      const preview = script.slice(0, 200).replace(/\n/g, ' ').replace(/[^\x00-\x7F]/g, '');
      return new NextResponse(new Uint8Array(audioBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(audioBuffer.length),
          'X-Script-Word-Count': String(word_count),
          'X-Script-Preview': preview,
        },
      });
    } catch (ttsError) {
      // TTS failed, but return script preview so the tour still works
      console.warn('[narrate] TTS failed, returning script preview:', ttsError);
      const preview = script.slice(0, 200).replace(/\n/g, ' ').replace(/[^\x00-\x7F]/g, '');
      return NextResponse.json(
        { script, error: 'TTS unavailable' },
        {
          status: 200,
          headers: {
            'X-Script-Word-Count': String(word_count),
            'X-Script-Preview': preview,
            'X-TTS-Failed': 'true',
          },
        }
      );
    }
  } catch (error) {
    console.error('[narrate] Error:', error);
    return NextResponse.json(
      { error: 'Narration failed: ' + String(error) },
      { status: 500 },
    );
  }
}
