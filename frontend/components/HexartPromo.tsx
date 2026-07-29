'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { pickPromo, type Promo } from '@/lib/hexartPromos';
import PromoArt from './PromoArt';

const LAST_SHOWN_KEY = 'hexart-promo-last';
/** How long each card lingers before the reel advances on its own. */
const AUTO_ROTATE_MS = 11000;

/**
 * Studio promo shown next to the transfer tool - the site's actual pitch. It
 * behaves like a small ad reel: a different card on every visit, a slow
 * auto-advance that pauses the moment a visitor hovers or focuses it, and a
 * manual "show me another" control. Each card names a problem bluntly, answers
 * it in a line and links to the matching page on hexart.pl.
 *
 * The pick happens on the client, so the server renders nothing and there is no
 * hydration mismatch to work around.
 */
export default function HexartPromo() {
  const [promo, setPromo] = useState<Promo | null>(null);
  const [fading, setFading] = useState(false);
  const pausedRef = useRef(false);

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

  const swap = useCallback(() => {
    setFading(true);
    window.setTimeout(() => {
      rotate();
      setFading(false);
    }, 220);
  }, [rotate]);

  // Gentle auto-advance so the card reads as a rotating advertisement. It stands
  // down while hovered/focused, while the tab is hidden, and for reduced motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      swap();
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [swap]);

  if (!promo) return null;

  return (
    <aside className="w-full max-w-2xl mx-auto mt-8 px-4 animate-fade-in">
      <div
        className="card-hover relative overflow-hidden rounded-2xl glass-accent animate-sheen hover:border-accent/40 hover:shadow-[0_18px_50px_-12px_rgba(212,175,55,0.28)]"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onFocusCapture={() => (pausedRef.current = true)}
        onBlurCapture={() => (pausedRef.current = false)}
      >
        <div
          className={`transition-all duration-300 ${
            fading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
          }`}
        >
          {/* Banner artwork, drifting slowly so the still frame feels like a reel */}
          <div className="relative h-44 sm:h-56 w-full overflow-hidden border-b border-accent/10">
            <div className="absolute inset-0 animate-kenburns">
              <PromoArt art={promo.art} />
            </div>
            {/* Scrim so the kicker and button stay legible over a bright frame */}
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
            {/* Kicker floats over the art */}
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-accent/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                HEXART Studio · {promo.kicker}
              </span>
            </div>
            <button
              onClick={swap}
              className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-lg text-white/50 hover:text-accent hover:bg-black/30 transition-colors"
              aria-label="Pokaż inną informację o HEXART"
              title="Pokaż coś innego"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {/* Fade so text below sits on solid ground */}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#14140f] to-transparent" />
          </div>

          {/* Copy */}
          <div className="p-6 sm:p-7 pt-5">
            <h3 className="font-display text-xl sm:text-2xl text-white leading-snug mb-2">
              {promo.title}
            </h3>
            <p className="text-sm sm:text-base text-white/45 leading-relaxed mb-4">{promo.body}</p>
            <a
              href={promo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-light transition-colors group/cta"
            >
              {promo.cta}
              <ArrowUpRight className="w-4 h-4 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
