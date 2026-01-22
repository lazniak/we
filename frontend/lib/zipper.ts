import JSZip from 'jszip';

export interface ZipProgress {
  percent: number;
  currentFile: string;
}

export interface FileEntry {
  file: File;
  path: string; // Relative path in zip (for folder structure)
}

// Helper to process directory entries recursively
async function processDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  zip: JSZip,
  basePath: string = '',
  onProgress?: (progress: ZipProgress) => void,
  totalFiles: { count: number } = { count: 0 },
  processedFiles: { count: number } = { count: 0 }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    const entries: FileSystemEntry[] = [];
    
    const readEntries = () => {
      reader.readEntries((batch: FileSystemEntry[]) => {
        if (batch.length === 0) {
          // All entries read, process them
          Promise.all(
            entries.map(async (entry) => {
              if (entry.isFile) {
                const fileEntry = entry as FileSystemFileEntry;
                return new Promise<void>((fileResolve, fileReject) => {
                  fileEntry.file((file) => {
                    const zipPath = basePath ? `${basePath}/${file.name}` : file.name;
                    zip.file(zipPath, file);
                    totalFiles.count++;
                    processedFiles.count++;
                    
                    if (onProgress) {
                      onProgress({
                        percent: Math.round((processedFiles.count / Math.max(totalFiles.count, 1)) * 50),
                        currentFile: zipPath,
                      });
                    }
                    fileResolve();
                  }, fileReject);
                });
              } else if (entry.isDirectory) {
                const dirEntry = entry as FileSystemDirectoryEntry;
                const newPath = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;
                return processDirectoryEntry(dirEntry, zip, newPath, onProgress, totalFiles, processedFiles);
              }
              return Promise.resolve();
            })
          ).then(() => resolve()).catch(reject);
        } else {
          entries.push(...batch);
          readEntries();
        }
      }, reject);
    };
    
    readEntries();
  });
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

// New function to zip files with folder structure support
export async function zipFilesWithFolders(
  entries: FileEntry[],
  onProgress?: (progress: ZipProgress) => void
): Promise<Blob> {
  const zip = new JSZip();
  const totalFiles = { count: entries.length };
  const processedFiles = { count: 0 };
  
  // Add files to zip with their paths
  for (let i = 0; i < entries.length; i++) {
    const { file, path } = entries[i];
    zip.file(path, file);
    processedFiles.count++;
    
    if (onProgress) {
      onProgress({
        percent: Math.round((processedFiles.count / totalFiles.count) * 50),
        currentFile: path,
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
          percent: 50 + Math.round(metadata.percent / 2),
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
