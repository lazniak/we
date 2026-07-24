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
 *    recipient has to unpack deliberately, which is exactly the friction that
 *    stops a drive-by "downloaded and ready to run" file.
 *
 * Preview and download are judged separately on purpose: reading a script as
 * text is harmless, receiving it as a runnable file is not.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  // Windows executables and installers
  'exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'com', 'scr',
  'pif', 'cpl', 'dll', 'ocx', 'sys', 'drv', 'msp', 'mst', 'msc',
  // Windows scripting hosts
  'bat', 'cmd', 'ps1', 'psm1', 'ps1xml', 'psc1', 'vbs', 'vbe',
  'js', 'jse', 'wsf', 'wsh', 'wsc', 'hta', 'reg', 'scf', 'lnk', 'url',
  'inf', 'chm', 'jar', 'jnlp',
  // Unix / macOS
  'sh', 'bash', 'zsh', 'csh', 'ksh', 'run', 'app', 'command',
  'dmg', 'pkg', 'deb', 'rpm', 'appimage',
  // Mobile packages
  'apk', 'ipa', 'xapk', 'aab',
  // Macro capable office documents
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm',
  'sldm', 'xll', 'xlb',
  // Interpreted scripts that are commonly file-associated
  'py', 'pyw', 'pyc', 'pl', 'php', 'rb', 'jsp', 'asp', 'aspx',
]);

export type PreviewKind = 'image' | 'svg' | 'video' | 'audio' | 'pdf' | 'text' | 'font';

/** Raster images the browser decodes as data. */
const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
  png: 'image/png', apng: 'image/apng', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
  heic: 'image/heic', heif: 'image/heif',
};

/** Containers browsers actually play. Others would just show a broken box. */
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  ogv: 'video/ogg', mov: 'video/quicktime',
};

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
  weba: 'audio/webm',
};

const FONT_MIME: Record<string, string> = {
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

/**
 * Everything shown as source. Served as text/plain, never as its own type,
 * so markup and scripts are read rather than executed - which is what makes
 * previewing an .html or .js file safe.
 */
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

export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** True when a raw download of this file would be directly runnable. */
export function isDangerousFile(relPath: string): boolean {
  return EXECUTABLE_EXTENSIONS.has(extensionOf(relPath));
}

/** How this file may be shown inline, or null when it may not be shown at all. */
export function previewKind(relPath: string): PreviewKind | null {
  const ext = extensionOf(relPath);

  if (IMAGE_MIME[ext]) return 'image';
  // SVG is a document format, so it gets its own kind and a hardened policy.
  if (ext === 'svg' || ext === 'svgz') return 'svg';
  if (VIDEO_MIME[ext]) return 'video';
  if (AUDIO_MIME[ext]) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (FONT_MIME[ext]) return 'font';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';

  return null;
}

/** Content-Type for an inline preview, or null when preview is not allowed. */
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
      // The whole point: source is read, not run.
      return 'text/plain; charset=utf-8';
  }
}

/**
 * Content-Security-Policy for an inline preview.
 *
 * PDF is the exception - the built-in viewer is a document and a bare sandbox
 * stops it from rendering - so it relies on the browser's own PDF sandbox
 * instead. Everything else, SVG in particular, gets a policy that forbids
 * scripts and any outbound request even if it is opened as a top level page.
 */
export function previewCsp(relPath: string): string | null {
  const kind = previewKind(relPath);
  if (!kind || kind === 'pdf') return null;
  return "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
}

/**
 * The Content-Type used when a payload is downloaded rather than previewed.
 * Client supplied MIME types are never trusted; anything that is not a known
 * inert media type collapses to application/octet-stream.
 */
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
