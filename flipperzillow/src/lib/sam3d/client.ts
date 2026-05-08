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

  private async convertDataUrlToFile(dataUrl: string): Promise<string> {
    // If it's already a file path, return as-is
    if (!dataUrl.startsWith('data:')) {
      return dataUrl;
    }

    // Convert data URL to blob, then upload via API for processing
    try {
      const response = await fetch('/api/sam3d/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      return result.filePath || dataUrl; // Fallback to original if conversion fails
    } catch (error) {
      console.warn('[SAM3D] Failed to convert data URL, using original:', error);
      return dataUrl; // Fallback: Python backend may handle it
    }
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
      // Convert data URL to file path if needed
      const actualImagePath = await this.convertDataUrlToFile(imagePath);

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
      const response = await fetch('/api/tour/generate-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressHash: 'temp', // Use temp hash for single image inference
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
