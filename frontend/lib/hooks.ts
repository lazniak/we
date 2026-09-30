'use client';

import { useEffect, useState } from 'react';

/**
 * A large screen held sideways: the upload panel moves to the left and the
 * studio ad takes the background. Must match the `desk` screen in
 * tailwind.config.ts, so CSS and JS agree on which layout is showing.
 */
export const DESK_QUERY = '(min-width: 1024px) and (orientation: landscape)';

/** False on the server and on the first client render, then the real answer. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Current time, re-read every `intervalMs`. Null until mounted, so SSR stays stable. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
