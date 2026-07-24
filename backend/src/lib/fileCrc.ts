import { setFileCrc, type TransferFile } from '../db';
import { fileSizeOrNull, storagePath } from './storage';
import { crc32 } from './zipStream';

/** CRC32 of a file on disk, streamed so nothing is buffered. */
export async function computeCrcFromDisk(path: string): Promise<number> {
  const reader = Bun.file(path).stream().getReader();
  let crc = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      crc = crc32(crc, value);
    }
  } finally {
    reader.releaseLock();
  }
  return crc;
}

/**
 * CRC recorded at upload time, or computed and cached on first use. The
 * fallback covers rows written by the pre-rework backend.
 */
export async function ensureCrc(transferId: string, file: TransferFile): Promise<number> {
  if (file.crc32 !== null && file.crc32 !== undefined) return file.crc32 >>> 0;

  const path = storagePath(transferId, file.storage_name);
  const size = fileSizeOrNull(path);
  if (size === null) return 0;

  const crc = await computeCrcFromDisk(path);
  setFileCrc(file.id, crc, size, size);
  return crc;
}
