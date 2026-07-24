'use client';

import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';

const PHONE_DISPLAY = '+48 662 016 430';
const PHONE_TEL = '+48662016430';
const PHOTO_SRC = '/photo-paul.jpg';

/**
 * Contact card shown under the studio ad. It shows a gold monogram until a real
 * photo is in place at /photo-paul.jpg. The photo is probed by decoding it
 * off-DOM and only swapped in on success - a missing file serves the SPA's own
 * HTML with a 200, which would otherwise leave a broken image on the card.
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
    <aside className="w-full max-w-xl mx-auto mt-3 px-4 animate-fade-in">
      <div className="glass rounded-2xl p-4 sm:p-5 flex items-center gap-4">
        <div className="shrink-0 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl overflow-hidden ring-1 ring-accent/30 bg-gradient-to-br from-accent/15 to-transparent flex items-center justify-center">
          {photoOk ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={PHOTO_SRC} alt="Paul Laźniak" className="w-full h-full object-cover" />
          ) : (
            <span className="font-display text-2xl font-bold gradient-text">PL</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display text-base sm:text-lg font-semibold text-white/90 leading-tight">
            Paul Laźniak
          </p>
          <p className="text-xs text-white/40 mb-2">HEXART Studio · automatyzacja AI, wideo i XR</p>
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
