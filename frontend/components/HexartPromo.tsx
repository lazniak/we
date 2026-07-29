'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { pickPromo, type Promo } from '@/lib/hexartPromos';
import PromoArt from './PromoArt';

const LAST_SHOWN_KEY = 'hexart-promo-last';
/** How long each card lingers before the reel advances on its own. */
const AUTO_ROTATE_MS = 11000;

/**
 * Studio promo shown next to the transfer tool - the site's actual pitch, as a
 * full-bleed square poster: the artwork fills the card and the copy sits on top
 * of it, framed as a question and its answer. The whole poster is one link that
 * opens the matching hexart.pl page in a new tab, so the transfer stays put.
 *
 * It behaves like a small ad reel: a different card on every visit, a slow
 * auto-advance that pauses on hover/focus, and a manual "show another" control.
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
    <aside className="w-full mx-auto mt-8 animate-fade-in">
      <div
        className="group/promo relative"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onFocusCapture={() => (pausedRef.current = true)}
        onBlurCapture={() => (pausedRef.current = false)}
      >
        <a
          href={promo.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`card-hover relative block aspect-square w-full overflow-hidden rounded-2xl glass-accent transition-all duration-300 hover:border-accent/45 hover:shadow-[0_22px_60px_-14px_rgba(212,175,55,0.32)] ${
            fading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/* Full-bleed square artwork, drifting slowly so a still frame breathes */}
          <div className="absolute inset-0 animate-kenburns">
            <PromoArt art={promo.art} />
          </div>

          {/* Readability scrims: soft at the top for the kicker, deep at the
              bottom so the question and answer stay crisp over any frame. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/55 to-transparent" />

          {/* Category kicker */}
          <div className="absolute left-5 top-5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow" />
            <span className="text-[10px] uppercase tracking-[0.22em] text-accent/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
              HEXART Studio · {promo.kicker}
            </span>
          </div>

          {/* Copy on the poster - question, then answer, then the call to act */}
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <h3 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-[1.75rem]">
              {promo.title}
            </h3>

            <div className="my-3 h-px w-10 bg-accent/70" />

            <p className="mb-6 max-w-[42ch] text-sm leading-relaxed text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)] sm:text-base">
              {promo.body}
            </p>

            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#14120a] shadow-[0_8px_24px_rgba(212,175,55,0.38)] transition-transform duration-300 group-hover/promo:-translate-y-0.5">
              {promo.cta}
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </a>

        {/* "Show another" - a sibling of the link, never nested inside it, so its
            click swaps the card instead of opening the promo. */}
        <button
          onClick={swap}
          className="absolute right-3 top-3 z-20 rounded-lg bg-black/45 p-2 text-white/60 backdrop-blur-sm transition-colors hover:bg-black/65 hover:text-accent"
          aria-label="Pokaż inną informację o HEXART"
          title="Pokaż coś innego"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}
