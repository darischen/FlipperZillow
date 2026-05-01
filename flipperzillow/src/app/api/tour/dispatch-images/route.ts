import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const RequestSchema = z.object({
  image_urls: z.array(z.string().url()).min(1),
  address: z.string().optional(),
});

/**
 * Local NVIDIA Pipeline: Call Python subprocess directly
 * No SSH, no server needed. Just spawn the pipeline.py script.
 */
export async function POST(req: NextRequest) {
  let tempFile: string | null = null;

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { image_urls, address } = parsed.data;

    console.log(`[dispatch] Processing ${image_urls.length} images with local NVIDIA pipeline`);

    // Step 1: Write image URLs to a temp file
    tempFile = path.join(os.tmpdir(), `flipperzillow_${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(image_urls));
    console.log(`[dispatch] Wrote image URLs to ${tempFile}`);

    // Step 2: Activate conda env and run the pipeline
    const nvidiaPipelinePath = path.resolve(process.cwd(), '..', 'nvidia_local', 'pipeline.py');

    if (!fs.existsSync(nvidiaPipelinePath)) {
      return NextResponse.json({
        status: 'error',
        error: `NVIDIA pipeline not found at ${nvidiaPipelinePath}. Make sure nvidia_local/ is in the project root.`,
      }, { status: 500 });
    }

    console.log(`[dispatch] Running pipeline from: ${nvidiaPipelinePath}`);

    // Use conda activation: on Windows, conda.bat activates; on Unix, source activate.sh
    const isWindows = process.platform === 'win32';
    let pythonExePath: string;

    if (isWindows) {
      pythonExePath = path.resolve(process.env.CONDA_PREFIX || '', 'python.exe');
    } else {
      pythonExePath = path.resolve(process.env.CONDA_PREFIX || '', 'bin', 'python');
    }

    // Fallback: just use 'python' or 'python3' in PATH (assumes fz env is activated)
    if (!fs.existsSync(pythonExePath)) {
      pythonExePath = process.platform === 'win32' ? 'python' : 'python3';
      console.log(`[dispatch] Using python from PATH: ${pythonExePath}`);
    }

    const pipelineOutput = await new Promise<string>((resolve, reject) => {
      execFile(
        pythonExePath,
        [nvidiaPipelinePath, tempFile, '--skip-sam'],
        {
          timeout: 600000, // 10 minutes max
          maxBuffer: 10 * 1024 * 1024, // 10 MB
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1', // Force unbuffered output
            PYTHONIOENCODING: 'utf-8', // Windows: support Unicode characters in output
          },
        },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[dispatch] Pipeline error:', err.message);
            console.error('[dispatch] stderr:', stderr?.substring(0, 500));
            reject(err);
            return;
          }
          console.log('[dispatch] Pipeline completed successfully');
          resolve(stdout);
        }
      );
    });

    // Step 3: Extract property_summary from pipeline output directory
    // The pipeline saves results to ~/flipperzillow_output/
    let propertySummary = {};

    const outputDir = path.resolve(process.env.HOME || process.env.USERPROFILE || '', 'flipperzillow_output');
    const summaryPath = path.join(outputDir, 'property_summary.json');

    console.log(`[dispatch] Looking for summary at: ${summaryPath}`);

    if (fs.existsSync(summaryPath)) {
      try {
        const content = fs.readFileSync(summaryPath, 'utf-8');
        propertySummary = JSON.parse(content);

        // Log detailed info about what was found
        console.log(`[dispatch] ✓ Loaded property_summary`);
        if (propertySummary.room_count) {
          console.log(`[dispatch]   Rooms found: ${propertySummary.room_count}`);
        }
        if (propertySummary.room_types) {
          console.log(`[dispatch]   Room types: ${JSON.stringify(propertySummary.room_types)}`);
        }
        if (propertySummary.all_detected_objects) {
          console.log(`[dispatch]   Detected objects: ${propertySummary.all_detected_objects.join(', ').slice(0, 100)}...`);
        }
        if (propertySummary.has_natural_light !== undefined) {
          console.log(`[dispatch]   Natural light: ${propertySummary.has_natural_light ? 'yes' : 'limited'}`);
        }
        if (propertySummary.overall_spaciousness) {
          console.log(`[dispatch]   Spaciousness: ${propertySummary.overall_spaciousness}`);
        }
      } catch (e) {
        console.warn(`[dispatch] Failed to parse summary file: ${e}`);
      }
    } else {
      console.warn(`[dispatch] Summary file not found at ${summaryPath}`);
    }

    // Step 4: Save to local data directory
    const dataDir = path.resolve(process.cwd(), 'src', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const localFilePath = path.join(dataDir, 'property_summary.json');
    fs.writeFileSync(localFilePath, JSON.stringify(propertySummary, null, 2));
    console.log('[dispatch] Saved property_summary.json to', localFilePath);

    return NextResponse.json({
      status: 'completed',
      image_count: image_urls.length,
      local_path: localFilePath,
      propertySummary,
      pipelineOutput: pipelineOutput.substring(0, 500),
    });
  } catch (error) {
    console.error('[dispatch] Error:', error);
    return NextResponse.json({
      status: 'error',
      error: String(error),
    }, { status: 500 });
  } finally {
    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        console.warn('[dispatch] Could not delete temp file:', tempFile);
      }
    }
  }
}
