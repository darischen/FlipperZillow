"""
Watch for SSH-uploaded image_urls.json and process automatically.

The Next.js frontend will SSH into AMD cloud and write:
  workspace/image_urls.json

This script monitors that location and triggers the pipeline when a new file arrives.
Useful for continuous processing of uploaded batches.
"""
import json
import time
import hashlib
from pathlib import Path
from datetime import datetime

from pipeline import run_pipeline


# workspace is at /workspace/ (one level above /root/)
WORKSPACE_DIR = Path("/workspace")
URLS_FILE = WORKSPACE_DIR / "image_urls.json"
PROCESSED_FILE = WORKSPACE_DIR / "processed.txt"


def load_urls() -> list[str]:
    """Load image URLs from the SSH-uploaded JSON file."""
    if not URLS_FILE.exists():
        return []

    try:
        with open(URLS_FILE) as f:
            data = json.load(f)

        # Handle both array format and object with "urls" key
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "urls" in data:
            return data["urls"]
        else:
            return []
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading {URLS_FILE}: {e}")
        return []


def get_file_hash(file_path: Path) -> str:
    """Get SHA256 hash of a file."""
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        sha.update(f.read())
    return sha.hexdigest()


def mark_processed(urls: list[str], job_id: str):
    """Record that these URLs have been processed."""
    PROCESSED_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROCESSED_FILE, "a") as f:
        timestamp = datetime.now().isoformat()
        f.write(f"{timestamp} | {job_id} | {len(urls)} images\n")


def watch_and_process(poll_interval: int = 5):
    """
    Monitor workspace/image_urls.json and process when it changes.

    Args:
        poll_interval: seconds to wait between checks
    """
    print(f"\n{'='*60}")
    print(f"AMD Cloud Pipeline Watcher")
    print(f"Monitoring: {URLS_FILE}")
    print(f"Poll interval: {poll_interval}s")
    print(f"{'='*60}\n")

    last_hash = None

    while True:
        if URLS_FILE.exists():
            current_hash = get_file_hash(URLS_FILE)

            if current_hash != last_hash:
                print(f"[watch] {URLS_FILE} changed, loading URLs...")
                urls = load_urls()

                if urls:
                    print(f"[watch] Found {len(urls)} image URLs, starting pipeline...")
                    print()

                    result = run_pipeline(
                        image_urls=urls,
                        skip_sam=False,
                        skip_dformer=False,
                        create_mesh=True,
                    )

                    job_id = result.get("job_id", "unknown")
                    print()
                    print(f"[watch] Pipeline completed: {job_id}")
                    mark_processed(urls, job_id)

                    # Write result summary to workspace
                    summary_out = WORKSPACE_DIR / f"{job_id}_summary.json"
                    with open(summary_out, "w") as f:
                        json.dump(result.get("property_summary", {}), f, indent=2)
                    print(f"[watch] Summary written to {summary_out}")

                    glb_path = result.get("glb_path")
                    if glb_path:
                        print(f"[watch] 3D model ready at: {glb_path}")

                    last_hash = current_hash
                else:
                    print(f"[watch] No URLs found in {URLS_FILE}")

        time.sleep(poll_interval)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Watch for SSH-uploaded image URLs")
    parser.add_argument("--once", action="store_true", help="Process once and exit")
    parser.add_argument("--poll", type=int, default=5, help="Poll interval in seconds")

    args = parser.parse_args()

    if args.once:
        urls = load_urls()
        if urls:
            print(f"Found {len(urls)} URLs, processing...")
            run_pipeline(image_urls=urls)
        else:
            print(f"No URLs in {URLS_FILE}")
    else:
        watch_and_process(poll_interval=args.poll)
