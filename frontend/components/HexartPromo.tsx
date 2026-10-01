'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { pickPromo, type Promo } from '@/lib/hexartPromos';
import PromoArt, { AiBadge, hasPromoFilm, PROMO_ART, usePromoReady, type PromoArtKey } from './PromoArt';

const LAST_SHOWN_KEY = 'hexart-promo-last';
/** How long each card lingers before the reel advances on its own. */
const AUTO_ROTATE_MS = 11000;

type Layer = { id: number; promo: Promo; visible: boolean };

function lastShown(): number | null {
  try {
    const stored = window.sessionStorage.getItem(LAST_SHOWN_KEY);
    const index = stored === null ? null : Number(stored);
    return Number.isFinite(index) ? index : null;
  } catch {
    return null; /* private mode - repeats are acceptable */
  }
}

function rememberShown(index: number) {
  try {
    window.sessionStorage.setItem(LAST_SHOWN_KEY, String(index));
  } catch {
    /* ignore */
  }
}

/**
 * A 16:9 studio banner for phones and portrait screens. Its headline and link
 * stay visible on touch devices; wider cards also show the supporting copy.
 * The whole banner opens the matching hexart.pl page in a new tab.
 *
 * Between promos the poster cross-fades: the outgoing and incoming faces are
 * stacked and their opacities swap, so the change is a smooth dissolve rather
 * than the old fade-to-nothing blink. A different promo shows on every visit,
 * it auto-advances once the next card has downloaded (paused on hover/focus,
 * off for reduced motion), and there is a manual "show another" control.
 */
export default function HexartPromo() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const idRef = useRef(0);
  const pausedRef = useRef(false);

  // The next card is chosen ahead and downloads in the background, film and
  // still, so it plays at once when it comes up.
  const upcomingRef = useRef<{ promo: Promo; index: number } | null>(null);
  const [upcomingArt, setUpcomingArt] = useState<PromoArtKey | null>(null);
  const upcomingReady = usePromoReady(upcomingArt, '720');

  const queue = useCallback((after: number) => {
    const choice = pickPromo(after);
    upcomingRef.current = choice;
    setUpcomingArt(choice.promo.art);
  }, []);

  useEffect(() => {
    const first = pickPromo(lastShown());
    rememberShown(first.index);
    setLayers([{ id: ++idRef.current, promo: first.promo, visible: false }]);
    queue(first.index);
  }, [queue]);

  const swap = useCallback(() => {
    const next = upcomingRef.current;
    if (!next) return;
    rememberShown(next.index);
    const id = ++idRef.current;
    setLayers((prev) =>
      [...prev.map((l) => ({ ...l, visible: false })), { id, promo: next.promo, visible: false }].slice(-3),
    );
    queue(next.index);
  }, [queue]);

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

  // Gentle auto-advance: due a while after each card appears, taken only once
  // the next card has downloaded. Stands down while hovered/focused, tab
  // hidden, reduced motion.
  const topId = layers.length ? layers[layers.length - 1].id : null;
  const [due, setDue] = useState(false);
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    setDue(false);
    if (topId === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setDue(true), AUTO_ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [topId]);

  useEffect(() => {
    if (!due || !upcomingReady) return;
    if (pausedRef.current || document.hidden) {
      const retry = window.setTimeout(() => setRecheck((n) => n + 1), 1000);
      return () => window.clearTimeout(retry);
    }
    swap();
  }, [due, upcomingReady, recheck, swap]);

  if (topId === null) return null;

  return (
    <aside className="w-full mx-auto mt-8 animate-fade-in">
      <div
        className="chamfer chamfer-lg chamfer-line relative aspect-video w-full overflow-hidden border border-white/15 bg-[#0a0a0c]"
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
          type="button"
          className="absolute right-2 top-5 z-30 grid h-11 w-11 place-items-center rounded-[2px] border border-white/15 bg-[#0a0a0c]/60 text-white/80 backdrop-blur-sm transition-colors duration-200 hover:border-accent/40 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent sm:right-4"
          aria-label="Pokaż inną informację o HEXART"
          title="Pokaż coś innego"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
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
      className={`chamfer chamfer-lg-inset group/poster absolute inset-0 block transition-opacity duration-[600ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${active ? '' : 'pointer-events-none'}`}
    >
      {/* Full 16:9 artwork: a film moves on its own, a still gets a slow Ken Burns push. */}
      <div className={`absolute inset-0 ${hasPromoFilm(promo.art) ? '' : 'animate-kenburns'}`}>
        <PromoArt art={promo.art} />
      </div>

      {/* Readability scrims: soft at the top for the kicker, deep at the bottom. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#0a0a0c]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0c]/95 via-[#0a0a0c]/25 to-transparent" />

      {/* Category kicker */}
      <div className="absolute left-3 right-14 top-3 flex items-center gap-2 sm:left-5 sm:top-5">
        <span className="h-px w-4 shrink-0 bg-accent/70" />
        <span className="font-label text-[10px] font-medium uppercase tracking-[0.12em] text-accent-light sm:text-xs">
          <span className="hidden sm:inline">HEXART Studio · </span>{promo.kicker}
        </span>
      </div>
      {PROMO_ART[promo.art].ai && (
        <AiBadge art={promo.art} compact className="absolute left-3 top-8 sm:left-5 sm:top-11" />
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <h3 className="max-w-[30ch] font-display text-[clamp(1.125rem,5vw,1.5rem)] font-semibold leading-[1.1] text-white sm:text-[1.75rem]">
          {promo.title}
        </h3>
        <p className="sr-only sm:not-sr-only sm:mt-2 sm:line-clamp-2 sm:max-w-[48ch] sm:text-sm sm:leading-relaxed sm:text-white/85">
          {promo.body}
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 font-label text-xs font-medium uppercase tracking-[0.1em] text-accent-light sm:mt-3">
          {promo.cta}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}
