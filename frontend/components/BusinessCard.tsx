'use client';

import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';

const PHONE_DISPLAY = '+48 662 016 430';
const PHONE_TEL = '+48662016430';
const PHOTO_SRC = '/photo-paul.jpg';

/**
 * Contact card shown under the studio ad - the human behind hexart.io. It shows
 * a gold monogram until a real photo is in place at /photo-paul.jpg. The photo
 * is probed by decoding it off-DOM and only swapped in on success: a missing
 * file serves the SPA's own HTML with a 200, which would otherwise leave a
 * broken image on the card.
 */
export default function BusinessCard() {
  const [photoOk, setPhotoOk] = useState(false);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth > 0) setPhotoOk(true);
    };
    probe.src = PHOTO_SRC;
  }, []);

  return (
    <aside className="w-full mx-auto mt-3 animate-fade-in">
      <div className="card-hover glass rounded-2xl p-4 sm:p-5 flex items-center gap-4 hover:border-accent/25 hover:shadow-[0_16px_44px_-16px_rgba(212,175,55,0.25)]">
        <div className="relative shrink-0">
          <div className="w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-2xl overflow-hidden ring-1 ring-accent/30 bg-gradient-to-br from-accent/15 to-transparent flex items-center justify-center shadow-[0_0_30px_-8px_rgba(212,175,55,0.35)]">
            {photoOk ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={PHOTO_SRC}
                alt="Paul Laźniak"
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <span className="font-display text-2xl font-bold gradient-text">PL</span>
            )}
          </div>
          {/* Quiet "reach me" cue */}
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-accent ring-4 ring-[#0d0d0f] animate-pulse-glow" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display text-base sm:text-lg font-semibold text-white/90 leading-tight">
            Paul Laźniak
          </p>
          <p className="text-xs text-white/40 mb-2 truncate">
            HEXART Studio · automatyzacja AI, wideo i XR
          </p>
          <a
            href={`tel:${PHONE_TEL}`}
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-light transition-colors font-medium"
          >
            <Phone className="w-3.5 h-3.5" />
            {PHONE_DISPLAY}
          </a>
        </div>

        <a
          href={`tel:${PHONE_TEL}`}
          className="btn-primary shrink-0 px-4 sm:px-5 py-2.5 text-sm flex items-center gap-2"
          aria-label={`Zadzwoń pod ${PHONE_DISPLAY}`}
        >
          <Phone className="w-4 h-4" />
          <span className="hidden sm:inline">Zadzwoń</span>
        </a>
      </div>
    </aside>
  );
}
