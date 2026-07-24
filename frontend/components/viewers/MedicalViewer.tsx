'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loadScript, VENDOR } from '@/lib/loadScript';

type NiivueGlobal = typeof globalThis & { niivue?: { Niivue: new (opts?: unknown) => any } };

/**
 * Medical imaging viewer (X-ray, CT, MRI) backed by NiiVue, loaded from
 * /vendor on demand. It reads DICOM, NIfTI, MGH, MHA/MHD, NRRD and more, and
 * renders 2D slices as well as volumes. The asset URL carries the real
 * filename so NiiVue can pick the right loader.
 */
export default function MedicalViewer({ url, name }: { url: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let nv: any = null;

    (async () => {
      try {
        await loadScript(VENDOR.niivue);
      } catch {
        setError(true);
        return;
      }

      const ns = (window as NiivueGlobal).niivue;
      const canvas = canvasRef.current;
      if (!ns?.Niivue || !canvas || disposed) return;

      try {
        nv = new ns.Niivue({
          backColor: [0.043, 0.043, 0.055, 1],
          show3Dcrosshair: true,
          loadingText: '',
        });
        await nv.attachToCanvas(canvas);
        await nv.loadVolumes([{ url, name }]);
        if (!disposed) setLoading(false);
      } catch (err) {
        console.error('NiiVue failed:', err);
        if (!disposed) setError(true);
      }
    })();

    return () => {
      disposed = true;
      try {
        nv?.closeDrawing?.();
      } catch {
        /* ignore */
      }
    };
  }, [url, name]);

  return (
    <div className="relative w-[min(92vw,64rem)] h-[75vh] rounded-lg overflow-hidden bg-[#0b0b0e]">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <Loader2 className="w-6 h-6 text-accent/60 animate-spin" />
          <span className="text-xs text-white/40">Wczytywanie obrazu medycznego…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/40 text-center px-6">
          Nie udało się wczytać obrazu medycznego. Format może nie być obsługiwany —
          pobierz plik, aby otworzyć go w dedykowanym oprogramowaniu.
        </div>
      )}
      {!loading && !error && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-white/40 bg-black/40 px-3 py-1 rounded-full pointer-events-none">
          Obraz medyczny · przewijaj warstwy · przeciągnij, aby zmienić kontrast
        </div>
      )}
    </div>
  );
}
