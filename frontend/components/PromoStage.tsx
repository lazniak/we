'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import clsx from 'clsx';
import { HEXART_PROMOS } from '@/lib/hexartPromos';
import { CONTACT } from '@/lib/contact';
import { DESK_QUERY, useMediaQuery, useReducedMotion } from '@/lib/hooks';
import { AiBadge, hasPromoFilm, PROMO_ART, PromoMedia, usePromoReady } from './PromoArt';

/** How long a card stays before the next one dissolves in. */
const STAGE_MS = 9000;
/** Directions the artwork drifts in, one per card in turn. */
const DRIFTS = [
  ['-1.5%', '-1%'],
  ['1.4%', '-1.2%'],
  ['-1.1%', '1.2%'],
  ['1.2%', '0.9%'],
];

/**
 * The studio ad behind the upload panel on a large landscape screen.
 *
 * Built like a title sequence rather than a banner: full-bleed artwork (a
 * silent looping film, or a still that drifts slowly) that follows the pointer
 * by a few pixels, cards that change with a film dissolve out of soft focus,
 * a headline revealed word by word,
 * fine grain, viewfinder corner marks. Nothing bounces or glows. The contact
 * card sits in the top right corner. On phones and portrait screens this is
 * not mounted at all; the 16:9 banner and business card take its place.
 */
export default function PromoStage() {
  const desk = useMediaQuery(DESK_QUERY);
  if (!desk) return null;
  return <Stage />;
}

