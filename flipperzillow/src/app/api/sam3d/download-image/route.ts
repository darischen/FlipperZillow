import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid imageUrl' },
        { status: 400 }
      );
    }

    // Download the image
    console.log(`[sam3d] Downloading image: ${imageUrl}`);
    const downloadResponse = await fetch(imageUrl);

    if (!downloadResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download image: HTTP ${downloadResponse.status}` },
        { status: 400 }
      );
    }

    // Get image data
    const buffer = await downloadResponse.arrayBuffer();

    // Determine file extension from URL or content-type
    let extension = 'jpg';
    const urlPath = new URL(imageUrl).pathname;
    if (urlPath.includes('.png')) extension = 'png';
    else if (urlPath.includes('.webp')) extension = 'webp';

    // Create temporary file
    const tempDir = path.resolve(process.cwd(), 'src', 'data', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    // Write the downloaded image to file
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    console.log(`[sam3d] Downloaded and saved to: ${tempFilePath}`);

    return NextResponse.json({
      success: true,
      filePath: tempFilePath,
      relativePath: path.join('src', 'data', 'temp', tempFileName),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[sam3d] Download error:', errorMsg);

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
