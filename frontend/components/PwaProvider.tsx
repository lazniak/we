'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa';
import { promptInstallation, type InstallNavigator, type InstallPromptEvent } from '@/lib/pwa-install';

interface PwaState {
  installed: boolean;
  ready: boolean;
  canInstall: boolean;
  /** The browser installs from its own prompt, which may still be on its way. */
  promptExpected: boolean;
  platform: InstallPlatform;
  userAgent: string;
  install(): Promise<boolean>;
}

/** The offer kept by the inline script in app/layout.tsx. */
type InstallWindow = Window & { __hexartInstallPrompt?: InstallPromptEvent | null };
type RelatedAppsNavigator = Navigator & { getInstalledRelatedApps?(): Promise<unknown[]> };

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
  const [canInstall, setCanInstall] = useState(false);
  const [promptExpected, setPromptExpected] = useState(false);
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
      setCanInstall(true);
    };
    // Chrome often makes its offer before hydration; the head script kept it.
    const adoptKeptPrompt = () => {
      const kept = (window as InstallWindow).__hexartInstallPrompt;
      if (!kept) return;
      promptRef.current = kept;
      setCanInstall(true);
    };
    const onInstalled = () => {
      promptRef.current = null;
      setInstalled(true);
      setCanInstall(false);
    };

    const platformName = detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
    setUserAgent(navigator.userAgent);
    setCanInstall(typeof (navigator as Navigator & InstallNavigator).install === 'function');
    setPlatform(platformName);
    setPromptExpected(platformName !== 'ios' && 'onbeforeinstallprompt' in window);
    adoptKeptPrompt();
    updateInstalled();
    updateConnection();
    setReady(true);
    // Already installed on this device: Chrome sends no offer then, so the
    // button would only lead to instructions. Hide it instead.
    void (navigator as RelatedAppsNavigator).getInstalledRelatedApps?.()
      .then((apps) => { if (apps.length) setInstalled(true); })
      .catch(() => {});
    display.addEventListener('change', updateInstalled);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('hexart-installable', adoptKeptPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    const updateWorker = () => { void registration?.update().catch(() => {}); };
    // Development chunks keep fixed names, so a worker would pin stale code.
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((all) => Promise.all(all.map((worker) => worker.unregister()))).catch(() => {});
    }
    // Updates never reload the page: an upload may be in progress.
    if ('serviceWorker' in navigator && window.isSecureContext && process.env.NODE_ENV === 'production') {
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
      window.removeEventListener('hexart-installable', adoptKeptPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('focus', updateWorker);
    };
  }, []);

  const install = useCallback(async () => {
    const event = promptRef.current;
    promptRef.current = null; // A browser prompt can only be used once.
    (window as InstallWindow).__hexartInstallPrompt = null;
    const browser = navigator as Navigator & InstallNavigator;
    const result = await promptInstallation(event, browser);
    setCanInstall(promptRef.current !== null || (result && typeof browser.install === 'function'));
    return result;
  }, []);

  return (
    <PwaContext.Provider value={{ installed, ready, canInstall, promptExpected, platform, userAgent, install }}>
      {children}
      {offline && (
        <p role="status" className="fixed inset-x-4 top-3 z-50 mx-auto max-w-md border border-white/15 bg-[#141418] px-4 py-3 text-center text-xs text-[#b0b8c4] shadow-xl">
          Brak połączenia. Wysyłanie i odbiór plików wymagają internetu.
        </p>
      )}
    </PwaContext.Provider>
  );
}
