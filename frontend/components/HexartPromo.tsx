'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { pickPromo, type Promo } from '@/lib/hexartPromos';

const LAST_SHOWN_KEY = 'hexart-promo-last';

/**
 * Studio promo shown next to the transfer tool. A different one appears on
 * every visit, and the last index is remembered for the session so the same
 * card does not come up twice in a row.
 *
 * The pick happens on the client, so the server renders nothing and there is
 * no hydration mismatch to work around.
 */
export default function HexartPromo() {
  const [promo, setPromo] = useState<Promo | null>(null);
  const [fading, setFading] = useState(false);

  const rotate = useCallback(() => {
    let previous: number | null = null;
    try {
      const stored = window.sessionStorage.getItem(LAST_SHOWN_KEY);
      previous = stored === null ? null : Number(stored);
    } catch {
      /* private mode - repeats are acceptable */
    }

    const { promo: next, index } = pickPromo(Number.isFinite(previous) ? previous : null);
    try {
      window.sessionStorage.setItem(LAST_SHOWN_KEY, String(index));
    } catch {
      /* ignore */
    }
    setPromo(next);
  }, []);

  useEffect(rotate, [rotate]);

  const showAnother = () => {
    setFading(true);
    window.setTimeout(() => {
      rotate();
      setFading(false);
    }, 180);
  };

  if (!promo) return null;

  return (
    <aside className="w-full max-w-xl mx-auto mt-8 px-4 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl glass-accent animate-sheen">
        <div
          className={`relative z-10 p-5 sm:p-6 transition-opacity duration-200 ${
            fading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse-glow" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-accent/80 truncate">
                HEXART Studio · {promo.kicker}
              </span>
            </div>

            <button
              onClick={showAnother}
              className="shrink-0 p-1.5 -m-1.5 rounded-lg text-white/20 hover:text-accent transition-colors"
              aria-label="Pokaż inną informację o HEXART"
              title="Pokaż coś innego"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <h3 className="font-display text-lg sm:text-xl text-white leading-snug mb-2">
            {promo.title}
          </h3>

          <p className="text-sm text-white/45 leading-relaxed mb-4">{promo.body}</p>

          <a
            href={promo.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-light transition-colors group"
          >
            {promo.cta}
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </div>
    </aside>
  );
}
