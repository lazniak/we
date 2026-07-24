'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadScript, VENDOR } from '@/lib/loadScript';

/* three.js is loaded from /vendor and exposes a global; typed loosely here. */
type ThreeGlobal = typeof globalThis & { THREE?: any };

/**
 * Equirectangular 360 viewer: the media is painted onto the inside of a sphere
 * and the camera sits at its centre. Drag to look around, scroll to zoom.
 * Works for both photos (TextureLoader) and videos (VideoTexture).
 */
export default function PanoViewer({ url, type }: { url: string; type: 'image' | 'video' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    const disposers: (() => void)[] = [];

    (async () => {
      try {
        await loadScript(VENDOR.three);
      } catch {
        setError(true);
        return;
      }

      const THREE = (window as ThreeGlobal).THREE;
      const container = containerRef.current;
      if (!THREE || !container || disposed) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1100);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      const geometry = new THREE.SphereGeometry(500, 64, 40);
      geometry.scale(-1, 1, 1); // flip so the texture faces inward

      let video: HTMLVideoElement | null = null;
      let texture: any;

      if (type === 'video') {
        video = document.createElement('video');
        video.src = url;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.play().catch(() => undefined);
        texture = new THREE.VideoTexture(video);
      } else {
        texture = await new Promise((resolve, reject) =>
          new THREE.TextureLoader().load(url, resolve, undefined, reject),
        ).catch(() => null);
        if (!texture) {
          setError(true);
          return;
        }
      }
      if (disposed) return;
      if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;

      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
      scene.add(mesh);
      setLoading(false);

      let lon = 0;
      let lat = 0;
      let autoRotate = true;
      let dragging = false;
      let px = 0;
      let py = 0;
      let fov = 75;

      const el = renderer.domElement;
      const onDown = (e: PointerEvent) => {
        dragging = true;
        autoRotate = false;
        px = e.clientX;
        py = e.clientY;
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        lon -= (e.clientX - px) * 0.15;
        lat += (e.clientY - py) * 0.15;
        lat = Math.max(-85, Math.min(85, lat));
        px = e.clientX;
        py = e.clientY;
      };
      const onUp = () => {
        dragging = false;
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        fov = Math.max(30, Math.min(100, fov + e.deltaY * 0.05));
        camera.fov = fov;
        camera.updateProjectionMatrix();
      };
      const onResize = () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      el.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      el.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', onResize);

      disposers.push(() => {
        el.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        el.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        geometry.dispose();
        texture.dispose?.();
        if (video) video.src = '';
        el.remove();
      });

      const animate = () => {
        raf = requestAnimationFrame(animate);
        if (autoRotate) lon += 0.03;
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        camera.lookAt(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi),
          500 * Math.sin(phi) * Math.sin(theta),
        );
        renderer.render(scene, camera);
      };
      animate();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      disposers.forEach((fn) => fn());
    };
  }, [url, type]);

  return (
    <div className="relative w-[min(96vw,88rem)] h-[86vh] rounded-lg overflow-hidden bg-black">
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-6 h-6 text-accent/60 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/40">
          Nie udało się wczytać panoramy 360.
        </div>
      )}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/40 bg-black/40 px-3 py-1 rounded-full pointer-events-none">
        360° · przeciągnij, aby się rozejrzeć · scroll przybliża
      </div>
    </div>
  );
}
