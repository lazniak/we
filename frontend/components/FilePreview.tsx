'use client';

import React from 'react';
import { Download } from 'lucide-react';
import { FileIcon, isImageFile } from './FileIcon';
import { formatBytes } from '@/lib/format';

interface FilePreviewProps {
  file: {
    id: number;
    filename: string;
    size: number;
    mimeType?: string;
  };
  transferId: string;
  onDownload: (fileId: number) => void;
}

export function FilePreview({ file, transferId, onDownload }: FilePreviewProps) {
  const isImage = isImageFile(file.filename, file.mimeType);
  const imageUrl = isImage ? `/api/transfer/${transferId}/download?fileId=${file.id}` : null;

  return (
    <div 
      className="group flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-colors duration-200 cursor-pointer"
      onClick={() => onDownload(file.id)}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-white/[0.03]">
        {isImage && imageUrl ? (
          <img 
            src={imageUrl} 
            alt={file.filename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileIcon filename={file.filename} mimeType={file.mimeType} size="sm" />
          </div>
        )}
      </div>
      
      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate font-medium">
          {file.filename}
        </p>
        <p className="text-xs text-white/30">
          {formatBytes(file.size)}
        </p>
      </div>
      
      {/* Download button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDownload(file.id);
        }}
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-accent-light hover:bg-accent/10 transition-colors"
        aria-label={`Download ${file.filename}`}
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

export default FilePreview;
