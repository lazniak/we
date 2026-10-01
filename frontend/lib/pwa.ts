export type InstallPlatform = 'ios' | 'android' | 'mac' | 'desktop';

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS can advertise a desktop Macintosh user agent.
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  return 'desktop';
}

export function installInstructions(platform: InstallPlatform, userAgent: string) {
  if (platform === 'ios') return {
    device: /iPhone|iPod/i.test(userAgent) ? 'iPhone' : 'iPad',
    steps: [
      'Otwórz transfer.hexart.io w Safari.',
      'Wybierz Udostępnij. Zależnie od układu Safari znajdziesz tę opcję na pasku lub w menu strony.',
      'Wybierz Dodaj do ekranu początkowego. Jeśli opcji brakuje, dodaj ją przez Edytuj czynności.',
      'Włącz Otwórz jako aplikację, jeśli ta opcja jest widoczna, i wybierz Dodaj.',
    ],
    note: 'Aplikację uruchomisz z ikony na ekranie początkowym.',
    helpUrl: 'https://support.apple.com/pl-pl/guide/iphone/iph42ab2f3a7/ios',
  };
  if (platform === 'mac' && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR/i.test(userAgent)) return {
    device: 'Mac · Safari',
    steps: [
      'Otwórz transfer.hexart.io w Safari.',
      'W menu Plik wybierz Dodaj do Docka. Ta opcja jest też w menu Udostępnij.',
      'Potwierdź nazwę HEXART Transfer i wybierz Dodaj.',
    ],
    note: 'Wymaga macOS Sonoma 14 lub nowszego. Na starszym systemie użyj Chrome lub Edge.',
    helpUrl: 'https://support.apple.com/pl-pl/104996',
  };
  if (platform === 'android') return {
    device: 'Android',
    steps: [
      'Otwórz transfer.hexart.io w Chrome.',
      'W menu przeglądarki wybierz Zainstaluj aplikację lub Dodaj do ekranu początkowego.',
      'Potwierdź instalację. Aplikację uruchomisz z jej ikony.',
    ],
    note: 'Nazwa opcji zależy od przeglądarki. Jeśli jej nie widzisz, otwórz stronę w aktualnym Chrome.',
    helpUrl: undefined,
  };
  return {
    device: platform === 'mac' ? 'Mac' : /Windows/i.test(userAgent) ? 'Windows' : 'Komputer',
    steps: [
      'Otwórz transfer.hexart.io w Chrome lub Edge.',
      'Wybierz ikonę instalacji przy pasku adresu albo opcję instalacji w menu przeglądarki.',
      'Potwierdź instalację HEXART Transfer.',
    ],
    note: /Firefox/i.test(userAgent)
      ? 'Jeśli w Firefox nie ma opcji instalacji, użyj Chrome lub Edge.'
      : 'Jeśli opcji jeszcze nie ma, odśwież stronę i sprawdź menu przeglądarki.',
    helpUrl: undefined,
  };
}
