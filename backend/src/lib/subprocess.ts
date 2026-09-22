/** Small helpers for running external converters safely. */

import type { Subprocess } from 'bun';

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** How long a converter gets to exit on SIGTERM before it is killed outright. */
const KILL_GRACE_MS = 2_000;

/**
 * Stops a converter: SIGTERM first, so ImageMagick and friends can remove
 * their temp files, then SIGKILL if it is still around after the grace period.
 */
function terminate(proc: Subprocess): void {
  try {
    proc.kill('SIGTERM');
  } catch {
    return; // already gone
  }
  const hard = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }, KILL_GRACE_MS);
  proc.exited.finally(() => clearTimeout(hard));
}

/**
 * Runs a command with a hard timeout; never throws on non-zero exit.
 *
 * A helper the converter starts (LibreOffice's soffice.bin, an ImageMagick
 * delegate) can inherit its pipes and keep them open after the converter
 * itself is gone, so the caller also stops waiting at a deadline - otherwise
 * one stuck helper would hold a conversion slot forever.
 */
export async function run(cmd: string[], timeoutMs: number): Promise<RunResult> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    terminate(proc);
  }, timeoutMs);

  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    giveUp = setTimeout(() => resolve(null), timeoutMs + KILL_GRACE_MS + 1_000);
  });

  try {
    const outcome = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      deadline,
    ]);
    if (!outcome) return { code: -1, stdout: '', stderr: '', timedOut: true };
    const [stdout, stderr, code] = outcome;
    return { code, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
    clearTimeout(giveUp);
  }
}

/**
 * Runs a command whose stdout is binary (an image piped out of ffmpeg or
 * ImageMagick). Returns null on a non-zero exit, a timeout, empty output, or
 * output larger than maxBytes - the process is stopped as soon as it passes
 * the cap, so a runaway converter cannot balloon the heap. At the timeout the
 * pipe is abandoned too, whoever still holds it open.
 */
export async function runBuffer(
  cmd: string[],
  timeoutMs: number,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'ignore', stdin: 'ignore' });
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();

  let expired = false;
  const stop = () => {
    terminate(proc);
    reader.cancel().catch(() => {});
  };
  const timer = setTimeout(() => {
    expired = true;
    stop();
  }, timeoutMs);

  try {
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        stop();
        return null;
      }
      parts.push(value);
    }
    if (expired) return null;

    const code = await proc.exited;
    if (expired || code !== 0 || total === 0) return null;
    return Buffer.concat(parts, total);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounded concurrency for expensive conversions, so a burst of previews cannot
 * spawn dozens of LibreOffice / ffmpeg processes at once on a shared box.
 */
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  private readonly lowQueue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  /** Tasks waiting for a slot, both priorities. */
  get waiting(): number {
    return this.queue.length + this.lowQueue.length;
  }

  /**
   * Runs the task once a slot is free. Low-priority work waits until no
   * normal work is queued. A finishing task hands its slot straight to the
   * next waiter, so a newcomer can never slip in between and exceed the limit.
   */
  async run<T>(task: () => Promise<T>, priority: 'high' | 'low' = 'high'): Promise<T> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      await new Promise<void>((resolve) =>
        (priority === 'low' ? this.lowQueue : this.queue).push(resolve),
      );
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift() ?? this.lowQueue.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/**
 * De-duplicates concurrent work by key: a second caller asking for the same
 * cache entry awaits the first instead of running the conversion again.
 */
export class SingleFlight<T> {
  private readonly inflight = new Map<string, Promise<T>>();

  has(key: string): boolean {
    return this.inflight.has(key);
  }

  run(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = task().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}
