'use client';

import { useEffect, useState } from 'react';

/**
 * The studio's ambient loop, held far behind the content at low opacity - the
 * same abstract motion hexart.pl uses, tuned down so it never competes with
 * the interface.
 *
 * It waits for first paint and skips itself entirely when the visitor prefers
 * reduced motion or is on a small screen, where a full-frame video is a
 * battery and bandwidth cost with little payoff.
 */
export default function BackgroundVideo() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.matchMedia('(max-width: 640px)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;

    if (reduced || small || saveData) return;

    // Defer past first paint so it never delays the interface.
    const timer = window.setTimeout(() => setShow(true), 120);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-[0.14] mix-blend-screen"
        autoPlay
        loop
        muted
        playsInline
        preload="none"
        poster=""
      >
        <source src="/bg-loop.webm" type="video/webm" />
        <source src="/bg-loop.mp4" type="video/mp4" />
      </video>
      {/* Vignette so the edges never look like a hard video crop. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,#0a0a0c_85%)]" />
    </div>
  );
}
