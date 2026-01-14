import JSZip from 'jszip';

export interface ZipProgress {
  percent: number;
  currentFile: string;
}

export async function zipFiles(
  files: File[],
  onProgress?: (progress: ZipProgress) => void
): Promise<Blob> {
  const zip = new JSZip();
  
  // Add files to zip
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    zip.file(file.name, file);
    
    if (onProgress) {
      onProgress({
        percent: Math.round(((i + 1) / files.length) * 50), // First 50% is adding files
        currentFile: file.name,
      });
    }
  }
  
  // Generate zip with compression
  return await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress({
          percent: 50 + Math.round(metadata.percent / 2), // Last 50% is compression
          currentFile: metadata.currentFile || 'Compressing...',
        });
      }
    }
  );
}

export function generateZipFilename(files: File[]): string {
  if (files.length === 1) {
    const name = files[0].name;
    const lastDot = name.lastIndexOf('.');
    return lastDot > 0 ? name.substring(0, lastDot) : name;
  }
  
  return `transfer_${new Date().toISOString().slice(0, 10)}`;
}
