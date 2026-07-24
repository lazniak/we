import { describe, expect, it } from 'bun:test';
import JSZip from 'jszip';
import { createZipStream, crc32, crc32Combine, planZip, type ZipEntry } from './zipStream';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function streamOf(data: Uint8Array, chunkSize = 7): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.length) {
        controller.close();
        return;
      }
      controller.enqueue(data.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('crc32', () => {
  it('matches the known value for "123456789"', () => {
    expect(crc32(0, bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is incremental', () => {
    const whole = crc32(0, bytes('hello world'));
    const split = crc32(crc32(0, bytes('hello ')), bytes('world'));
    expect(split).toBe(whole);
  });
});

describe('crc32Combine', () => {
  it('reconstructs the CRC of concatenated buffers', () => {
    const a = bytes('the quick brown fox ');
    const b = bytes('jumps over the lazy dog, 1234567890');
    const combined = crc32Combine(crc32(0, a), crc32(0, b), b.length);
    expect(combined).toBe(crc32(0, new Uint8Array([...a, ...b])));
  });

  it('handles many out-of-order chunks', () => {
    const total = new Uint8Array(300_000);
    for (let i = 0; i < total.length; i++) total[i] = (i * 31 + 7) & 0xff;

    const chunkSize = 4096;
    let combined = 0;
    for (let offset = 0; offset < total.length; offset += chunkSize) {
      const chunk = total.subarray(offset, Math.min(offset + chunkSize, total.length));
      combined = crc32Combine(combined, crc32(0, chunk), chunk.length);
    }

    expect(combined).toBe(crc32(0, total));
  });

  it('is a no-op for an empty tail', () => {
    const a = bytes('abc');
    expect(crc32Combine(crc32(0, a), 0, 0)).toBe(crc32(0, a));
  });
});

describe('planZip / createZipStream', () => {
  const files = [
    { name: 'readme.txt', data: bytes('hello from we.pablogfx.com') },
    { name: 'docs/deep/nested — ąćę.md', data: bytes('# tytuł\nzażółć gęślą jaźń') },
    { name: 'empty.bin', data: new Uint8Array(0) },
    { name: 'big.dat', data: new Uint8Array(200_000).fill(0xab) },
  ];

  function entries(): ZipEntry[] {
    return [
      { name: 'docs', size: 0, crc: 0, isDir: true },
      { name: 'docs/deep', size: 0, crc: 0, isDir: true },
      ...files.map((f) => ({
        name: f.name,
        size: f.data.length,
        crc: crc32(0, f.data),
        isDir: false,
        open: () => streamOf(f.data),
      })),
    ];
  }

  it('emits exactly the planned number of bytes', async () => {
    const plan = planZip(entries(), new Date('2026-02-03T10:20:30Z'));
    const output = await collect(createZipStream(plan));
    expect(output.length).toBe(plan.totalSize);
  });

  it('produces an archive a real unzipper can read', async () => {
    const plan = planZip(entries(), new Date('2026-02-03T10:20:30Z'));
    const output = await collect(createZipStream(plan));

    const zip = await JSZip.loadAsync(output, { checkCRC32: true });

    for (const file of files) {
      const entry = zip.file(file.name);
      expect(entry, `missing ${file.name}`).not.toBeNull();
      const content = await entry!.async('uint8array');
      expect(content.length).toBe(file.data.length);
      expect(Array.from(content.slice(0, 32))).toEqual(Array.from(file.data.slice(0, 32)));
    }

    expect(zip.folder('docs')).not.toBeNull();
    expect(zip.files['docs/deep/']).toBeDefined();
  });

  it('rejects an entry whose payload does not match the plan', async () => {
    const plan = planZip(
      [{ name: 'lying.bin', size: 100, crc: 0, isDir: false, open: () => streamOf(bytes('short')) }],
      new Date(),
    );
    await expect(collect(createZipStream(plan))).rejects.toThrow(/truncated/);
  });

  it('still produces a readable archive when the timestamp is unusable', async () => {
    const plan = planZip(entries(), new Date('not a date'));
    const output = await collect(createZipStream(plan));

    expect(output.length).toBe(plan.totalSize);
    const zip = await JSZip.loadAsync(output, { checkCRC32: true });
    expect(zip.file('readme.txt')).not.toBeNull();
  });

  it('switches to zip64 layout for very large entries', () => {
    const plan = planZip(
      [{ name: 'huge.bin', size: 5 * 1024 * 1024 * 1024, crc: 0, isDir: false }],
      new Date(),
    );
    expect(plan.needsZip64Eocd).toBe(true);
    expect(plan.entries[0].zip64).toBe(true);
    // 30 byte header + name + 20 byte zip64 extra + payload
    expect(plan.centralDirOffset).toBe(30 + 8 + 20 + 5 * 1024 * 1024 * 1024);
  });
});
