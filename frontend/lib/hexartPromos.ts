import type { PromoArtKey } from '@/components/PromoArt';

export interface Promo {
  /** Small kicker above the headline. */
  kicker: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  /** Which banner artwork to draw. */
  art: PromoArtKey;
}

/**
 * Rotating studio promos. Each card opens with a plain question about a problem
 * the visitor might have, answers it in one short line, and links straight to
 * the matching section on hexart.pl (services, solution landing pages or case
 * studies from the sitemap). Simple language on purpose - the card has to sell
 * at a glance, so the question does the work and the answer stays short.
 *
 * The artwork key stays paired with the topic, so the banner illustrates the
 * exact need the copy talks about.
 */
export const HEXART_PROMOS: Promo[] = [
  {
    kicker: 'Automatyzacja',
    title: 'Za dużo klikania w kółko to samo?',
    body: 'Oferty, faktury, zapytania — system AI zrobi to za Ciebie. Wdrożenie w tydzień.',
    cta: 'Zobacz, co zautomatyzować',
    href: 'https://hexart.pl/lp/automatyzacja-sprzedazy',
    art: 'automation',
  },
  {
    kicker: 'Voice AI',
    title: 'Nie wyrabiasz z telefonami?',
    body: 'Głosowy asystent odbierze i umówi spotkanie. O każdej porze, bez kolejki.',
    cta: 'Posłuchaj, jak gada',
    href: 'https://hexart.pl/lp/kalendarz-voicebot',
    art: 'voice',
  },
  {
    kicker: 'Wiedza firmowa',
    title: 'Wiecznie szukasz tej jednej informacji?',
    body: 'Damy Ci wyszukiwarkę po wszystkich dokumentach firmy. Odpowiada w sekundę.',
    cta: 'Zobacz, jak to działa',
    href: 'https://hexart.pl/lp/prywatna-baza-wiedzy-rag',
    art: 'rag',
  },
  {
    kicker: 'Case study · Jetson',
    title: 'Klient mówi, że się nie da?',
    body: 'Zbudowaliśmy symulator lotu pasażerskiego drona w VR. Pokażemy, co jest możliwe.',
    cta: 'Zobacz projekt',
    href: 'https://hexart.pl/case-studies/jetson',
    art: 'jetson',
  },
  {
    kicker: 'Film',
    title: 'Reklama ma wyglądać drogo?',
    body: 'Nakręcimy spot na poziomie kina. Zdjęcia, CGI, montaż.',
    cta: 'Obejrzyj realizacje',
    href: 'https://hexart.pl/uslugi/film',
    art: 'film',
  },
  {
    kicker: 'Wideo AI',
    title: 'Potrzebujesz filmów bez końca?',
    body: 'Zautomatyzujemy produkcję wideo na social media i sklep. Seryjnie i szybko.',
    cta: 'Zobacz automatyzację wideo',
    href: 'https://hexart.pl/lp/automatyzacja-wideo',
    art: 'video',
  },
  {
    kicker: 'XR / VR',
    title: 'Chcesz pokazać produkt przed premierą?',
    body: 'Klient obejrzy go w VR i wejdzie do showroomu — prosto z fotela.',
    cta: 'Wejdź do środka',
    href: 'https://hexart.pl/uslugi/xr',
    art: 'xr',
  },
  {
    kicker: 'Live · FaceMapping',
    title: 'Robisz produkcję na żywo?',
    body: 'Nałożymy grafikę 3D na twarz w czasie rzeczywistym. Bez opóźnień, na antenie.',
    cta: 'Zobacz technologię',
    href: 'https://hexart.pl/case-studies/facemapping',
    art: 'facemapping',
  },
  {
    kicker: 'live.hexart.io',
    title: 'Transmitujesz wydarzenia na żywo?',
    body: 'Streaming i grafika w czasie rzeczywistym z jednego panelu. Nasza platforma live.',
    cta: 'Zajrzyj na live.hexart.io',
    href: 'https://live.hexart.io',
    art: 'live',
  },
  {
    kicker: 'omnihistory.space',
    title: 'Masz górę danych i zero czasu?',
    body: 'AI ogarnie duże zbiory — zrobiliśmy z nich interaktywną oś dziejów świata.',
    cta: 'Odwiedź omnihistory.space',
    href: 'https://omnihistory.space',
    art: 'history',
  },
  {
    kicker: 'Ceny / Repricing',
    title: 'Konkurencja co chwilę zmienia ceny?',
    body: '„Snajper cen” pilnuje rynku i przecenia za Ciebie. Automatycznie.',
    cta: 'Zobacz repricing',
    href: 'https://hexart.pl/lp/snajper-cen-ai',
    art: 'ecommerce',
  },
  {
    kicker: 'Marki',
    title: 'Marka wygląda taniej, niż jest warta?',
    body: 'Zrobimy logo i pełną identyfikację. Projektujemy marki od 2004 roku.',
    cta: 'Zobacz nasze marki',
    href: 'https://hexart.pl/uslugi/marki',
    art: 'branding',
  },
  {
    kicker: 'Grafika AI',
    title: 'Potrzebujesz mnóstwo grafik i packshotów?',
    body: 'Generator zna Twoją markę i zrobi je w godzinę. Nie stock.',
    cta: 'Wypróbuj generator',
    href: 'https://hexart.pl/lp/generator-obrazow-ai',
    art: 'genai',
  },
  {
    kicker: 'Konsultacja',
    title: 'Nie wiesz, co oddać AI?',
    body: 'Doradzimy, co zautomatyzować, a co zostawić. Jesteśmy w branży od 2004.',
    cta: 'Umów konsultację',
    href: 'https://hexart.pl/lp/konsulting-ai',
    art: 'heritage',
  },
  {
    kicker: 'Zacznij tu',
    title: 'Nie wiesz, od czego zacząć?',
    body: 'Wpisz swój problem, a pokażemy gotowe rozwiązanie AI.',
    cta: 'Przeglądaj rozwiązania',
    href: 'https://hexart.pl/uslugi/ai',
    art: 'contact',
  },
];

/** Random promo, avoiding the one shown a moment ago. */
export function pickPromo(previousIndex: number | null): { promo: Promo; index: number } {
  if (HEXART_PROMOS.length === 1) return { promo: HEXART_PROMOS[0], index: 0 };

  let index = Math.floor(Math.random() * HEXART_PROMOS.length);
  if (index === previousIndex) index = (index + 1) % HEXART_PROMOS.length;

  return { promo: HEXART_PROMOS[index], index };
}
