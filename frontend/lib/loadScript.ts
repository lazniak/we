/**
 * Loads a script once and resolves when its global is ready. Viewer libraries
 * (three.js, online-3d-viewer, niivue) are heavy, so they are pulled from
 * /vendor only when a matching file is actually previewed - never in the main
 * bundle.
 */
const cache = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const existing = cache.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      cache.delete(src);
      reject(new Error(`Nie udało się załadować ${src}`));
    };
    document.head.appendChild(script);
  });

  cache.set(src, promise);
  return promise;
}

export const VENDOR = {
  three: '/vendor/three.min.js',
  o3dv: '/vendor/o3dv.min.js',
  niivue: '/vendor/niivue.umd.js',
};
