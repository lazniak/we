import React from 'react';

/**
 * Banner artwork for the studio promos, served as WebP from /public/promo and
 * cropped to fill the banner.
 *
 * Artwork provenance is documented in assets/promo-sources/README.md.
 * Jetson uses the owner-supplied AI-assisted illustration; the consultation
 * card shows a real photo of P. Lazniak. AI-assisted artwork is labelled.
 *
 * Decorative only: the promo copy next to it carries the meaning, so the image
 * is aria-hidden and has an empty alt.
 */

export type PromoArtKey =
  | 'automation'
  | 'voice'
  | 'rag'
  | 'jetson'
  | 'wojna1939'
  | 'film'
  | 'video'
  | 'xr'
  | 'facemapping'
  | 'live'
  | 'history'
  | 'ecommerce'
  | 'branding'
  | 'genai'
  | 'heritage'
  | 'paul'
  | 'contact';

interface ArtMeta {
  /** Generated or substantially altered by AI: labelled on screen. */
  ai: boolean;
  /** Where the subject sits, for crops that cannot show the whole frame. */
  focus?: string;
  zoom?: number;
}

export const PROMO_ART: Record<PromoArtKey, ArtMeta> = {
  automation: { ai: true },
  voice: { ai: true },
  rag: { ai: true },
  jetson: { ai: true, focus: '64% 50%' },
  wojna1939: { ai: true, focus: '50% 55%' },
  film: { ai: true },
  video: { ai: true },
  xr: { ai: true },
  facemapping: { ai: true },
  live: { ai: true },
  history: { ai: true },
  ecommerce: { ai: true },
  branding: { ai: true },
  genai: { ai: true },
  heritage: { ai: true },
  paul: { ai: false, focus: '68% 35%' },
  contact: { ai: true },
};

export const AI_IMAGE_LABEL = 'Obraz stworzony z pomocą AI.';

export function promoArtSrc(art: PromoArtKey) {
  return `/promo/${art}.webp`;
}

/**
 * The brand's AI marker (hx-ai, overlay variant): a gold "AI" tab and the
 * exact wording, on a solid dark plate in a corner of the frame.
 */
export function AiBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`chamfer chamfer-sm inline-flex items-center gap-2 border border-white/[0.16] bg-[#0a0a0c]/[0.62] py-1 pl-1 pr-3 text-[11px] font-medium leading-tight text-white backdrop-blur-[12px] ${className}`}
    >
      <span className="grid h-[1.6em] min-w-[1.9em] place-content-center bg-accent px-1 font-label font-bold tracking-[0.06em] text-[#0a0a0c]">
        AI
      </span>
      {AI_IMAGE_LABEL}
    </span>
  );
}

export default function PromoArt({ art }: { art: PromoArtKey }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={promoArtSrc(art)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      className="w-full h-full object-cover select-none"
      style={{ objectPosition: PROMO_ART[art].focus ?? '50% 50%', transform: PROMO_ART[art].zoom ? 'scale(' + PROMO_ART[art].zoom + ')' : undefined }}
    />
  );
}
