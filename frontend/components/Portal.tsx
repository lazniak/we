'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders its children straight into <body>, so a fullscreen layer escapes any
 * ancestor that would trap it. A `.glass` card's `backdrop-filter` establishes
 * a containing block, which otherwise clips a `position: fixed` modal to the
 * card's box instead of the viewport - that was why the preview and terms
 * modals only covered the card they opened from.
 *
 * While mounted it also freezes body scroll and compensates for the vanished
 * scrollbar, so the page behind does not shift as the modal opens.
 */
export default function Portal({
  children,
  lockScroll = true,
}: {
  children: React.ReactNode;
  lockScroll?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!lockScroll || !mounted) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    const prevPadding = style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    style.overflow = 'hidden';
    if (gap > 0) style.paddingRight = `${gap}px`;
    return () => {
      style.overflow = prevOverflow;
      style.paddingRight = prevPadding;
    };
  }, [lockScroll, mounted]);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
