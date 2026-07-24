'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadScript, VENDOR } from '@/lib/loadScript';

type OvGlobal = typeof globalThis & { OV?: any };

/**
 * 3D model viewer, backed by Online3DViewer (loaded from /vendor on demand).
 * It covers a broad set of formats - glTF/GLB, OBJ, STL, PLY, FBX, 3MF, STEP,
 * IFC and more. The asset URL carries the real filename so O3DV can pick the
 * right loader by extension.
 */
export default function ModelViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let viewer: any = null;

    (async () => {
      try {
        await loadScript(VENDOR.o3dv);
      } catch {
        setError(true);
        return;
      }

      const OV = (window as OvGlobal).OV;
      const container = containerRef.current;
      if (!OV || !container || disposed) return;

      // Mesh formats (glTF, GLB, OBJ, STL, PLY, FBX, 3MF, DAE, …) need nothing
      // extra. CAD/parametric formats want wasm helpers; point at them if we
      // have vendored them, otherwise those specific formats simply will not
      // render while everything else does.
      try {
        OV.SetExternalLibLocation?.('/vendor/o3dv-libs');
      } catch {
        /* older builds bundle everything */
      }

      viewer = new OV.EmbeddedViewer(container, {
        backgroundColor: new OV.RGBAColor(11, 11, 14, 255),
        defaultColor: new OV.RGBColor(200, 200, 210),
        onModelLoaded: () => {
          if (!disposed) setLoading(false);
        },
      });

      try {
        viewer.LoadModelFromUrlList([url]);
      } catch {
        setError(true);
      }

      // O3DV has no reliable failure callback for a bad URL; fail open after a while.
      window.setTimeout(() => {
        if (!disposed) setLoading((prev) => (prev ? (setError(true), false) : prev));
      }, 30_000);
    })();

    return () => {
      disposed = true;
      try {
        viewer?.Destroy?.();
      } catch {
        /* ignore */
      }
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [url]);

  return (
    <div className="relative w-[min(96vw,88rem)] h-[86vh] rounded-lg overflow-hidden bg-[#0b0b0e]">
      <div ref={containerRef} className="w-full h-full" />
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Loader2 className="w-6 h-6 text-accent/60 animate-spin" />
          <span className="text-xs text-white/40">Wczytywanie modelu 3D…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/40">
          Nie udało się wczytać modelu 3D.
        </div>
      )}
      {!loading && !error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/40 bg-black/40 px-3 py-1 rounded-full pointer-events-none">
          Model 3D · obróć myszą · scroll przybliża
        </div>
      )}
    </div>
  );
}
