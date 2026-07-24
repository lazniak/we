import { run } from './subprocess';

/**
 * 360 detection is by embedded tags, as requested - not by guessing from the
 * aspect ratio, which would false-positive on ordinary wide images.
 *
 * Photos: the XMP GPano block (Google Photo Sphere) declares an equirectangular
 * projection. Videos: the spherical metadata surfaces as a side-data entry that
 * ffprobe reports, covering both the modern st3d box and the legacy Google
 * spherical-video tag.
 */

const GPANO_EQUIRECT = /GPano:ProjectionType>?\s*[:=]?\s*"?equirectangular/i;
const GPANO_WIDTH = /GPano:(FullPanoWidthPixels|CroppedAreaImageWidthPixels)/i;
const XMP_EQUIRECT = /equirectangular/i;

/** Reads the head of an image and looks for a GPano equirectangular marker. */
export async function detect360Image(path: string): Promise<boolean> {
  try {
    // Panorama XMP lives in the APP1 segment near the start of the file.
    const head = new Uint8Array(await Bun.file(path).slice(0, 512 * 1024).arrayBuffer());
    const text = new TextDecoder('latin1').decode(head);
    if (!/GPano:/.test(text)) return false;
    return GPANO_EQUIRECT.test(text) || (GPANO_WIDTH.test(text) && XMP_EQUIRECT.test(text));
  } catch {
    return false;
  }
}

/** Uses ffprobe's side-data to spot a spherical (360) video stream. */
export async function detect360Video(path: string): Promise<boolean> {
  try {
    const result = await run(
      ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_entries',
        'stream_side_data=side_data_type:stream=codec_type', path],
      15_000,
    );
    if (result.code !== 0) return false;
    return /spherical/i.test(result.stdout);
  } catch {
    return false;
  }
}
