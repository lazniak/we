/**
 * Uploads are protected on two independent levels.
 *
 * 1. Nothing is rendered by the browser unless its type is on the allow-list
 *    below, and each allowed type is served in a form that cannot execute:
 *    media as media, everything textual as text/plain. So an uploaded .html
 *    or .js can be read, but never runs in the site's own origin.
 *
 * 2. Things a double click would actually run are additionally wrapped in a
 *    ZIP on download. The transfer still goes through - this is a file
 *    transfer service and people legitimately send installers - but the
 *    recipient has to unpack deliberately.
 *
 * Preview and download are judged separately on purpose: reading a script as
 * text, or rendering a document to a picture, is harmless; receiving it as a
 * runnable file is not.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'com', 'scr',
  'pif', 'cpl', 'dll', 'ocx', 'sys', 'drv', 'msp', 'mst', 'msc',
  'bat', 'cmd', 'ps1', 'psm1', 'ps1xml', 'psc1', 'vbs', 'vbe',
  'js', 'jse', 'wsf', 'wsh', 'wsc', 'hta', 'reg', 'scf', 'lnk', 'url',
  'inf', 'chm', 'jar', 'jnlp',
  'sh', 'bash', 'zsh', 'csh', 'ksh', 'run', 'app', 'command',
  'dmg', 'pkg', 'deb', 'rpm', 'appimage',
  'apk', 'ipa', 'xapk', 'aab',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm',
  'sldm', 'xll', 'xlb',
  'py', 'pyw', 'pyc', 'pl', 'php', 'rb', 'jsp', 'asp', 'aspx',
]);

export type PreviewKind =
  | 'image'
  | 'svg'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'font'
  /** Raster the browser cannot decode itself (TIFF, PSD, HEIC, camera RAW…). */
  | 'image-render'
  /** Video in a container/codec the browser will not play; remuxed server-side. */
  | 'video-render'
  /** 3D model, rendered in-page by a WebGL viewer. */
  | 'model3d'
  /** Office document, rendered to PDF server-side. */
  | 'document'
  /** Compressed archive; only its structure is shown, never its contents. */
  | 'archive'
  /** Medical imaging (DICOM, NIfTI…), rendered in-page by a WebGL viewer. */
  | 'medical';

/* ------------------------------------------------ web-native media tables */

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg',
  png: 'image/png', apng: 'image/apng', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', cur: 'image/x-icon',
};

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  ogv: 'video/ogg', mov: 'video/quicktime',
};

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
  weba: 'audio/webm', mid: 'audio/midi', midi: 'audio/midi',
};

const FONT_MIME: Record<string, string> = {
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'rst', 'log', 'csv', 'tsv',
  'json', 'jsonc', 'json5', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'properties',
  'xml', 'plist', 'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'rb', 'php', 'pl', 'lua', 'r', 'sh', 'bash', 'zsh', 'fish',
  'sql', 'graphql', 'gql', 'proto',
  'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'java', 'kt', 'go', 'rs', 'swift', 'm', 'mm',
  'bat', 'cmd', 'ps1', 'srt', 'vtt', 'ass', 'sub', 'diff', 'patch', 'env', 'gitignore',
]);

/* ---------------------------------------------- server-rendered / viewer */

/** Raster formats ImageMagick can flatten to a PNG the browser will show. */
const RENDER_IMAGE_EXTENSIONS = new Set([
  'tif', 'tiff', 'psd', 'psb', 'heic', 'heif', 'jp2', 'j2k', 'jpf', 'jpx',
  'jxl', 'exr', 'hdr', 'tga', 'pcx', 'xcf', 'ppm', 'pgm', 'pbm', 'pnm',
  'dds', 'dib', 'sgi', 'pict', 'pct', 'xpm', 'wbmp', 'fits', 'fit',
  // Camera RAW (needs the dcraw/libraw delegate)
  'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2',
  'raf', 'srw', 'pef', 'x3f', 'raw', 'rwl', 'iiq', '3fr', 'mef', 'mos', 'kdc', 'dcr',
]);

/** Containers the browser will not play but ffmpeg can remux/transcode. */
const RENDER_VIDEO_EXTENSIONS = new Set([
  'mkv', 'avi', 'wmv', 'flv', 'f4v', 'mpeg', 'mpg', 'mpe', 'm2v', 'mts', 'm2ts',
  'ts', 'vob', 'asf', 'rm', 'rmvb', '3gp', '3g2', 'divx', 'mxf', 'ogm', 'dv',
]);

/** 3D model formats Online3DViewer can load. */
const MODEL3D_EXTENSIONS = new Set([
  'gltf', 'glb', 'obj', 'stl', 'ply', 'off', '3ds', 'fbx', 'dae', 'wrl', 'vrml',
  '3mf', 'amf', 'brep', 'step', 'stp', 'iges', 'igs', 'ifc', 'fcstd', 'bim', '3dm',
]);

/** Office documents LibreOffice can convert to PDF for preview. */
const DOCUMENT_EXTENSIONS = new Set([
  'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'odt', 'ott', 'fodt', 'rtf',
  'wpd', 'wps', 'abw', 'sxw', 'uot', 'hwp', 'lwp',
  'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'otp', 'fodp', 'sxi', 'key',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ots', 'fods', 'sxc', 'dif', 'dbf', 'numbers',
  'pub', 'vsd', 'vsdx', 'vst', 'cdr', 'pages', 'epub', 'fb2', 'cwk',
]);

