'use client';

import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export default function Logo({ size = 'md', showTagline = false }: LogoProps) {
  const sizeConfig = {
    sm: { text: 'text-xl', gap: 'gap-1', dot: 'w-1 h-1', tagline: 'text-[8px] mt-1.5' },
    md: { text: 'text-3xl', gap: 'gap-1.5', dot: 'w-1.5 h-1.5', tagline: 'text-[9px] mt-2' },
    lg: { text: 'text-5xl', gap: 'gap-2', dot: 'w-2 h-2', tagline: 'text-[10px] mt-3' },
  };
  
  const config = sizeConfig[size];

  return (
    <div className="relative inline-flex flex-col items-center group">
      {/* Subtle ambient glow */}
      <div className="absolute -inset-8 bg-accent/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      {/* Logo */}
      <div className={`relative flex items-center ${config.gap}`}>
        {/* "we" - bright */}
        <span className={`font-display font-semibold ${config.text} text-white tracking-tight`}>
          we
        </span>
        
        {/* Animated dot */}
        <span className={`${config.dot} rounded-full bg-accent relative`}>
          <span className={`absolute inset-0 ${config.dot} rounded-full bg-accent animate-ping opacity-40`} />
        </span>
        
        {/* "pablogfx" - medium */}
        <span className={`font-display font-light ${config.text} text-white/60 tracking-tight`}>
          pablogfx
        </span>
        
        {/* Static dot */}
        <span className={`${config.dot} rounded-full bg-white/20`} />
        
        {/* "com" - dim */}
        <span className={`font-display font-light ${config.text} text-white/30 tracking-tight`}>
          com
        </span>
      </div>
      
      {/* Tagline */}
      {showTagline && (
        <span className={`${config.tagline} font-body font-light uppercase tracking-[0.25em] text-white/20`}>
          instant file sharing
        </span>
      )}
    </div>
  );
}