function Stage() {
  const reducedMotion = useReducedMotion();
  const count = HEXART_PROMOS.length;

  // A fresh order on every visit, so returning visitors do not always meet the
  // same card first. Safe here: the stage never renders on the server.
  const order = useMemo(() => {
    const indices = HEXART_PROMOS.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }, []);

  const [position, setPosition] = useState(0);
  const [layers, setLayers] = useState([{ key: 0, position: 0 }]);
  const [paused, setPaused] = useState(false);
  const layerKey = useRef(0);
  const artRef = useRef<HTMLDivElement>(null);

  const promo = HEXART_PROMOS[order[position]];

  const go = useCallback(
    (delta: number) => setPosition((current) => (current + delta + count) % count),
    [count],
  );

  // Each change stacks the incoming artwork over the outgoing one. The old
  // layer goes only when the new one has finished dissolving in (its own
  // animationend), never on a timer: in a background tab timers keep running
  // while CSS animations stand still, and a timer would leave a black frame.
  useEffect(() => {
    setLayers((previous) => {
      if (previous[previous.length - 1]?.position === position) return previous;
      layerKey.current += 1;
      return [...previous.slice(-1), { key: layerKey.current, position }];
    });
  }, [position]);

  // The next card downloads in the background, film and still. When the
  // progress line runs out the reel advances only once it has, so the next
  // film plays the moment it dissolves in.
  const upcomingReady = usePromoReady(HEXART_PROMOS[order[(position + 1) % count]].art, '1080');
  const [due, setDue] = useState(false);

  useEffect(() => setDue(false), [position]);

  useEffect(() => {
    if (due && upcomingReady) go(1);
  }, [due, upcomingReady, go]);

  const dropCovered = useCallback((key: number) => {
    setLayers((previous) =>
      previous[previous.length - 1]?.key === key ? previous.slice(-1) : previous,
    );
  }, []);

  // The artwork leans a few pixels away from the pointer, eased, so the frame
  // feels like a lens rather than a flat picture.
  useEffect(() => {
    if (reducedMotion) return;
    const element = artRef.current;
    if (!element) return;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const tick = () => {
      x += (targetX - x) * 0.05;
      y += (targetY - y) * 0.05;
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      frame =
        Math.abs(targetX - x) > 0.05 || Math.abs(targetY - y) > 0.05
          ? window.requestAnimationFrame(tick)
          : 0;
    };

    const onMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * -16;
      targetY = (event.clientY / window.innerHeight - 0.5) * -10;
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  const words = promo.title.split(/\s+/);
  const bodyDelay = 260 + words.length * 70;

  return (
    <aside
      aria-label="HEXART Studio"
      className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0c]"
    >
      {/* Artwork */}
      <div ref={artRef} className="absolute -inset-6 will-change-transform" aria-hidden="true">
        {layers.map((layer) => {
          const art = HEXART_PROMOS[order[layer.position]].art;
          const [driftX, driftY] = DRIFTS[layer.position % DRIFTS.length];
          return (
            <div
              key={layer.key}
              className="absolute inset-0 stage-dissolve"
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) dropCovered(layer.key);
              }}
            >
              {/* A film carries its own motion; a still drifts. */}
              <div
                className={clsx('absolute inset-0', !hasPromoFilm(art) && 'stage-drift')}
                style={{ '--drift-x': driftX, '--drift-y': driftY } as React.CSSProperties}
              >
                <PromoMedia art={art} size="1080" focus="64% 50%" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Low-key grade. The left edge stays light on purpose: the panel is
          glass and should show the picture, blurred, rather than a black wall.
          Depth for the copy comes from the bottom and the vignette. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a0a0c]/45 from-0% via-[#0a0a0c]/20 via-35% to-transparent to-65%" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0c]/95 from-0% via-[#0a0a0c]/35 via-40% to-transparent to-70%" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#0a0a0c]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,transparent_55%,rgba(5,5,7,0.65)_100%)]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="film-grain" />
      </div>

      <a
        href={promo.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Otwórz reklamę: ${promo.title}`}
        className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent"
      />

      {/* Text passes pointer events to the full-area link; controls remain independent. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 left-[var(--panel-w)] flex flex-col justify-between px-10 py-10 xl:px-16 xl:py-12">
        <CornerMarks />

        <div className="relative flex justify-end">
          <ContactCard />
        </div>

        {PROMO_ART[promo.art].ai && (
          <div
            key={`ai-${position}`}
            className="stage-rise pointer-events-none absolute bottom-10 right-10 xl:bottom-12 xl:right-16"
          >
            <AiBadge art={promo.art} />
          </div>
        )}

        <div
          className={clsx('relative max-w-[42rem]', paused && 'stage-paused')}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {/* Re-keyed per card so every reveal plays from the start. */}
          <div key={position}>
            <p className="stage-rise flex items-center gap-3 font-label text-[13px] font-medium uppercase tracking-[0.16em] text-accent">
              <span className="h-px w-8 bg-accent/70" />
              HEXART Studio · {promo.kicker}
            </p>

            <h2
              className="mt-5 font-display text-white leading-[1.04] text-[clamp(2.4rem,3.6vw,4.6rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.55)]"
              style={{ fontWeight: 700 }}
            >
              {words.map((word, i) => (
                <span key={`${word}-${i}`}>
                  {i > 0 && ' '}
                  <span className="stage-word">
                    <span style={{ animationDelay: `${120 + i * 70}ms` }}>{word}</span>
                  </span>
                </span>
              ))}
            </h2>

            <p
              className="stage-rise mt-6 max-w-[40ch] text-lg leading-relaxed text-white/75"
              style={{ animationDelay: `${bodyDelay}ms` }}
            >
              {promo.body}
            </p>

            <a
              href={promo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto stage-rise group/cta mt-8 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-accent-light"
              style={{ animationDelay: `${bodyDelay + 160}ms` }}
            >
              <span className="relative">
                {promo.cta}
                <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-[0.35] bg-accent/70 transition-transform duration-[600ms] ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover/cta:scale-x-100" />
              </span>
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5" />
            </a>
          </div>

          {/* Position, time to the next card, manual steps */}
          <div className="mt-12 flex items-center gap-5">
            <span className="font-label text-sm font-medium tabular-nums tracking-[0.08em] text-white/70">
              {String(position + 1).padStart(2, '0')}
              <span className="text-white/25"> / {String(count).padStart(2, '0')}</span>
            </span>

            <div className="relative h-px w-56 overflow-hidden bg-white/15">
              <div
                key={position}
                className="stage-progress absolute inset-0 bg-accent"
                style={{ '--stage-ms': `${STAGE_MS}ms` } as React.CSSProperties}
                onAnimationEnd={() => setDue(true)}
              />
            </div>

            <div className="pointer-events-auto flex items-center gap-1">
              <button
                onClick={() => go(-1)}
                className="p-2 text-white/40 transition-colors hover:text-accent"
                aria-label="Poprzednia informacja"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => go(1)}
                className="p-2 text-white/40 transition-colors hover:text-accent"
                aria-label="Następna informacja"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Hairline corner marks framing the stage, as in a camera viewfinder. */
function CornerMarks() {
  const mark = 'absolute h-5 w-5 border-accent/35';
  return (
    <div className="pointer-events-none absolute inset-6 xl:inset-8" aria-hidden="true">
      <span className={`${mark} left-0 top-0 border-l border-t`} />
      <span className={`${mark} right-0 top-0 border-r border-t`} />
      <span className={`${mark} bottom-0 left-0 border-b border-l`} />
      <span className={`${mark} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

function ContactCard() {
  const [photoOk, setPhotoOk] = useState(true);

  return (
    <div className="pointer-events-auto chamfer chamfer-lg chamfer-line w-[20rem] border border-white/10 bg-[#0a0a0c]/55 p-5 backdrop-blur-md stage-rise">
      <div className="flex items-center gap-4">
        <div className="hex-mask relative h-16 w-14 shrink-0 bg-gradient-to-br from-accent/30 to-accent/5">
          {photoOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={CONTACT.photo}
              alt={CONTACT.name}
              style={CONTACT.photoStyle}
              draggable={false}
              onError={() => setPhotoOk(false)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-display text-lg text-accent">
              PL
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.16em] text-accent/90">
            Porozmawiajmy
          </p>
          <p className="font-display text-xl leading-tight text-white" style={{ fontWeight: 600 }}>
            {CONTACT.name}
          </p>
          <p className="truncate text-xs text-white/50">HEXART Studio</p>
        </div>
      </div>

      <a
        href={`tel:${CONTACT.phoneTel}`}
        className="mt-4 block font-label text-lg font-medium tracking-[0.06em] text-white/85 transition-colors hover:text-accent-light"
      >
        {CONTACT.phoneDisplay}
      </a>

      <div className="mt-4 flex gap-2">
        <a
          href={`tel:${CONTACT.phoneTel}`}
          className="chamfer chamfer-sm flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-accent px-4 py-2.5 text-sm font-medium text-[#0a0a0c] transition-colors duration-200 hover:bg-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white [--ring:#fff]"
        >
          <Phone className="h-4 w-4" />
          Zadzwoń
        </a>
        <a
          href={CONTACT.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[2px] border border-accent/60 px-3 py-2.5 text-sm text-white/90 transition-colors hover:bg-accent/10"
        >
          <CalendarClock className="h-4 w-4" />
          Umów rozmowę
        </a>
      </div>
    </div>
  );
}
