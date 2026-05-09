export interface SAM3DInferenceResult {
  success: boolean;
  glbUrl?: string;
  error?: string;
  elapsedMs?: number;
}

export interface SAM3DStatusResponse {
  running: boolean;
  healthy: boolean;
  error?: string;
  timestamp: string;
}

export class SAM3DClient {
  private static instance: SAM3DClient;

  private constructor() {}

  static getInstance(): SAM3DClient {
    if (!SAM3DClient.instance) {
      SAM3DClient.instance = new SAM3DClient();
    }
    return SAM3DClient.instance;
  }

  private async getImageFromOutput(imageInput: string): Promise<string> {
    // If it's a data URL or HTTP URL, use dispatch-images to download to standard location
    if (imageInput.startsWith('data:') || imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      try {
        // Use dispatch-images to download and upgrade the image
        const response = await fetch('/api/tour/dispatch-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_urls: [imageInput]
          }),
        });

        if (!response.ok) {
          throw new Error(`Dispatch failed: ${response.status}`);
        }

        const result = await response.json();
        // dispatch-images downloads to ~/flipperzillow_output/images/img_000.jpg
        if (result.images_dir) {
          // dispatch-images saves to src/data/images which is mounted as /app/data/images in Docker
          return `/app/data/images/img_000.jpg`;
        }
        throw new Error('No images returned from dispatch');
      } catch (error) {
        console.warn('[SAM3D] Failed to get image from output:', error);
        return imageInput; // Fallback
      }
    }

    // Otherwise assume it's already a file path
    return imageInput;
  }

  async checkStatus(): Promise<SAM3DStatusResponse> {
    try {
      const response = await fetch('/api/sam3d/status', { method: 'GET' });
      if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      return {
        running: false,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/sam3d/start', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `Failed to start (HTTP ${response.status})`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/sam3d/stop', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `Failed to stop (HTTP ${response.status})`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async generateMesh(imagePath: string): Promise<SAM3DInferenceResult> {
    const startTime = Date.now();

    try {
      // Get image from output directory (downloads via dispatch-images if needed)
      const actualImagePath = await this.getImageFromOutput(imagePath);

      // Ensure service is running
      const status = await this.checkStatus();
      if (!status.healthy) {
        console.log('[SAM3D] Service not running, starting...');
        const startResult = await this.start();
        if (!startResult.success) {
          return {
            success: false,
            error: startResult.error || 'Failed to start SAM3D service',
            elapsedMs: Date.now() - startTime,
          };
        }
      }

      // Run inference via the existing generate-3d endpoint
      // For a single image, we use a simplified call
      // Use a timestamped path so outputs go to mounted /app/data/glb_output/{sessionId}/
      const sessionId = `session_${Date.now()}`;
      const response = await fetch('/api/tour/generate-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressHash: `/app/data/glb_output/${sessionId}`, // Absolute docker path for output
          imagePaths: [actualImagePath],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Inference failed: ${errorText}`,
          elapsedMs: Date.now() - startTime,
        };
      }

      const result = await response.json();

      // Extract GLB URL from result
      if (result.meshes && result.meshes.length > 0) {
        const mesh = result.meshes[0];
        if (mesh.error) {
          return {
            success: false,
            error: mesh.error,
            elapsedMs: Date.now() - startTime,
          };
        }
        return {
          success: true,
          glbUrl: mesh.glbUrl,
          elapsedMs: Date.now() - startTime,
        };
      }

      return {
        success: false,
        error: 'No mesh data in response',
        elapsedMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime,
      };
    }
  }

  async inferenceWithCleanup(
    imagePath: string,
    onProgress?: (status: string) => void
  ): Promise<SAM3DInferenceResult> {
    try {
      onProgress?.('Starting Docker container...');
      const startResult = await this.start();
      if (!startResult.success) {
        return {
          success: false,
          error: `Failed to start Docker: ${startResult.error}`,
        };
      }

      onProgress?.('Generating 3D mesh...');
      const inferenceResult = await this.generateMesh(imagePath);

      // Always stop Docker after inference completes (success or failure)
      onProgress?.('Cleaning up Docker...');
      await this.stop();

      return inferenceResult;
    } catch (error) {
      // Try to stop Docker on error
      await this.stop().catch(console.error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
