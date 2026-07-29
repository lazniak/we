'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { pickPromo, type Promo } from '@/lib/hexartPromos';
import PromoArt from './PromoArt';

const LAST_SHOWN_KEY = 'hexart-promo-last';
/** How long each card lingers before the reel advances on its own. */
const AUTO_ROTATE_MS = 11000;

type Layer = { id: number; promo: Promo; visible: boolean };

/**
 * Studio promo shown next to the transfer tool - a full-bleed square poster.
 * At rest it shows only the question as a large headline; on hover the question
 * dissolves upward and the answer (plus a "click to…" cue) rises in its place.
 * The whole poster is one link that opens the matching hexart.pl page in a new
 * tab.
 *
 * Between promos the poster cross-fades: the outgoing and incoming faces are
 * stacked and their opacities swap, so the change is a smooth dissolve rather
 * than the old fade-to-nothing blink. A different promo shows on every visit,
 * it auto-advances (paused on hover/focus, off for reduced motion), and there
 * is a manual "show another" control.
 */
export default function HexartPromo() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const idRef = useRef(0);
  const pausedRef = useRef(false);

  const nextPromo = useCallback((): Promo => {
    let previous: number | null = null;
    try {
      const stored = window.sessionStorage.getItem(LAST_SHOWN_KEY);
      previous = stored === null ? null : Number(stored);
    } catch {
      /* private mode - repeats are acceptable */
    }
    const { promo, index } = pickPromo(Number.isFinite(previous) ? previous : null);
    try {
      window.sessionStorage.setItem(LAST_SHOWN_KEY, String(index));
    } catch {
      /* ignore */
    }
    // Warm the incoming artwork so the cross-fade reveals a painted frame.
    try {
      const img = new window.Image();
      img.src = `/promo/${promo.art}.webp`;
    } catch {
      /* ignore */
    }
    return promo;
  }, []);

  useEffect(() => {
    setLayers([{ id: ++idRef.current, promo: nextPromo(), visible: false }]);
  }, [nextPromo]);

  const swap = useCallback(() => {
    const promo = nextPromo();
    setLayers((prev) =>
      [...prev.map((l) => ({ ...l, visible: false })), { id: ++idRef.current, promo, visible: false }].slice(
        -3,
      ),
    );
  }, [nextPromo]);

  // Fade the newest face up shortly after it mounts at zero.
  useEffect(() => {
    const newest = layers[layers.length - 1];
    if (!newest || newest.visible) return;
    const timer = setTimeout(
      () => setLayers((prev) => prev.map((l) => (l.id === newest.id ? { ...l, visible: true } : l))),
      30,
    );
    return () => clearTimeout(timer);
  }, [layers]);

  // Drop faded-out faces (transitionend backed by a timeout, in case it never lands).
  useEffect(() => {
    if (!layers.some((l) => !l.visible)) return;
    const timer = setTimeout(
      () => setLayers((prev) => prev.filter((l) => l.visible || l.id === idRef.current)),
      900,
    );
    return () => clearTimeout(timer);
  }, [layers]);

  // Gentle auto-advance; stands down while hovered/focused, tab hidden, reduced motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current && !document.hidden) swap();
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [swap]);

  if (layers.length === 0) return null;
  const topId = layers[layers.length - 1].id;

  return (
    <aside className="w-full mx-auto mt-8 animate-fade-in">
      <div
        className="card-hover relative aspect-square w-full overflow-hidden rounded-2xl glass-accent transition-shadow duration-300 hover:shadow-[0_22px_60px_-14px_rgba(212,175,55,0.32)]"
        onMouseEnter={() => (pausedRef.current = true)}
        onMouseLeave={() => (pausedRef.current = false)}
        onFocusCapture={() => (pausedRef.current = true)}
        onBlurCapture={() => (pausedRef.current = false)}
      >
        {layers.map((layer) => (
          <PosterFace
            key={layer.id}
            promo={layer.promo}
            active={layer.id === topId}
            visible={layer.visible}
          />
        ))}

        {/* "Show another" - a sibling of the links, so its click swaps the card
            instead of opening the promo, and the markup stays valid. */}
        <button
          onClick={swap}
          className="absolute right-3 top-3 z-30 rounded-lg bg-black/45 p-2 text-white/60 backdrop-blur-sm transition-colors hover:bg-black/65 hover:text-accent"
          aria-label="Pokaż inną informację o HEXART"
          title="Pokaż coś innego"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}

function PosterFace({
  promo,
  active,
  visible,
}: {
  promo: Promo;
  active: boolean;
  visible: boolean;
}) {
  return (
    <a
      href={promo.href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={active ? 0 : -1}
      aria-hidden={!active}
      className={`group/poster absolute inset-0 block transition-opacity duration-[600ms] ease-in-out ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${active ? '' : 'pointer-events-none'}`}
    >
      {/* Full-bleed square artwork, slow Ken Burns push */}
      <div className="absolute inset-0 animate-kenburns">
        <PromoArt art={promo.art} />
      </div>

      {/* Readability scrims: soft at the top for the kicker, deep at the bottom. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/50 to-transparent" />

      {/* Category kicker */}
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-accent/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
          HEXART Studio · {promo.kicker}
        </span>
      </div>

      {/* Copy - the question rests here and dissolves into the answer on hover.
          Both share one grid cell, so the block never resizes as they swap. */}
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        <div className="grid">
          {/* Question (rest state) */}
          <div className="col-start-1 row-start-1 self-end transition-all duration-[450ms] ease-out group-hover/poster:-translate-y-2 group-hover/poster:opacity-0">
            <h3 className="font-display text-3xl font-bold leading-[1.1] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.75)] sm:text-[2.4rem]">
              {promo.title}
            </h3>
          </div>

          {/* Answer + click cue (hover state) */}
          <div className="col-start-1 row-start-1 translate-y-2 self-end opacity-0 transition-all duration-[450ms] ease-out group-hover/poster:translate-y-0 group-hover/poster:opacity-100">
            <div className="mb-4 h-px w-10 bg-accent/70" />
            <p className="mb-5 max-w-[44ch] text-base leading-relaxed text-white/90 drop-shadow-[0_1px_10px_rgba(0,0,0,0.75)]">
              {promo.body}
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-accent-light drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
              Kliknij, by zobaczyć
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
