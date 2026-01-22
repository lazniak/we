'use client';

import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export default function Logo({ size = 'md', showTagline = false }: LogoProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };
  
  const taglineSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  return (
    <div className="relative inline-flex flex-col items-center">
      {/* Main logo */}
      <div className="relative group">
        {/* Glow effect */}
        <div className="absolute inset-0 blur-2xl opacity-30 bg-gradient-to-r from-accent via-accent-light to-accent rounded-full scale-150 group-hover:opacity-50 transition-opacity duration-500" />
        
        {/* Logo text */}
        <h1 className={`relative font-display font-bold tracking-tight ${sizeClasses[size]}`}>
          <span className="relative">
            {/* Gradient text with shine effect */}
            <span className="relative z-10 bg-gradient-to-br from-white via-white/90 to-white/70 bg-clip-text text-transparent">
              we
            </span>
            {/* Dot separator with glow */}
            <span className="relative z-10 mx-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_12px_rgba(59,130,246,0.8)] animate-pulse" 
                style={{ 
                  verticalAlign: 'middle',
                  marginBottom: size === 'lg' ? '8px' : size === 'md' ? '5px' : '3px'
                }} 
              />
            </span>
            <span className="relative z-10 bg-gradient-to-br from-white/80 via-white/60 to-white/40 bg-clip-text text-transparent">
              pablogfx
            </span>
            <span className="relative z-10 mx-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent/60 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                style={{ 
                  verticalAlign: 'middle',
                  marginBottom: size === 'lg' ? '8px' : size === 'md' ? '5px' : '3px'
                }} 
              />
            </span>
            <span className="relative z-10 bg-gradient-to-br from-white/60 via-white/40 to-white/30 bg-clip-text text-transparent">
              com
            </span>
            
            {/* Shine overlay */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 opacity-0 group-hover:opacity-100 group-hover:animate-shine" />
          </span>
        </h1>
      </div>
      
      {/* Tagline */}
      {showTagline && (
        <p className={`mt-2 font-body ${taglineSizes[size]} uppercase tracking-[0.3em] text-white/30`}>
          File Transfer
        </p>
      )}
    </div>
  );
}
