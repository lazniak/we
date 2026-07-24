import { existsSync } from 'fs';
import { AV_ENABLED, AV_MAX_FILE_BYTES, AV_TIMEOUT_MS } from '../config';
import { fileSizeOrNull } from './storage';

export interface ScanResult {
  /** false only when a threat was actually named. */
  clean: boolean;
  threats: { path: string; name: string }[];
  /** Files skipped because they exceed what the scanner will look at. */
  skipped: string[];
  /** True when no scanner was available, so nothing was really checked. */
  unavailable: boolean;
}

let availability: boolean | null = null;

/**
 * clamdscan talks to the resident daemon, so the signature database is loaded
 * once rather than on every scan. Availability is probed once per process.
 */
async function scannerAvailable(): Promise<boolean> {
  if (!AV_ENABLED) return false;
  if (availability !== null) return availability;

  try {
    const probe = Bun.spawn(['clamdscan', '--version'], { stdout: 'pipe', stderr: 'pipe' });
    availability = (await probe.exited) === 0;
  } catch {
    availability = false;
  }

  if (!availability) {
    console.warn('🛡️  clamdscan unavailable - uploads will not be scanned');
  }
  return availability;
}

/**
 * Scans the given files. A threat makes the whole transfer unsafe, so the
 * caller is expected to discard everything rather than just the bad file:
 * archives and installers usually come as a set.
 *
 * Failure to scan is never reported as "clean" - `unavailable` says so
 * explicitly, and the caller decides what that means.
 */
export async function scanFiles(
  files: { path: string; relPath: string }[],
): Promise<ScanResult> {
  const result: ScanResult = { clean: true, threats: [], skipped: [], unavailable: false };

  if (!(await scannerAvailable())) {
    result.unavailable = true;
    return result;
  }

  const scannable: string[] = [];
  for (const file of files) {
    if (!existsSync(file.path)) continue;

    const size = fileSizeOrNull(file.path) ?? 0;
    if (size > AV_MAX_FILE_BYTES) {
      result.skipped.push(file.relPath);
      continue;
    }
    scannable.push(file.path);
  }

  if (scannable.length === 0) return result;

  // --fdpass hands the descriptor to the daemon, so it needs no read access
  // of its own to the uploads directory.
  const proc = Bun.spawn(['clamdscan', '--fdpass', '--no-summary', ...scannable], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeout = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }, AV_TIMEOUT_MS);

  let code: number;
  let output = '';
  try {
    output = await new Response(proc.stdout).text();
    code = await proc.exited;
  } finally {
    clearTimeout(timeout);
  }

  // 0 = clean, 1 = infected, anything else = the scan did not conclude.
  if (code === 1) {
    const byPath = new Map(files.map((f) => [f.path, f.relPath]));
    for (const line of output.split('\n')) {
      const match = line.match(/^(.*): (.+) FOUND$/);
      if (!match) continue;
      result.threats.push({
        path: byPath.get(match[1]) ?? match[1],
        name: match[2],
      });
    }
    if (result.threats.length === 0) {
      result.threats.push({ path: '(nieznany)', name: 'wykryto zagrożenie' });
    }
    result.clean = false;
    return result;
  }

  if (code !== 0) {
    console.error(`🛡️  clamdscan exited with ${code}, treating transfer as unscanned`);
    result.unavailable = true;
  }

  return result;
}
