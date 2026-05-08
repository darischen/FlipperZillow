import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Serve locally downloaded high-resolution images from the pipeline output.
 * Route: /api/images/images/img_000.jpg
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    if (!slug || slug.length < 2) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // slug = ['images', 'img_000.jpg']
    const dir = slug[0];
    const filename = slug.slice(1).join('/');

    // Security: only allow 'images' directory and *.jpg files
    if (dir !== 'images' || !filename.match(/^img_\d+\.jpg$/)) {
      return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
    }

    const imagePath = path.resolve(
      process.env.HOME || process.env.USERPROFILE || '',
      'flipperzillow_output',
      dir,
      filename
    );

    // Security: ensure path is within flipperzillow_output
    const outputDir = path.resolve(
      process.env.HOME || process.env.USERPROFILE || '',
      'flipperzillow_output'
    );
    if (!imagePath.startsWith(outputDir)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!fs.existsSync(imagePath)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(imagePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[images] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
