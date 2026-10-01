'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DESK_QUERY, useMediaQuery } from '@/lib/hooks';

/**
 * The studio's ambient reel, running full-frame behind the interface - the same
 * abstract gold motion hexart.pl uses. It is the quiet advertisement: the tool
 * sits on top of the studio's own showreel.
 *
 * A still of the reel's first frame lies under the film, so the background is
 * there from the first paint: while the film downloads on a phone, when the
 * browser refuses autoplay (iOS Low Power Mode), and for visitors who ask for
 * reduced motion or are saving data, who get the still alone.
 *
 * Legibility is protected by two scrims rather than by hiding the reel: a soft
 * pool of darkness under the centre column keeps text readable, and an edge
 * vignette stops the frame from looking like a hard crop.
 */
export default function BackgroundVideo() {
  const [motion, setMotion] = useState(false);
  const pathname = usePathname();
  const desk = useMediaQuery(DESK_QUERY);
  const videoRef = useRef<HTMLVideoElement>(null);

  // On a large landscape screen the home page runs the studio stage full
  // frame, which would hide the reel anyway - no point decoding it.
  const covered = desk && pathname === '/';

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;

    if (reduced || saveData) return;

    // Defer past first paint so it never delays the interface.
    const timer = window.setTimeout(() => setMotion(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  // Autoplay rules check the muted property, which React does not always set.
  // A refused or held-back film starts when the page shows again or on the
  // next touch; until then the still stands in.
  useEffect(() => {
    const video = videoRef.current;
    if (!motion || covered || !video) return;
    video.muted = true;
    video.defaultMuted = true;
    const start = () => {
      if (video.paused && !document.hidden) void video.play().catch(() => {});
    };
    start();
    document.addEventListener('visibilitychange', start);
    window.addEventListener('pageshow', start);
    window.addEventListener('pointerdown', start, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('pageshow', start);
      window.removeEventListener('pointerdown', start);
    };
  }, [motion, covered]);

  if (covered) return null;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Still and film blend as one layer, so the film covers the still
          exactly once it plays. */}
      <div className="absolute inset-0 opacity-[0.5] mix-blend-screen animate-bg-drift">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bg-loop.webp"
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {motion && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
          >
            <source src="/bg-loop.webm" type="video/webm" />
            <source src="/bg-loop.mp4" type="video/mp4" />
          </video>
        )}
      </div>

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
