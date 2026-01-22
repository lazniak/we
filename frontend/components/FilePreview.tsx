'use client';

import React, { useState, useEffect } from 'react';
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const isImage = isImageFile(file.filename, file.mimeType);
  
  // Load image preview for image files
  useEffect(() => {
    if (isImage) {
      setIsLoading(true);
      // Use the download endpoint with fileId to get the image
      const url = `/api/transfer/${transferId}/download?fileId=${file.id}`;
      setImageUrl(url);
      setIsLoading(false);
    }
  }, [isImage, transferId, file.id]);

  return (
    <div 
      className="group relative flex items-center gap-4 p-4 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      onClick={() => onDownload(file.id)}
      style={{
        background: isImage && imageUrl
          ? `linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.7) 100%)`
          : 'rgba(255,255,255,0.03)',
      }}
    >
      {/* Background image for image files */}
      {isImage && imageUrl && (
        <div 
          className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity"
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(8px)',
          }}
        />
      )}
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10 flex items-center gap-4 flex-1 min-w-0">
        {/* File icon or image thumbnail */}
        <div className="flex-shrink-0">
          {isImage && imageUrl ? (
            <div 
              className="w-12 h-12 rounded-lg bg-cover bg-center border border-white/10"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          ) : (
            <FileIcon filename={file.filename} mimeType={file.mimeType} size="md" />
          )}
        </div>
        
        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 truncate">
            {file.filename}
          </p>
          <p className="text-xs text-white/40">
            {formatBytes(file.size)}
          </p>
        </div>
        
        {/* Download button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file.id);
          }}
          className="relative z-10 flex-shrink-0 p-2.5 rounded-lg bg-white/10 hover:bg-accent/20 transition-all group-hover:bg-accent/30"
        >
          <Download className="w-4 h-4 text-white/70 group-hover:text-accent-light transition-colors" />
        </button>
      </div>
    </div>
  );
}

export default FilePreview;
