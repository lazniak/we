'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, File, X, Plus } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes } from '@/lib/format';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  }, [disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
  };

  const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
  const maxSize = 5 * 1024 * 1024 * 1024;
  const isOverSize = totalSize > maxSize;

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={clsx(
          'drop-zone glass rounded-3xl p-16 cursor-pointer transition-all duration-300',
          isDragging && 'active',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />
        
        <div className="flex flex-col items-center gap-6 text-center">
          <div className={clsx(
            'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300',
            isDragging 
              ? 'bg-accent/20 scale-110' 
              : 'bg-white/5'
          )}>
            <Upload className={clsx(
              'w-7 h-7 transition-colors',
              isDragging ? 'text-accent-light' : 'text-white/40'
            )} />
          </div>
          
          <div>
            <p className="text-lg font-medium text-white/90 mb-2">
              {isDragging ? 'Drop files here' : 'Drop files here'}
            </p>
            <p className="text-sm text-white/40">
              or <span className="text-accent-light">browse</span> from your device
            </p>
            <p className="text-xs text-white/20 mt-3">
              Up to 5GB per transfer
            </p>
          </div>
        </div>
      </div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40 uppercase tracking-wider">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-accent-light hover:text-accent transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add more
              </button>
            </div>
            
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl group"
                >
                  <File className="w-4 h-4 text-white/30 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{file.name}</p>
                    <p className="text-xs text-white/30">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/5 rounded-lg transition-all"
                  >
                    <X className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </div>
              ))}
            </div>
            
            {/* Total size and upload button */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-white/30">Total: </span>
                  <span className={clsx(
                    'text-sm font-medium',
                    isOverSize ? 'text-red-400' : 'text-white/70'
                  )}>
                    {formatBytes(totalSize)}
                  </span>
                </div>
                
                <button
                  onClick={handleUpload}
                  disabled={disabled || isOverSize}
                  className="btn-primary px-6 py-2.5 rounded-xl font-medium text-sm"
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
