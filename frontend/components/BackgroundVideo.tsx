'use client';

import { useEffect, useState } from 'react';

/**
 * The studio's ambient reel, running full-frame behind the interface - the same
 * abstract gold motion hexart.pl uses. It is the quiet advertisement: the tool
 * sits on top of the studio's own showreel.
 *
 * Legibility is protected by two scrims rather than by hiding the video: a soft
 * pool of darkness under the centre column keeps text readable, and an edge
 * vignette stops the frame from looking like a hard crop. It still bows out for
 * visitors who ask for reduced motion or are saving data.
 */
export default function BackgroundVideo() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;

    if (reduced || saveData) return;

    // Defer past first paint so it never delays the interface.
    const timer = window.setTimeout(() => setShow(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-[0.5] mix-blend-screen animate-bg-drift"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src="/bg-loop.webm" type="video/webm" />
        <source src="/bg-loop.mp4" type="video/mp4" />
      </video>

      {/* Light veil under the reading column - just enough for legible copy, not
          enough to bury the reel. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_46%_at_50%_40%,rgba(8,8,11,0.42),transparent_70%)]" />
      {/* Corner vignette that starts late, so the mid-field motion stays visible. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_58%,rgba(6,6,9,0.92)_100%)]" />
      {/* Faint floor so the footer and stats keep their footing. */}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#0a0a0c] to-transparent" />
    </div>
  );
}
