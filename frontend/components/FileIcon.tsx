'use client';

import React from 'react';

interface FileIconProps {
  filename: string;
  mimeType?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Get file extension from filename
function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

// Map extensions to icon types
const extensionToType: Record<string, string> = {
  // Images
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', 
  svg: 'image', bmp: 'image', ico: 'image', tiff: 'image', tif: 'image',
  
  // Videos
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video',
  flv: 'video', webm: 'video', m4v: 'video', '3gp': 'video',
  
  // Audio
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio',
  wma: 'audio', m4a: 'audio', opus: 'audio', aiff: 'audio',
  
  // Documents
  pdf: 'pdf',
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word',
  xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint',
  txt: 'text', md: 'text', log: 'text',
  
  // Code
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  html: 'code', css: 'code', scss: 'code', less: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code',
  cs: 'code', go: 'code', rs: 'code', rb: 'code', php: 'code',
  swift: 'code', kt: 'code', sql: 'code', sh: 'code', bash: 'code',
  json: 'code', xml: 'code', yaml: 'code', yml: 'code', toml: 'code',
  
  // Archives
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
  gz: 'archive', bz2: 'archive', xz: 'archive', tgz: 'archive',
  
  // Fonts
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
  
  // 3D/Design
  psd: 'design', ai: 'design', sketch: 'design', fig: 'design', xd: 'design',
  blend: '3d', obj: '3d', fbx: '3d', stl: '3d', gltf: '3d', glb: '3d',
  
  // Executables
  exe: 'executable', msi: 'executable', dmg: 'executable', app: 'executable',
  deb: 'executable', rpm: 'executable', apk: 'executable',
  
  // Data
  db: 'database', sqlite: 'database', mdb: 'database',
};

// Get icon type from filename or mime type
function getIconType(filename: string, mimeType?: string): string {
  const ext = getExtension(filename);
  
  if (extensionToType[ext]) {
    return extensionToType[ext];
  }
  
  // Fallback to mime type
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return 'archive';
  }
  
  return 'file';
}

// SVG icons for each type
const icons: Record<string, (color: string) => React.ReactNode> = {
  image: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  
  video: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <polygon points="10 9 15 12 10 15 10 9" fill={color}/>
    </svg>
  ),
  
  audio: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  ),
  
  pdf: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M9 13h2v4H9z" fill={color}/>
      <path d="M13 13h2v4h-2z" fill={color}/>
    </svg>
  ),
  
  word: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="14" y2="17"/>
    </svg>
  ),
  
  excel: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <rect x="8" y="12" width="8" height="6" rx="1"/>
      <line x1="12" y1="12" x2="12" y2="18"/>
      <line x1="8" y1="15" x2="16" y2="15"/>
    </svg>
  ),
  
  powerpoint: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <rect x="8" y="12" width="8" height="5" rx="1"/>
    </svg>
  ),
  
  text: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  ),
  
  code: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <polyline points="8 16 6 14 8 12"/>
      <polyline points="16 16 18 14 16 12"/>
      <line x1="11" y1="17" x2="13" y2="11"/>
    </svg>
  ),
  
  archive: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8"/>
      <rect x="1" y="3" width="22" height="5"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
  ),
  
  font: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7"/>
      <line x1="9" y1="20" x2="15" y2="20"/>
      <line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
  ),
  
  design: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="4"/>
      <line x1="21.17" y1="8" x2="12" y2="8"/>
      <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
      <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
    </svg>
  ),
  
  '3d': (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  
  executable: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <path d="M7 8l3 3-3 3"/>
      <line x1="12" y1="14" x2="17" y2="14"/>
    </svg>
  ),
  
  database: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  
  file: (color) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
};

// Colors for each type
const typeColors: Record<string, string> = {
  image: '#10b981',      // emerald
  video: '#f59e0b',      // amber
  audio: '#8b5cf6',      // violet
  pdf: '#ef4444',        // red
  word: '#3b82f6',       // blue
  excel: '#22c55e',      // green
  powerpoint: '#f97316', // orange
  text: '#6b7280',       // gray
  code: '#06b6d4',       // cyan
  archive: '#eab308',    // yellow
  font: '#ec4899',       // pink
  design: '#a855f7',     // purple
  '3d': '#14b8a6',       // teal
  executable: '#64748b', // slate
  database: '#0ea5e9',   // sky
  file: '#9ca3af',       // gray
};

export function FileIcon({ filename, mimeType, size = 'md', className = '' }: FileIconProps) {
  const type = getIconType(filename, mimeType);
  const color = typeColors[type] || typeColors.file;
  const ext = getExtension(filename).toUpperCase();
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  const extSizes = {
    sm: 'text-[6px]',
    md: 'text-[8px]',
    lg: 'text-[10px]',
  };
  
  return (
    <div className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      {icons[type]?.(color) || icons.file(color)}
      {/* Show extension badge for unknown/generic types */}
      {(type === 'file' && ext) && (
        <div 
          className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-white font-bold ${extSizes[size]}`}
          style={{ backgroundColor: color }}
        >
          {ext.slice(0, 4)}
        </div>
      )}
    </div>
  );
}

// Export helper to check if file is an image
export function isImageFile(filename: string, mimeType?: string): boolean {
  const ext = getExtension(filename);
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'];
  return imageExts.includes(ext) || (mimeType?.startsWith('image/') || false);
}

// Export helper to check if file is a video
export function isVideoFile(filename: string, mimeType?: string): boolean {
  const ext = getExtension(filename);
  const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp'];
  return videoExts.includes(ext) || (mimeType?.startsWith('video/') || false);
}

export default FileIcon;
