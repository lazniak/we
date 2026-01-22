'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, File, X, Plus, Folder, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes } from '@/lib/format';

export interface FilesMetadata {
  files: File[];
  paths: string[];
  expirationDays: number;
  hasFolder: boolean;  // true if any folder was dropped
  fileCount: number;   // number of individual files
}

interface DropZoneProps {
  onFilesSelected: (metadata: FilesMetadata) => void;
  disabled?: boolean;
}

interface FileWithPath {
  file: File;
  path: string;
  fromFolder: boolean;
}

export default function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [expirationDays, setExpirationDays] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('we-expiration-days');
      return saved ? parseInt(saved, 10) : 3;
    }
    return 3;
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

  // Save expiration days preference
  const handleExpirationChange = (days: number) => {
    setExpirationDays(days);
    if (typeof window !== 'undefined') {
      localStorage.setItem('we-expiration-days', days.toString());
    }
  };

  // Process directory entry recursively
  const processDirectoryEntry = useCallback(async (
    entry: FileSystemDirectoryEntry,
    basePath: string = '',
    allFiles: FileWithPath[] = []
  ): Promise<FileWithPath[]> => {
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
                      const path = basePath ? `${basePath}/${file.name}` : file.name;
                      allFiles.push({ file, path, fromFolder: true });
                      fileResolve();
                    }, fileReject);
                  });
                } else if (entry.isDirectory) {
                  const dirEntry = entry as FileSystemDirectoryEntry;
                  const newPath = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;
                  return processDirectoryEntry(dirEntry, newPath, allFiles);
                }
                return Promise.resolve();
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

  // Validate and add files
  const addFilesWithValidation = useCallback((newFiles: FileWithPath[]) => {
    if (newFiles.length === 0) return;

    setSelectedFiles(prev => {
      const combined = [...prev, ...newFiles];
      const totalSize = combined.reduce((acc, { file }) => acc + file.size, 0);
      
      if (totalSize > MAX_SIZE) {
        setError(`Total size (${formatBytes(totalSize)}) exceeds 5GB limit`);
        return prev; // Don't add new files
      }
      
      setError(null);
      return combined;
    });
  }, [MAX_SIZE]);

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
    // Only set dragging to false if we're leaving the drop zone entirely
    const rect = dropZoneRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDragging(false);
      }
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setError(null);
    
    if (disabled || isProcessing) return;
    
    setIsProcessing(true);
    const allFiles: FileWithPath[] = [];
    
    try {
      // First, try to use DataTransferItemList (supports folders)
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        const items = Array.from(e.dataTransfer.items);
        
        // Process all items
        const processPromises = items.map(async (item) => {
          if (item.kind !== 'file') return;
          
          const entry = item.webkitGetAsEntry?.();
          
          if (entry) {
            if (entry.isFile) {
              const fileEntry = entry as FileSystemFileEntry;
              return new Promise<void>((resolve, reject) => {
                fileEntry.file((file) => {
                  allFiles.push({ file, path: file.name, fromFolder: false });
                  resolve();
                }, reject);
              });
            } else if (entry.isDirectory) {
              const dirEntry = entry as FileSystemDirectoryEntry;
              const folderFiles = await processDirectoryEntry(dirEntry, dirEntry.name);
              // Mark all files from folder
              folderFiles.forEach(f => f.fromFolder = true);
              allFiles.push(...folderFiles);
            }
          } else {
            // Fallback: webkitGetAsEntry not supported
            const file = item.getAsFile();
            if (file) {
              allFiles.push({ file, path: file.name, fromFolder: false });
            }
          }
        });
        
        await Promise.all(processPromises);
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // Fallback: Use FileList (doesn't support folders)
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => {
          allFiles.push({ file, path: file.name, fromFolder: false });
        });
      }
      
      if (allFiles.length === 0) {
        setError('No files detected. Please try again.');
        setIsProcessing(false);
        return;
      }
      
      addFilesWithValidation(allFiles);
    } catch (err) {
      console.error('Error processing drop:', err);
      setError('Failed to process files. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [disabled, isProcessing, processDirectoryEntry, addFilesWithValidation]);

  // Handle file input (browse files)
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      const filesWithPath: FileWithPath[] = files.map(file => ({ file, path: file.name, fromFolder: false }));
      addFilesWithValidation(filesWithPath);
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addFilesWithValidation]);

  // Handle directory input (browse folders)
  const handleDirectoryInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      // For directory input, preserve the relative path
      const filesWithPath: FileWithPath[] = files.map(file => {
        // webkitRelativePath contains the full path including folder name
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        return { file, path, fromFolder: true };
      });
      
      addFilesWithValidation(filesWithPath);
    }
    // Reset input
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  }, [addFilesWithValidation]);

  // Handle CTRL+V paste
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (disabled || isProcessing) return;
      
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      
      e.preventDefault();
      setIsProcessing(true);
      setError(null);
      
      const allFiles: FileWithPath[] = [];
      
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              // Generate a name for pasted images/files
              let fileName = file.name;
              if (!fileName || fileName === 'image.png') {
                const ext = file.type.split('/')[1] || 'png';
                fileName = `pasted-${Date.now()}.${ext}`;
              }
              allFiles.push({ file, path: fileName, fromFolder: false });
            }
          }
        }
        
        if (allFiles.length > 0) {
          addFilesWithValidation(allFiles);
        }
      } catch (err) {
        console.error('Error processing paste:', err);
        setError('Failed to paste files. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, isProcessing, addFilesWithValidation]);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setError(null);
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      const files = selectedFiles.map(f => f.file);
      const paths = selectedFiles.map(f => f.path);
      const hasFolder = selectedFiles.some(f => f.fromFolder);
      
      onFilesSelected({
        files,
        paths,
        expirationDays,
        hasFolder,
        fileCount: selectedFiles.length,
      });
    }
  };

  const totalSize = calculateTotalSize(selectedFiles);
  const isOverSize = totalSize > MAX_SIZE;

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 px-4">
      {/* Expiration Days Selector */}
      <div className="glass rounded-2xl p-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40 uppercase tracking-wider">expires</span>
          <div className="flex items-center gap-1 p-1 bg-white/[0.03] rounded-xl">
            {[3, 4, 5, 6, 7].map((day) => (
              <button
                key={day}
                onClick={() => !disabled && handleExpirationChange(day)}
                disabled={disabled}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  expirationDays === day
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/30 hover:text-white/50 hover:bg-white/[0.03]',
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {day}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
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
          {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
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
              Up to 5GB per transfer · Folders supported · Ctrl+V to paste
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
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add files
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    directoryInputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 text-xs text-accent-light hover:text-accent transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <Folder className="w-3.5 h-3.5" />
                  Add folder
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAllFiles();
                  }}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpload();
                  }}
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
