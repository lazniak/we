'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { pickPromo, type Promo } from '@/lib/hexartPromos';
import PromoArt from './PromoArt';

const LAST_SHOWN_KEY = 'hexart-promo-last';

/**
 * Studio promo shown next to the transfer tool. A different one appears on
 * every visit, each with its own artwork, and the last index is remembered
 * for the session so the same card does not come up twice in a row.
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
      <div className="relative overflow-hidden rounded-2xl glass-accent">
        <div
          className={`transition-opacity duration-200 ${fading ? 'opacity-0' : 'opacity-100'}`}
        >
          {/* Banner artwork */}
          <div className="relative h-28 sm:h-32 w-full overflow-hidden border-b border-accent/10">
            <PromoArt art={promo.art} />
            {/* Kicker floats over the art */}
            <div className="absolute top-3 left-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-accent/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                HEXART Studio · {promo.kicker}
              </span>
            </div>
            <button
              onClick={showAnother}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-white/40 hover:text-accent hover:bg-black/30 transition-colors"
              aria-label="Pokaż inną informację o HEXART"
              title="Pokaż coś innego"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {/* Fade so text below sits on solid ground */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#14140f] to-transparent" />
          </div>

          {/* Copy */}
          <div className="p-5 sm:p-6 pt-4">
            <h3 className="font-display text-lg sm:text-xl text-white leading-snug mb-2">
              {promo.title}
            </h3>
            <p className="text-sm text-white/45 leading-relaxed mb-4">{promo.body}</p>
            <a
              href={promo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-light transition-colors group"
            >
              {promo.cta}
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
