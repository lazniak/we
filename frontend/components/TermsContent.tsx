'use client';

import { TERMS_EFFECTIVE, TERMS_INTRO, TERMS_SECTIONS, TERMS_VERSION } from '@/lib/terms';

/** Shared rendering of the terms body, used by the page and the modal. */
export default function TermsContent() {
  return (
    <div className="selectable">
      <p className="text-[11px] text-white/25 mb-4">
        Wersja {TERMS_VERSION} · obowiązuje od {TERMS_EFFECTIVE}
      </p>

      <p className="text-sm text-white/55 leading-relaxed mb-6">{TERMS_INTRO}</p>

      <div className="space-y-6">
        {TERMS_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-sm font-semibold text-white/80 mb-2">
              {section.heading}
            </h2>
            <div className="space-y-2">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-[13px] text-white/45 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
