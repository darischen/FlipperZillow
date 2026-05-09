/**
 * POST /api/tour/generate-3d
 * Orchestrate 3D mesh generation for scraped room images using batch processing.
 * Accepts a list of image paths and calls SLAT's /batch-decode endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";

// Custom dispatcher with extended timeouts for long-running SLAT inference.
// Node's default fetch has headersTimeout=300s/bodyTimeout=300s which kills
// the connection while SLAT is running inference (no headers sent until done).
// On a 3060Ti, single-image SLAT inference observed at 20-30 min (xFormers
// disabled, falling back to SDPA attention). Set generously to avoid timeouts.
const slatDispatcher = new Agent({
  headersTimeout: 2700000, // 45 minutes
  bodyTimeout: 2700000,    // 45 minutes
  connectTimeout: 30000,   // 30 seconds to establish connection
});

interface GenerateRequest {
  addressHash: string;
  imagePaths: string[];
  outputDir?: string;
}

interface GenerateResult {
  success: boolean;
  addressHash: string;
  meshes: Array<{
    imageIndex: number;
    imagePath: string;
    glbPath?: string;
    error?: string;
    elapsedMs?: number;
  }>;
  totalElapsedMs?: number;
}

const SLAT_SERVICE = process.env.SLAT_SERVICE_URL || "http://localhost:8001";

function convertToDockerPath(imagePath: string): string {
  // If it's already a Docker path, use as-is
  if (imagePath.startsWith('/app/')) {
    return imagePath;
  }

  // Convert Windows file path to Docker container path
  if (imagePath.includes('src/data') || imagePath.includes('src\\data')) {
    const match = imagePath.match(/(?:src[\\/]data)(.*)$/i);
    if (match) {
      return `/app/data${match[1].replace(/\\/g, '/')}`;
    }
  }

  return imagePath;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const body: GenerateRequest = await req.json();
    const { addressHash, imagePaths } = body;

    if (!addressHash || !imagePaths || imagePaths.length === 0) {
      return NextResponse.json(
        { error: "Missing addressHash or imagePaths" },
        { status: 400 }
      );
    }

    console.log(`[3D] Batch generating ${imagePaths.length} meshes for ${addressHash}`);

    // Convert all paths to Docker paths
    const dockerImagePaths = imagePaths.map((path, index) => {
      const dockerPath = convertToDockerPath(path);
      console.log(`[3D] Image ${index}: ${path} → ${dockerPath}`);
      return dockerPath;
    });

    // Call SLAT batch-decode endpoint once with all images
    console.log(`[3D] Calling SLAT /batch-decode with ${dockerImagePaths.length} images`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2700000); // 45 minutes for entire batch

    const response = await fetch(`${SLAT_SERVICE}/batch-decode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_paths: dockerImagePaths,
        output_dir: addressHash,
      }),
      signal: controller.signal,
      // @ts-expect-error - dispatcher is a Node.js extension, not in fetch spec types
      dispatcher: slatDispatcher,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[3D] Batch decode failed: ${errorText}`);
      return NextResponse.json(
        { error: `SLAT service error: ${errorText}` },
        { status: response.status }
      );
    }

    const batchResult = await response.json();

    // Map batch results back to our format
    const meshes = dockerImagePaths.map((dockerPath, index) => {
      const batchItem = batchResult.results?.[index];

      if (!batchItem) {
        return {
          imageIndex: index,
          imagePath: imagePaths[index],
          error: "No result for image",
        };
      }

      if (batchItem.success) {
        console.log(
          `[3D] Image ${index} OK: ${batchItem.glb_path} (${batchItem.elapsed_ms}ms)`
        );
        return {
          imageIndex: index,
          imagePath: imagePaths[index],
          success: true,
          glbPath: batchItem.glb_path,
          elapsedMs: batchItem.elapsed_ms,
        };
      } else {
        console.log(`[3D] Image ${index} failed: ${batchItem.error}`);
        return {
          imageIndex: index,
          imagePath: imagePaths[index],
          error: batchItem.error || "Mesh generation failed",
        };
      }
    });

    const successCount = meshes.filter((m) => m.success).length;
    const totalElapsed = Date.now() - startTime;

    const result: GenerateResult = {
      success: successCount === meshes.length,
      addressHash,
      meshes,
      totalElapsedMs: totalElapsed,
    };

    console.log(
      `[3D] Batch complete: ${successCount}/${meshes.length} meshes in ${totalElapsed}ms`
    );

    return NextResponse.json(result, {
      status: result.success ? 200 : 206, // 206 Partial Content if some failed
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[3D] API error: ${errorMsg}`);

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
