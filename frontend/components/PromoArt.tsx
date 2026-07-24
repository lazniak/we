import React from 'react';

/**
 * Banner artwork for the studio promos - one generated image per theme, in the
 * HEXART palette (warm gold on near-black), served as a lazy-loaded WebP from
 * /public/promo and cropped to fill the banner.
 *
 * Decorative only: the promo copy next to it carries the meaning, so the image
 * is aria-hidden and has an empty alt.
 */

export type PromoArtKey =
  | 'automation'
  | 'voice'
  | 'rag'
  | 'jetson'
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
  | 'contact';

export default function PromoArt({ art }: { art: PromoArtKey }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/promo/${art}.webp`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      className="w-full h-full object-cover select-none"
    />
  );
}
