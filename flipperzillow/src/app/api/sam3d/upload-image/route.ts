import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataUrl } = body;

    if (!dataUrl || typeof dataUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid dataUrl' },
        { status: 400 }
      );
    }

    // Parse data URL: data:image/jpeg;base64,{base64string}
    const matches = dataUrl.match(/^data:image\/([a-z]+);base64,(.+)$/i);
    if (!matches) {
      return NextResponse.json(
        { error: 'Invalid data URL format' },
        { status: 400 }
      );
    }

    const [, imageType, base64String] = matches;

    // Create temporary file in a shared location that Docker can access
    const tempDir = path.resolve(process.cwd(), 'src', 'data', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${imageType}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    // Write the base64 data to a file
    const buffer = Buffer.from(base64String, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    console.log(`[sam3d] Converted data URL to file: ${tempFilePath}`);

    // Return the file path in a format the Python backend can understand
    // The path needs to be relative to where the Python backend expects it
    return NextResponse.json({
      success: true,
      filePath: tempFilePath,
      relativePath: path.join('src', 'data', 'temp', tempFileName),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[sam3d] Upload error:', errorMsg);

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
