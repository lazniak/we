/**
 * Camera RAW files carry a finished JPEG next to the sensor data - the picture
 * the camera shows on its own screen, usually at full resolution. Decoding it
 * takes milliseconds; developing the RAW itself (LibRaw via ImageMagick) takes
 * seconds per file, which a gallery of a few hundred shots cannot afford.
 *
 * The preview is found by walking JPEG structure rather than by parsing each
 * vendor's container, so one routine covers CR2, CR3, NEF, ARW, RAF, DNG, ORF
 * and the rest. Random bytes in the sensor data can look like a JPEG start
 * marker, so a candidate only counts once its segments, scan data and end
 * marker all line up.
 *
 * The walk runs on the event loop, so its cost is capped: every candidate of
 * one search draws on a shared allowance. A crafted file whose candidates all
 * lead into the same huge block of scan data (or of fill bytes) would
 * otherwise rescan it once per candidate and hold the server for seconds.
 */

export interface EmbeddedJpeg {
  offset: number;
  length: number;
  width: number;
  height: number;
}

const SOI = Buffer.from([0xff, 0xd8, 0xff]);

/** Frame types libjpeg decodes: baseline, extended sequential, progressive. */
const DECODABLE_SOF = new Set([0xc0, 0xc1, 0xc2]);

/** Work allowance shared by all candidates of one search, in loop steps. */
export interface ScanBudget {
  left: number;
}

/**
 * Enough for about a gigabyte of real JPEG data, where an 0xFF turns up once
 * every 256 bytes; a hostile layout runs out after tens of milliseconds.
 */
const SEARCH_ALLOWANCE = 2_000_000;

/** Every SOFn except DHT (c4), JPG (c8) and DAC (cc), which share the range. */
function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Walks one JPEG that starts at `start` (on its SOI marker). Returns where it
 * ends and its dimensions, or null when the bytes are not one complete JPEG
 * that an ordinary decoder can read. The lossless 12/14-bit JPEG some cameras
 * use for the sensor data itself is rejected here on purpose.
 */
export function parseJpegAt(
  buf: Uint8Array,
  start: number,
  budget: ScanBudget = { left: Infinity },
): EmbeddedJpeg | null {
  const n = buf.length;
  let i = start + 2;
  let width = 0;
  let height = 0;
  let decodable = false;
  let sawScan = false;

  while (i < n) {
    if (--budget.left < 0) return null;
    if (buf[i] !== 0xff) return null;
    while (i < n && buf[i] === 0xff) {
      i++; // fill bytes before a marker
      if (--budget.left < 0) return null;
    }
    if (i >= n) return null;
    const marker = buf[i++];

    if (marker === 0xd9) {
      if (!sawScan || !decodable || !width || !height) return null;
      return { offset: start, length: i - start, width, height };
    }
    // Markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8 || marker === 0x00) return null;

    if (i + 1 >= n) return null;
    const length = (buf[i] << 8) | buf[i + 1];
    if (length < 2 || i + length > n) return null;

    if (isSof(marker)) {
      if (length < 8) return null;
      height = (buf[i + 3] << 8) | buf[i + 4];
      width = (buf[i + 5] << 8) | buf[i + 6];
      decodable = DECODABLE_SOF.has(marker) && buf[i + 2] === 8;
    }
    i += length;

    if (marker === 0xda) {
      sawScan = true;
      // Entropy-coded data runs to the next marker that is neither a stuffed
      // zero nor a restart marker.
      for (;;) {
        if (--budget.left < 0) return null;
        const ff = buf.indexOf(0xff, i);
        // The native search is cheap but not free; it is charged per 64 bytes.
        budget.left -= ((ff === -1 ? n : ff) - i) >>> 6;
        if (ff === -1 || ff + 1 >= n) return null;
        const next = buf[ff + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          i = ff + 2;
          continue;
        }
        if (next === 0xff) {
          i = ff + 1; // fill byte, the marker follows
          continue;
        }
        i = ff;
        break;
      }
    }
  }
  return null;
}

/**
 * The largest decodable JPEG inside `buf`, by pixel count. Cameras store a
 * tiny EXIF thumbnail, a screen-sized preview and often a full-size one; the
 * biggest is the one worth shrinking.
 */
export function findLargestJpeg(
  buf: Buffer,
  maxCandidates = 64,
  allowance = SEARCH_ALLOWANCE,
): EmbeddedJpeg | null {
  const budget: ScanBudget = { left: allowance };
  let best: EmbeddedJpeg | null = null;
  let from = 0;

  for (let seen = 0; seen < maxCandidates && budget.left > 0; seen++) {
    const at = buf.indexOf(SOI, from);
    if (at === -1) break;
    const jpeg = parseJpegAt(buf, at, budget);
    if (jpeg && (!best || jpeg.width * jpeg.height > best.width * best.height)) best = jpeg;
    // A whole JPEG is stepped over: anything inside it is its own EXIF thumbnail.
    from = jpeg ? at + jpeg.length : at + SOI.length;
  }
  return best;
}

/**
 * The EXIF orientation stored in a TIFF-shaped RAW's first IFD (CR2, NEF, ARW,
 * DNG, PEF, ORF, RW2…). The embedded preview is usually stored unrotated, with
 * the camera's orientation recorded only here. Returns 1 when there is none.
 */
export function tiffOrientation(buf: Uint8Array): number {
  if (buf.length < 16) return 1;
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  const be = buf[0] === 0x4d && buf[1] === 0x4d;
  if (!le && !be) return 1;

  const u16 = (o: number) => (le ? buf[o] | (buf[o + 1] << 8) : (buf[o] << 8) | buf[o + 1]);
  const u32 = (o: number) =>
    (le
      ? buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)
      : (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;

  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > buf.length) return 1;

  const count = Math.min(u16(ifd), 512);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > buf.length) break;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
