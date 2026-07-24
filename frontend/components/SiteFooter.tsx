'use client';

import { ArrowUpRight } from 'lucide-react';

const LINKS = [
  { label: 'hexart.pl', href: 'https://hexart.pl' },
  { label: 'live.hexart.io', href: 'https://live.hexart.io' },
  { label: 'omnihistory.space', href: 'https://omnihistory.space' },
  { label: 'Kontakt', href: 'https://hexart.pl/#contact' },
];

export default function SiteFooter() {
  return (
    <footer className="px-4 sm:px-6 py-8 border-t border-white/[0.06]">
      <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-[11px] text-white/25 text-center sm:text-left">
          <span className="text-white/40">HEXART Studio</span> — automatyzacja AI, produkcja
          wideo i XR. Od 2004 roku.
        </p>

        <nav className="flex items-center gap-3 flex-wrap justify-center">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] text-white/30 hover:text-accent transition-colors"
            >
              {link.label}
              <ArrowUpRight className="w-3 h-3" />
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
