/**
 * Uploads are protected on two independent levels.
 *
 * 1. Nothing is ever rendered by the browser unless its type is on the small
 *    inert allow-list below. Everything else goes out as an attachment with
 *    application/octet-stream and nosniff, so an uploaded .html or .svg can
 *    never execute in the site's own origin. That covers the whole long tail
 *    without getting in anyone's way.
 *
 * 2. Things that a double click would actually run are additionally wrapped in
 *    a ZIP on download. The transfer still goes through - this is a file
 *    transfer service and people legitimately send installers - but the
 *    recipient has to unpack it deliberately, which is exactly the friction
 *    that stops a drive-by "downloaded and ready to run" file.
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

/** MIME types we are willing to render inline in the preview pane. */
const PREVIEWABLE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'image/bmp', 'image/x-icon', 'image/tiff',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
  'audio/flac', 'audio/aac', 'audio/mp4',
  'application/pdf',
  'text/plain',
]);

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', opus: 'audio/ogg',
  pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/plain', log: 'text/plain', csv: 'text/plain',
  json: 'text/plain', yml: 'text/plain', yaml: 'text/plain', ini: 'text/plain',
};

export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** True when a raw download of this file would be directly runnable. */
export function isDangerousFile(relPath: string): boolean {
  return EXECUTABLE_EXTENSIONS.has(extensionOf(relPath));
}

/**
 * The Content-Type used when the payload is streamed to a browser.
 * Client supplied MIME types are never trusted; anything that is not a known
 * inert type collapses to application/octet-stream.
 */
export function safeDownloadMime(relPath: string): string {
  if (isDangerousFile(relPath)) return 'application/octet-stream';
  const mapped = EXTENSION_MIME[extensionOf(relPath)];
  return mapped && PREVIEWABLE_MIME.has(mapped) ? mapped : 'application/octet-stream';
}

/** Inline preview is only allowed for inert, well-known media types. */
export function previewMime(relPath: string): string | null {
  if (isDangerousFile(relPath)) return null;
  const mapped = EXTENSION_MIME[extensionOf(relPath)];
  return mapped && PREVIEWABLE_MIME.has(mapped) ? mapped : null;
}

/** RFC 5987 Content-Disposition that survives Polish characters, quotes, etc. */
export function contentDisposition(filename: string, inline = false): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