/** Archives whose structure can be listed (never their contents previewed). */
const ARCHIVE_EXTENSIONS = new Set([
  'zip', 'zipx', 'jar', 'war', 'ear', 'apk', 'xpi', 'crx', 'whl', 'egg',
  'tar', 'gz', 'tgz', 'bz2', 'tbz', 'tbz2', 'xz', 'txz', 'lz', 'lzma', 'zst', 'tzst',
  '7z', 'rar', 'cab', 'arj', 'lzh', 'lha', 'iso', 'cpio', 'ar', 'deb', 'rpm',
]);

/** Medical imaging formats the in-page volume viewer can read. */
const MEDICAL_EXTENSIONS = new Set([
  'dcm', 'dicom', 'dic', 'ima', 'nii', 'mgh', 'mgz', 'mha', 'mhd', 'nrrd',
  'nhdr', 'hdr', 'img', 'gipl', 'vtk', 'v', 'nifti',
]);

/** Compound extensions that a plain last-dot split would misread. */
const COMPOUND: Record<string, PreviewKind> = {
  'nii.gz': 'medical',
  'tar.gz': 'archive',
  'tar.bz2': 'archive',
  'tar.xz': 'archive',
  'tar.zst': 'archive',
  'tar.lz': 'archive',
};

export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Last two dotted segments, lowercased ("archive.tar.gz" -> "tar.gz"). */
function compoundExtensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
  const parts = base.split('.');
  return parts.length >= 3 ? parts.slice(-2).join('.') : '';
}

/** True when a raw download of this file would be directly runnable. */
export function isDangerousFile(relPath: string): boolean {
  return EXECUTABLE_EXTENSIONS.has(extensionOf(relPath));
}

/** How this file may be shown inline, or null when it may not be shown at all. */
export function previewKind(relPath: string): PreviewKind | null {
  const compound = compoundExtensionOf(relPath);
  if (compound && COMPOUND[compound]) return COMPOUND[compound];

  const ext = extensionOf(relPath);

  if (IMAGE_MIME[ext]) return 'image';
  if (ext === 'svg' || ext === 'svgz') return 'svg';
  if (VIDEO_MIME[ext]) return 'video';
  if (AUDIO_MIME[ext]) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (FONT_MIME[ext]) return 'font';
  if (MEDICAL_EXTENSIONS.has(ext)) return 'medical';
  if (MODEL3D_EXTENSIONS.has(ext)) return 'model3d';
  if (RENDER_IMAGE_EXTENSIONS.has(ext)) return 'image-render';
  if (RENDER_VIDEO_EXTENSIONS.has(ext)) return 'video-render';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';

  return null;
}

/** Kinds whose bytes are fetched and parsed by an in-page viewer. */
export function isViewerKind(kind: PreviewKind | null): boolean {
  return kind === 'model3d' || kind === 'medical';
}

/** Kinds produced by a server-side conversion rather than served raw. */
export function isRenderedKind(kind: PreviewKind | null): boolean {
  return kind === 'image-render' || kind === 'video-render' || kind === 'document';
}

/** Whether an image or video file can plausibly be a 360 panorama by extension. */
export function canBe360(kind: PreviewKind | null): boolean {
  return kind === 'image' || kind === 'video' || kind === 'image-render' || kind === 'video-render';
}

/**
 * Content-Type when a file is served inline for a viewer or the browser to
 * render directly. Viewer kinds get octet-stream - their bytes are parsed by
 * in-page JavaScript, not rendered by the browser.
 */
export function previewMime(relPath: string): string | null {
  const kind = previewKind(relPath);
  if (!kind) return null;

  const ext = extensionOf(relPath);
  switch (kind) {
    case 'image':
      return IMAGE_MIME[ext];
    case 'svg':
      return 'image/svg+xml';
    case 'video':
      return VIDEO_MIME[ext];
    case 'audio':
      return AUDIO_MIME[ext];
    case 'pdf':
      return 'application/pdf';
    case 'font':
      return FONT_MIME[ext];
    case 'text':
      return 'text/plain; charset=utf-8';
    case 'model3d':
    case 'medical':
      return 'application/octet-stream';
    default:
      // image-render, video-render, document and archive are not served by
      // /preview - they go through /render or /archive.
      return null;
  }
}

/**
 * Content-Security-Policy for an inline preview. PDF relies on the browser's
 * own viewer sandbox; everything else, SVG in particular, gets a policy that
 * forbids scripts and outbound requests even if opened as a top level page.
 */
export function previewCsp(relPath: string): string | null {
  const kind = previewKind(relPath);
  if (!kind || kind === 'pdf') return null;
  return "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
}

export function safeDownloadMime(relPath: string): string {
  if (isDangerousFile(relPath)) return 'application/octet-stream';

  const ext = extensionOf(relPath);
  return IMAGE_MIME[ext] || VIDEO_MIME[ext] || AUDIO_MIME[ext] ||
    (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');
}

/** RFC 5987 Content-Disposition that survives Polish characters, quotes, etc. */
export function contentDisposition(filename: string, inline = false): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
