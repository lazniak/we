const NUMBER = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const NUMBER_1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

/**
 * Polish plurals need three forms: 1 plik, 2-4 pliki, 5+ plików - and the
 * 12-14 range takes the last form despite ending in 2-4.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;

  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const k = 1024;
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);

  const formatter = i === 0 ? new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 })
    : decimals === 1 ? NUMBER_1
    : NUMBER;

  return `${formatter.format(value)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '';
  return `${formatBytes(bytesPerSecond, 1)}/s`;
}

/** Remaining upload time, e.g. "została 1 min 20 s". */
export function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '';

  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} godz. ${rest} min` : `${hours} godz.`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Compact countdown to expiry: "3 dni", "5 godz.", "12 min". */
export function formatRemaining(dateString: string): string {
  const diffMs = new Date(dateString).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'wygasł';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    const value = Math.max(1, minutes);
    return `${value} ${plural(value, 'minuta', 'minuty', 'minut')}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${plural(hours, 'godzina', 'godziny', 'godzin')}`;

  const days = Math.round(hours / 24);
  return `${days} ${plural(days, 'dzień', 'dni', 'dni')}`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${NUMBER_1.format(num / 1_000_000)} mln`;
  if (num >= 1_000) return `${NUMBER_1.format(num / 1_000)} tys.`;
  return NUMBER.format(num);
}
