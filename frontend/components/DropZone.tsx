'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, File, X, Plus, Folder, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes } from '@/lib/format';

interface DropZoneProps {
  onFilesSelected: (files: File[], expirationDays: number) => void;
  disabled?: boolean;
}

interface FileWithPath {
  file: File;
  path: string;
}

export default function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [expirationDays, setExpirationDays] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  // Process directory entry recursively
  const processDirectoryEntry = useCallback(async (
    entry: FileSystemDirectoryEntry,
    basePath: string = '',
    allFiles: FileWithPath[] = []
  ): Promise<FileWithPath[]> => {
    return new Promise((resolve, reject) => {
      const reader = entry.createReader();
      const entries: (FileSystemFileEntry | FileSystemDirectoryEntry)[] = [];
      
      const readEntries = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            // All entries read, process them
            Promise.all(
              entries.map(async (entry) => {
                if (entry.isFile) {
                  const fileEntry = entry as FileSystemFileEntry;
                  return new Promise<void>((fileResolve, fileReject) => {
                    fileEntry.file((file) => {
                      const path = basePath ? `${basePath}/${file.name}` : file.name;
                      allFiles.push({ file, path });
                      fileResolve();
                    }, fileReject);
                  });
                } else if (entry.isDirectory) {
                  const dirEntry = entry as FileSystemDirectoryEntry;
                  const newPath = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;
                  return processDirectoryEntry(dirEntry, newPath, allFiles);
                }
              })
            ).then(() => resolve(allFiles)).catch(reject);
          } else {
            entries.push(...batch);
            readEntries();
          }
        }, reject);
      };
      
      readEntries();
    });
  }, []);

  // Calculate total size of files
  const calculateTotalSize = useCallback((files: FileWithPath[]): number => {
    return files.reduce((acc, { file }) => acc + file.size, 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isProcessing) {
      setIsDragging(true);
    }
  }, [disabled, isProcessing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);
    
    if (disabled || isProcessing) return;
    
    setIsProcessing(true);
    const maxSize = 5 * 1024 * 1024 * 1024; // 5GB
    const allFiles: FileWithPath[] = [];
    
    try {
      // Process DataTransfer items
      const items = Array.from(e.dataTransfer.items);
      
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          
          if (entry) {
            if (entry.isFile) {
              const fileEntry = entry as FileSystemFileEntry;
              await new Promise<void>((resolve, reject) => {
                fileEntry.file((file) => {
                  allFiles.push({ file, path: file.name });
                  resolve();
                }, reject);
              });
            } else if (entry.isDirectory) {
              const dirEntry = entry as FileSystemDirectoryEntry;
              const folderFiles = await processDirectoryEntry(dirEntry, dirEntry.name);
              allFiles.push(...folderFiles);
            }
          } else {
            // Fallback for browsers that don't support webkitGetAsEntry
            const file = item.getAsFile();
            if (file) {
              allFiles.push({ file, path: file.name });
            }
          }
        }
      }
      
      // Check total size
      const totalSize = calculateTotalSize(allFiles);
      if (totalSize > maxSize) {
        setError(`Total size (${formatBytes(totalSize)}) exceeds 5GB limit`);
        setIsProcessing(false);
        return;
      }
      
      setSelectedFiles(prev => [...prev, ...allFiles]);
    } catch (err) {
      console.error('Error processing drop:', err);
      setError('Failed to process files. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [disabled, isProcessing, processDirectoryEntry, calculateTotalSize]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      const filesWithPath: FileWithPath[] = files.map(file => ({ file, path: file.name }));
      setSelectedFiles(prev => [...prev, ...filesWithPath]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDirectoryInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      // For directory input, we need to preserve the relative path
      // This is a simplified version - full implementation would need webkitdirectory
      const filesWithPath: FileWithPath[] = files.map(file => {
        const path = (file as any).webkitRelativePath || file.name;
        return { file, path };
      });
      
      const totalSize = calculateTotalSize(filesWithPath);
      const maxSize = 5 * 1024 * 1024 * 1024;
      if (totalSize > maxSize) {
        setError(`Total size (${formatBytes(totalSize)}) exceeds 5GB limit`);
        return;
      }
      
      setSelectedFiles(prev => [...prev, ...filesWithPath]);
    }
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  }, [calculateTotalSize]);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      const files = selectedFiles.map(f => f.file);
      onFilesSelected(files, expirationDays);
    }
  };

  const totalSize = calculateTotalSize(selectedFiles);
  const maxSize = 5 * 1024 * 1024 * 1024;
  const isOverSize = totalSize > maxSize;

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {/* Expiration Days Slider */}
      <div className="glass-strong rounded-2xl p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-white/80">
            Link expires in
          </label>
          <span className="text-sm font-semibold text-accent-light">
            {expirationDays} {expirationDays === 1 ? 'day' : 'days'}
          </span>
        </div>
        <input
          type="range"
          min="3"
          max="7"
          value={expirationDays}
          onChange={(e) => setExpirationDays(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-accent slider-glossy"
        />
        <div className="flex justify-between text-xs text-white/30 mt-2">
          <span>3 days</span>
          <span>7 days</span>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !isProcessing && fileInputRef.current?.click()}
        className={clsx(
          'drop-zone glass-strong rounded-3xl p-16 cursor-pointer transition-all duration-300',
          isDragging && 'active',
          disabled && 'opacity-50 cursor-not-allowed',
          isProcessing && 'opacity-75 cursor-wait'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled || isProcessing}
        />
        <input
          ref={directoryInputRef}
          type="file"
          {...({ webkitdirectory: '' } as any)}
          multiple
          onChange={handleDirectoryInput}
          className="hidden"
          disabled={disabled || isProcessing}
        />
        
        <div className="flex flex-col items-center gap-6 text-center">
          <div className={clsx(
            'w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-300 relative',
            isDragging 
              ? 'bg-accent/20 scale-110 glow' 
              : 'bg-white/5'
          )}>
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
            <Upload className={clsx(
              'w-8 h-8 transition-colors relative z-10',
              isDragging ? 'text-accent-light' : 'text-white/40'
            )} />
          </div>
          
          <div>
            <p className="text-lg font-medium text-white/90 mb-2">
              {isProcessing ? 'Processing...' : isDragging ? 'Drop files or folders here' : 'Drop files or folders here'}
            </p>
            <p className="text-sm text-white/40">
              or <span className="text-accent-light font-medium">browse</span> from your device
            </p>
            <p className="text-xs text-white/20 mt-3">
              Up to 5GB per transfer · Folders supported
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="glass-strong rounded-2xl p-4 border border-red-500/20 bg-red-500/5 animate-fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="glass-strong rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-wider font-medium">
                {selectedFiles.length} {selectedFiles.length === 1 ? 'item' : 'items'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add files
                </button>
                <button
                  onClick={() => directoryInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Add folder
                </button>
              </div>
            </div>
            
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {selectedFiles.map((item, index) => {
                const isFolder = item.path.includes('/');
                return (
                  <div
                    key={`${item.path}-${index}`}
                    className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl group hover:bg-white/[0.06] transition-all"
                  >
                    {isFolder ? (
                      <Folder className="w-4 h-4 text-accent/60 flex-shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-white/30 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate font-medium">{item.path}</p>
                      <p className="text-xs text-white/30">{formatBytes(item.file.size)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded-lg transition-all"
                    >
                      <X className="w-3.5 h-3.5 text-white/40" />
                    </button>
                  </div>
                );
              })}
            </div>
            
            {/* Total size and upload button */}
            <div className="mt-5 pt-4 border-t border-white/8">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-white/30">Total: </span>
                  <span className={clsx(
                    'text-sm font-semibold',
                    isOverSize ? 'text-red-400' : 'text-white/80'
                  )}>
                    {formatBytes(totalSize)}
                  </span>
                  {isOverSize && (
                    <p className="text-xs text-red-400 mt-1">Exceeds 5GB limit</p>
                  )}
                </div>
                
                <button
                  onClick={handleUpload}
                  disabled={disabled || isOverSize || isProcessing}
                  className="btn-primary px-8 py-3 rounded-xl font-medium text-sm shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
