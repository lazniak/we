import type { InitTransferFile } from './types';

const PARALLEL_UPLOADS = 4;

/**
 * Retry budget for a single chunk: 0.4 + 0.8 + 1.6 + 3.2 + 6.4 + 8 + 8 s,
 * about 28 seconds in total.
 *
 * Sized deliberately: a backend restart (deploy, crash, pm2 reload) takes
 * ten to twenty seconds, and an upload in flight has to ride straight
 * through it instead of dying at the user's expense.
 */
const MAX_ATTEMPTS = 8;
const RETRY_BASE_MS = 400;
const RETRY_CAP_MS = 8_000;

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
  /** Bytes per second, smoothed so the readout does not jitter. */
  speed: number | null;
  eta: number | null;
  currentFile: string;
}

export interface UploadOptions {
  transferId: string;
  chunkSize: number;
  /** Planned files from /init, index aligned with `blobs`. */
  plan: InitTransferFile[];
  blobs: File[];
  signal?: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}

interface Job {
  fileIndex: number;
  chunkIndex: number;
  start: number;
  end: number;
}

export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadAbortedError';
  }
}

/** A failure that retrying cannot fix, so it is reported straight away. */
class PermanentUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentUploadError';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new UploadAbortedError());
      },
      { once: true },
    );
  });
}

/**
 * Uploads every planned file chunk by chunk. Chunks carry their own absolute
 * position, so they can go out in parallel and in any order, and a retry of an
 * already stored chunk is harmless.
 */
export async function uploadFiles({
  transferId,
  chunkSize,
  plan,
  blobs,
  signal,
  onProgress,
}: UploadOptions): Promise<void> {
  const jobs: Job[] = [];

  for (const file of plan) {
    const chunks = Math.max(1, Math.ceil(file.size / chunkSize));
    for (let i = 0; i < chunks; i++) {
      jobs.push({
        fileIndex: file.index,
        chunkIndex: i,
        start: i * chunkSize,
        end: Math.min((i + 1) * chunkSize, file.size),
      });
    }
  }

  const totalBytes = plan.reduce((acc, f) => acc + f.size, 0);
  let uploadedBytes = 0;
  let cursor = 0;

  const startedAt = Date.now();
  let smoothedSpeed: number | null = null;
  let lastSample = { at: startedAt, bytes: 0 };

  const report = (currentFile: string) => {
    const now = Date.now();
    const elapsed = now - lastSample.at;

    if (elapsed >= 400) {
      const instant = ((uploadedBytes - lastSample.bytes) * 1000) / elapsed;
      smoothedSpeed = smoothedSpeed === null ? instant : smoothedSpeed * 0.7 + instant * 0.3;
      lastSample = { at: now, bytes: uploadedBytes };
    }

    const remaining = totalBytes - uploadedBytes;
    onProgress({
      uploadedBytes,
      totalBytes,
      progress: totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 100,
      speed: smoothedSpeed,
      eta: smoothedSpeed && smoothedSpeed > 0 ? (remaining / smoothedSpeed) * 1000 : null,
      currentFile,
    });
  };

  const sendChunk = async (job: Job): Promise<void> => {
    const blob = blobs[job.fileIndex];
    const body = job.end > job.start ? blob.slice(job.start, job.end) : new Blob([]);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (signal?.aborted) throw new UploadAbortedError();

      try {
        const response = await fetch(
          `/api/transfer/${transferId}/file/${job.fileIndex}/chunk/${job.chunkIndex}`,
          {
            method: 'PUT',
            body,
            headers: { 'Content-Type': 'application/octet-stream' },
            signal,
          },
        );

        if (response.ok) return;

        // Client errors other than throttling and timeouts will not get better.
        if (response.status < 500 && response.status !== 408 && response.status !== 429) {
          const detail = await response.json().catch(() => null);
          throw new PermanentUploadError(
            detail?.error || `Upload rejected (${response.status})`,
          );
        }

        if (attempt === MAX_ATTEMPTS) {
          throw new Error(`Upload failed after ${MAX_ATTEMPTS} attempts (${response.status})`);
        }
      } catch (error) {
        if (signal?.aborted || error instanceof UploadAbortedError) {
          throw new UploadAbortedError();
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new UploadAbortedError();
        }
        if (error instanceof PermanentUploadError || attempt === MAX_ATTEMPTS) throw error;
      }

      await sleep(Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CAP_MS), signal);
    }
  };

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) throw new UploadAbortedError();

      const index = cursor++;
      if (index >= jobs.length) return;

      const job = jobs[index];
      await sendChunk(job);

      uploadedBytes += job.end - job.start;
      report(plan[job.fileIndex]?.path ?? '');
    }
  };

  report(plan[0]?.path ?? '');
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL_UPLOADS, Math.max(1, jobs.length)) }, worker),
  );
}

/**
 * Marks the transfer ready. Retried on the same budget as the chunks - losing
 * this call would waste an upload that already fully arrived.
 */
export async function finishTransfer(transferId: string, signal?: AbortSignal): Promise<void> {
  let lastError: unknown;
  const attempts = 6;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new UploadAbortedError();

    try {
      const response = await fetch(`/api/transfer/${transferId}/complete`, {
        method: 'POST',
        signal,
      });

      if (response.ok) return;

      const detail = await response.json().catch(() => null);
      lastError = new Error(detail?.error || `Could not finalise transfer (${response.status})`);

      if (response.status === 409 && Array.isArray(detail?.missing)) {
        lastError = new Error(
          `Upload incomplete: ${detail.missing.length} file(s) did not arrive fully`,
        );
      }
    } catch (error) {
      if (signal?.aborted) throw new UploadAbortedError();
      lastError = error;
    }

    if (attempt < attempts) {
      await sleep(Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS), signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not finalise transfer');
}
