/**
 * POST /api/tour/generate-3d
 * Orchestrate 3D mesh generation for scraped room images.
 * Accepts a list of image paths and returns GLB URLs.
 */

import { NextRequest, NextResponse } from "next/server";

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
    glbUrl?: string;
    error?: string;
    elapsedMs?: number;
  }>;
  totalElapsedMs?: number;
}

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: GenerateRequest = await req.json();
    const { addressHash, imagePaths } = body;

    if (!addressHash || !imagePaths || imagePaths.length === 0) {
      return NextResponse.json(
        { error: "Missing addressHash or imagePaths" },
        { status: 400 }
      );
    }

    console.log(`[3D] Generating ${imagePaths.length} meshes for ${addressHash}`);

    const meshes = await Promise.all(
      imagePaths.map(async (imagePath, index) => {
        try {
          const startTime = Date.now();

          const response = await fetch(`${PYTHON_BACKEND}/generate-3d`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_path: imagePath,
              address_hash: addressHash,
              room_index: index,
              target_size: 512,
            }),
            timeout: 120000, // 2 minutes per image
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `[3D] Mesh generation failed for image ${index}: ${errorText}`
            );
            return {
              imageIndex: index,
              imagePath,
              error: `HTTP ${response.status}: ${errorText}`,
            };
          }

          const result = await response.json();
          const elapsedMs = Date.now() - startTime;

          if (result.success) {
            console.log(
              `[3D] Generated mesh ${index} in ${elapsedMs}ms: ${result.glb_url}`
            );
            return {
              imageIndex: index,
              imagePath,
              glbUrl: result.glb_url,
              elapsedMs,
            };
          } else {
            return {
              imageIndex: index,
              imagePath,
              error: result.error || "Unknown error",
            };
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error(
            `[3D] Exception during mesh generation for image ${index}: ${errorMsg}`
          );
          return {
            imageIndex: index,
            imagePath,
            error: errorMsg,
          };
        }
      })
    );

    const successCount = meshes.filter((m) => !m.error).length;

    const response: GenerateResult = {
      success: successCount === meshes.length,
      addressHash,
      meshes,
      totalElapsedMs: Date.now(),
    };

    console.log(
      `[3D] Complete: ${successCount}/${meshes.length} meshes generated`
    );

    return NextResponse.json(response, {
      status: response.success ? 200 : 206, // 206 Partial Content if some failed
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
