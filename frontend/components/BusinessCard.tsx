'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Phone } from 'lucide-react';
import { CONTACT } from '@/lib/contact';

/**
 * Contact card shown under the studio ad on phones and portrait screens - the
 * human behind hexart.io. On a large landscape screen the same contact sits in
 * the background stage instead (PromoStage).
 *
 * It shows a gold monogram until a real photo is in place. The photo is probed
 * by decoding it off-DOM and only swapped in on success: a missing file serves
 * the SPA's own HTML with a 200, which would otherwise leave a broken image.
 */
export default function BusinessCard() {
  const [photoOk, setPhotoOk] = useState(false);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth > 0) setPhotoOk(true);
    };
    probe.src = CONTACT.photo;
  }, []);

  return (
    <aside className="w-full mx-auto mt-3 animate-fade-in">
      <div className="chamfer chamfer-lg border border-white/10 bg-[#141418]/75 p-4 backdrop-blur-xl sm:p-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="hex-mask flex h-16 w-14 items-center justify-center overflow-hidden bg-[#24242a] sm:h-[76px] sm:w-[66px]">
              {photoOk ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={CONTACT.photo}
                  alt={CONTACT.name}
                  style={CONTACT.photoStyle}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="font-display text-2xl font-semibold text-accent">PL</span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-display text-base sm:text-lg font-semibold text-white/90 leading-tight">
              {CONTACT.name}
            </p>
            <p className="mb-2 truncate text-xs text-[#b0b8c4]">{CONTACT.role}</p>
            <a
              href={`tel:${CONTACT.phoneTel}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-light transition-colors font-medium"
            >
              <Phone className="w-3.5 h-3.5" />
              {CONTACT.phoneDisplay}
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            href={`tel:${CONTACT.phoneTel}`}
            className="chamfer chamfer-sm flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap bg-accent px-2 py-2.5 text-[13px] font-medium text-[#0a0a0c] transition-colors duration-200 hover:bg-accent-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white sm:text-sm"
            aria-label={`Zadzwoń pod ${CONTACT.phoneDisplay}`}
          >
            <Phone className="w-4 h-4" />
            Zadzwoń
          </a>
          <a
            href={CONTACT.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="chamfer chamfer-sm flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap border border-accent/40 px-2 py-2.5 text-[13px] text-white/90 transition-colors duration-200 hover:border-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent sm:text-sm"
            aria-label="Umów rozmowę w HEXART"
          >
            <CalendarClock className="w-4 h-4" />
            Umów się
          </a>
        </div>
      </div>
    </aside>
  );
}
