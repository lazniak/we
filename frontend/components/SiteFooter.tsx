'use client';

import { ArrowUpRight } from 'lucide-react';
import InstallButton from './InstallButton';

const LINKS = [
  { label: 'hexart.pl', href: 'https://hexart.pl', external: true },
  { label: 'live.hexart.io', href: 'https://live.hexart.io', external: true },
  { label: 'omnihistory.space', href: 'https://omnihistory.space', external: true },
  { label: 'Regulamin', href: '/regulamin', external: false },
  { label: 'Kontakt', href: 'https://hexart.pl/#contact', external: true },
];

/**
 * `panel` stacks the footer when it lives inside the narrow desktop panel on
 * the home page, instead of spreading it across the full width.
 */
export default function SiteFooter({ panel = false }: { panel?: boolean }) {
  return (
    <footer className="px-4 sm:px-6 py-8 border-t border-white/[0.06]">
      <div
        className={`max-w-xl mx-auto flex flex-col items-center justify-between gap-4 ${
          panel ? 'sm:flex-row desk:flex-col' : 'sm:flex-row'
        }`}
      >
        <p
          className={`text-[11px] text-white/25 text-center ${panel ? 'sm:text-left desk:text-center' : 'sm:text-left'}`}
        >
          <span className="text-white/40">HEXART Studio</span>. Film, XR i systemy AI. Od 2006
          roku w&nbsp;produkcji, od 2020 jako HEXART.
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
          <InstallButton />
        </nav>
      </div>
    </footer>
  );
}
