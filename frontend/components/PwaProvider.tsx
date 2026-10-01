'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installed: boolean;
  ready: boolean;
  platform: InstallPlatform;
  userAgent: string;
  install(): Promise<boolean>;
}

const PwaContext = createContext<PwaState | null>(null);

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) throw new Error('PWA controls require PwaProvider');
  return context;
}

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  const promptRef = useRef<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>('desktop');
  const [userAgent, setUserAgent] = useState('');

  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)');
    const updateInstalled = () => setInstalled(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const updateConnection = () => setOffline(!navigator.onLine);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPromptEvent;
    };
    const onInstalled = () => {
      promptRef.current = null;
      setInstalled(true);
    };

    setUserAgent(navigator.userAgent);
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
    updateInstalled();
    updateConnection();
    setReady(true);
    display.addEventListener('change', updateInstalled);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    const updateWorker = () => { void registration?.update().catch(() => {}); };
    // Updates never reload the page: an upload may be in progress.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((value) => {
          if (disposed) return;
          registration = value;
          window.addEventListener('focus', updateWorker);
        }).catch(() => {});
    }

    return () => {
      disposed = true;
      display.removeEventListener('change', updateInstalled);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('focus', updateWorker);
    };
  }, []);

  const install = useCallback(async () => {
    const event = promptRef.current;
    if (!event) return false;
    promptRef.current = null; // A browser prompt can only be used once.
    try {
      await event.prompt();
      await event.userChoice;
      return true; // Dismissal is respected; do not show a second prompt.
    } catch {
      return false;
    }
  }, []);

  return (
    <PwaContext.Provider value={{ installed, ready, platform, userAgent, install }}>
      {children}
      {offline && (
        <p role="status" className="fixed inset-x-4 top-3 z-50 mx-auto max-w-md border border-white/15 bg-[#141418] px-4 py-3 text-center text-xs text-[#b0b8c4] shadow-xl">
          Brak połączenia. Wysyłanie i odbiór plików wymagają internetu.
        </p>
      )}
    </PwaContext.Provider>
  );
}
