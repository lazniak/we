'use client';

import { useEffect, useRef, useState } from 'react';

export type BackdropMedia = { url: string; type: 'image' | 'video' };
type Layer = BackdropMedia & { id: number; visible: boolean };

const IMAGE_OPACITY = 0.22;
const VIDEO_OPACITY = 0.26;

/**
 * The soft backdrop that appears behind the file browser when a preview-able
 * file is hovered. Successive hovers cross-fade: the new frame fades up while
 * the previous one fades out, instead of snapping. Layers remove themselves
 * once their fade-out finishes, and the stack is capped so a fast sweep across
 * the list cannot pile up nodes.
 *
 * Sits above the page's ambient reel (z-0) but below the content column
 * (z-10), so with nothing hovered the studio loop shows through.
 */
export default function HoverBackdrop({ media }: { media: BackdropMedia | null }) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const idRef = useRef(0);
  const currentUrl = useRef<string | null>(null);

  // A changed target adds a fresh layer (starting transparent) and tells every
  // existing layer to fade out. A null target just fades everything out.
  useEffect(() => {
    const nextUrl = media?.url ?? null;
    if (nextUrl === currentUrl.current) return;
    currentUrl.current = nextUrl;

    setLayers((prev) => {
      const fadingOut = prev.map((layer) => ({ ...layer, visible: false }));
      if (!media) return fadingOut;
      const next: Layer = { ...media, id: ++idRef.current, visible: false };
      return [...fadingOut, next].slice(-3);
    });
  }, [media]);

  // Fade the newest layer up shortly after it has painted at zero. A timeout
  // (not requestAnimationFrame) so the fade still starts in a backgrounded or
  // otherwise un-composited tab, where rAF is throttled to a halt.
  useEffect(() => {
    const newest = layers[layers.length - 1];
    if (!newest || newest.visible || newest.url !== currentUrl.current) return;
    const timer = setTimeout(
      () => setLayers((prev) => prev.map((l) => (l.id === newest.id ? { ...l, visible: true } : l))),
      30,
    );
    return () => clearTimeout(timer);
  }, [layers]);

  // Safety net: drop faded-out layers even if their transitionend never lands
  // (again, an un-composited tab), keeping the newest around while it fades in.
  useEffect(() => {
    if (!layers.some((l) => !l.visible)) return;
    const timer = setTimeout(
      () => setLayers((prev) => prev.filter((l) => l.visible || l.id === idRef.current)),
      800,
    );
    return () => clearTimeout(timer);
  }, [layers]);

  if (layers.length === 0) return null;

  const drop = (id: number) => setLayers((prev) => prev.filter((l) => l.id !== id));

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      {layers.map((layer) => {
        const onFadedOut = (event: React.TransitionEvent) => {
          if (event.propertyName === 'opacity' && !layer.visible) drop(layer.id);
        };

        return layer.type === 'image' ? (
          <div
            key={layer.id}
            onTransitionEnd={onFadedOut}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-[600ms] ease-out animate-bg-drift"
            style={{ backgroundImage: `url(${layer.url})`, opacity: layer.visible ? IMAGE_OPACITY : 0 }}
          />
        ) : (
          <video
            key={layer.id}
            src={layer.url}
            onTransitionEnd={onFadedOut}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[600ms] ease-out animate-bg-drift"
            style={{ opacity: layer.visible ? VIDEO_OPACITY : 0 }}
            autoPlay
            loop
            muted
            playsInline
          />
        );
      })}

      {/* Legibility scrims, matched to the ambient reel's treatment. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_50%_at_50%_45%,rgba(8,8,11,0.72),transparent_78%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c]/70 via-transparent to-[#0a0a0c]/80" />
    </div>
  );
}
