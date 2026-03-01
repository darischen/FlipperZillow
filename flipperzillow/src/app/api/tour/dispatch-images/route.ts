import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const RequestSchema = z.object({
  image_urls: z.array(z.string().url()).min(1),
  address: z.string().optional(),
});

/**
 * SSH into AMD cloud and write image URLs as a JSON file.
 * Reads AMD_CLOUD_HOST and SSH_KEY_PATH from .env.local.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { image_urls, address } = parsed.data;

    const host = process.env.AMD_CLOUD_HOST;
    const keyPath = process.env.SSH_KEY_PATH;

    if (!host || !keyPath) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'AMD_CLOUD_HOST or SSH_KEY_PATH not configured',
      });
    }

    // Resolve key path relative to project root
    const resolvedKey = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);

    if (!fs.existsSync(resolvedKey)) {
      return NextResponse.json({
        status: 'error',
        error: `SSH key not found at ${resolvedKey}`,
      });
    }

    // Use heredoc for reliable large JSON payload upload
    const payload = JSON.stringify({ image_urls, address });

    // Escape single quotes for shell safety
    const escaped = payload.replace(/'/g, "'\\''");
    const remoteCmd = `mkdir -p /workspace && echo '${escaped}' > /workspace/image_urls.json`;
    const sshArgs = [
      '-i', resolvedKey,
      '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=no',
      `root@${host}`,
      remoteCmd,
    ];

    console.log(`[dispatch] SSH to ${host} — writing ${image_urls.length} image URLs`);

    // Step 1: Upload image_urls.json
    await new Promise<string>((resolve, reject) => {
      execFile('ssh', sshArgs, { timeout: 15000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[dispatch] SSH error:', err.message);
          reject(err);
          return;
        }
        if (stderr) console.warn('[dispatch] stderr:', stderr);
        console.log('[dispatch] Wrote /workspace/image_urls.json on AMD cloud');
        resolve(stdout);
      });
    });

    // Step 2: Execute pipeline on AMD cloud
    console.log('[dispatch] Executing pipeline on AMD cloud...');

    // Run pipeline AND retrieve result in a single SSH session to avoid reconnection timeouts.
    // The command runs the pipeline, then prints a delimiter followed by the JSON summary.
    const delimiter = '___SUMMARY_JSON_START___';
    const pipelineCmd = `bash -lc 'source ~/miniconda3/etc/profile.d/conda.sh && conda activate fz && cd ~/amd_cloud_files && python3 pipeline.py /workspace/image_urls.json --skip-sam 2>&1; echo "${delimiter}"; cat /root/outputs/property_summary.json 2>/dev/null || echo "{}"'`;
    const pipelineArgs = [
      '-i', resolvedKey,
      '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=20',
      `root@${host}`,
      pipelineCmd,
    ];

    const fullOutput = await new Promise<string>((resolve, reject) => {
      execFile('ssh', pipelineArgs, { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          // Check if it's just stderr warnings (xFormers etc) but pipeline actually ran
          const output = stdout || '';
          if (output.includes('[pipeline] DONE') || output.includes(delimiter)) {
            console.log('[dispatch] Pipeline completed (with warnings)');
            resolve(output);
            return;
          }
          console.error('[dispatch] Pipeline error:', err.message);
          console.error('[dispatch] stdout:', stdout?.substring(0, 500));
          console.error('[dispatch] stderr:', stderr?.substring(0, 500));
          reject(err);
          return;
        }
        console.log('[dispatch] Pipeline completed successfully');
        resolve(stdout);
      });
    });

    // Split output: everything before delimiter is pipeline logs, after is the JSON summary
    const delimiterIdx = fullOutput.indexOf(delimiter);
    const pipelineOutput = delimiterIdx >= 0 ? fullOutput.substring(0, delimiterIdx) : fullOutput;
    const summaryOutput = delimiterIdx >= 0 ? fullOutput.substring(delimiterIdx + delimiter.length).trim() : '{}';

    let propertySummary = {};
    try {
      propertySummary = JSON.parse(summaryOutput);
      console.log('[dispatch] Parsed property_summary.json from pipeline output');
    } catch (e) {
      console.warn('[dispatch] Failed to parse property_summary.json:', summaryOutput.substring(0, 200));
    }

    // Write summary locally (no separate SCP needed)
    const dataDir = path.resolve(process.cwd(), 'src', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const localFilePath = path.join(dataDir, 'property_summary.json');
    fs.writeFileSync(localFilePath, JSON.stringify(propertySummary, null, 2));
    console.log('[dispatch] Saved property_summary.json to', localFilePath);

    return NextResponse.json({
      status: 'completed',
      image_count: image_urls.length,
      host,
      remote_path: '/workspace/image_urls.json',
      local_path: localFilePath,
      propertySummary,
      pipelineOutput: pipelineOutput.substring(0, 500), // First 500 chars
    });
  } catch (error) {
    console.error('[dispatch] Error:', error);
    return NextResponse.json({
      status: 'error',
      error: String(error),
    });
  }
}
