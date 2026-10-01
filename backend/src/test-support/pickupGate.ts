// Test-only preload: hold a selected source after its first chunk so network
// buffering cannot turn the abort/claim assertions into a timing race.
import { existsSync, readFileSync } from 'node:fs';
const originalFile = Bun.file;
const gate = process.env.E2E_PICKUP_GATE;
Bun.file = ((path: Parameters<typeof Bun.file>[0], ...args: unknown[]) => {
  const file = originalFile(path as string);
  if (typeof path !== 'string' || !gate || !existsSync(gate) || !path.includes(readFileSync(gate, 'utf8'))) return file;
  const stream = () => {
    let offset = 0;
    let cancelled = false;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (offset > 0) while (!cancelled && existsSync(gate)) await Bun.sleep(10);
        if (cancelled) return;
        if (offset >= file.size) { controller.close(); return; }
        const bytes = new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer());
        offset += bytes.length;
        if (!cancelled) controller.enqueue(bytes);
      },
      cancel() { cancelled = true; },
    });
  };
  Object.defineProperty(file, 'stream', { value: stream });
  return file;
}) as typeof Bun.file;
