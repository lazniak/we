'use client';

import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

const SIZES = {
  sm: { text: 'text-lg', mark: 'w-4 h-4', gap: 'gap-2', tagline: 'text-[8px] mt-1' },
  md: { text: 'text-2xl sm:text-3xl', mark: 'w-6 h-6', gap: 'gap-2.5', tagline: 'text-[9px] mt-2' },
  lg: { text: 'text-3xl sm:text-5xl', mark: 'w-8 h-8 sm:w-10 sm:h-10', gap: 'gap-3', tagline: 'text-[10px] mt-3' },
};

/** The studio's hexagon mark, with the transfer arrow inside it. */
function HexMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hexart-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3e3a8" />
          <stop offset="55%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#a8811f" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.2 28 9.1v13.8L16 29.8 4 22.9V9.1z"
        fill="none"
        stroke="url(#hexart-gold)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 21.5V10.8m0 0-4.2 4.2M16 10.8l4.2 4.2"
        fill="none"
        stroke="url(#hexart-gold)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ size = 'md', showTagline = false }: LogoProps) {
  const config = SIZES[size];

  return (
    <a
      href="https://hexart.io"
      aria-label="HEXART.io — przejdź na hexart.io"
      className="relative inline-flex flex-col items-center group cursor-pointer"
    >
      <div className="absolute -inset-10 bg-accent/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      <div className={`relative flex items-center ${config.gap}`}>
        <HexMark className={`${config.mark} shrink-0`} />

        <div className="flex items-baseline">
          <span className={`font-display ${config.text} text-white`}>HEXART</span>
          <span className={`font-display ${config.text} font-light gradient-text`}>.io</span>
        </div>
      </div>

      {showTagline && (
        <span
          className={`${config.tagline} font-body font-light uppercase tracking-[0.28em] text-white/25`}
        >
          Pliki bez kombinowania
        </span>
      )}
    </a>
  );
}
