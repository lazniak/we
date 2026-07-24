'use client';

import { ArrowUpRight } from 'lucide-react';

const LINKS = [
  { label: 'hexart.pl', href: 'https://hexart.pl', external: true },
  { label: 'live.hexart.io', href: 'https://live.hexart.io', external: true },
  { label: 'omnihistory.space', href: 'https://omnihistory.space', external: true },
  { label: 'Regulamin', href: '/regulamin', external: false },
  { label: 'Kontakt', href: 'https://hexart.pl/#contact', external: true },
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
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-0.5 text-[11px] text-white/30 hover:text-accent transition-colors"
            >
              {link.label}
              {link.external && <ArrowUpRight className="w-3 h-3" />}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
