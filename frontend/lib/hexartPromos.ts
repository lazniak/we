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
 * Rotating studio promos. Each card names a problem the visitor actually has -
 * bluntly, in the headline - answers it in one short line, and links straight
 * to the matching section on hexart.pl (services, solution landing pages or
 * case studies from the sitemap). Simple, direct language: the question does
 * the selling, the answer stays short.
 *
 * A few cards speak to a specific persona (streamer, journalist, museum); their
 * artwork slots (facemapping / live / history) are reused to illustrate that
 * need, so the banner still matches the copy.
 */
export const HEXART_PROMOS: Promo[] = [
  {
    kicker: 'Automatyzacja',
    title: 'Ręcznie robisz oferty, faktury i raporty?',
    body: 'AI przejmie tę powtarzalną robotę. Wdrożenie w tydzień, nie w rok.',
    cta: 'Zobacz, co zautomatyzować',
    href: 'https://hexart.pl/lp/automatyzacja-sprzedazy',
    art: 'automation',
  },
  {
    kicker: 'Voice AI',
    title: 'Nie odbierasz — klient dzwoni do konkurencji?',
    body: 'Głosowy agent odbiera każdy telefon, umawia spotkania i notuje w CRM.',
    cta: 'Posłuchaj, jak gada',
    href: 'https://hexart.pl/lp/kalendarz-voicebot',
    art: 'voice',
  },
  {
    kicker: 'Wiedza firmowa',
    title: 'Pół dnia schodzi na szukanie dokumentów?',
    body: 'AI zna wszystkie pliki firmy i odpowiada od ręki. Z podaniem źródła.',
    cta: 'Zobacz, jak to działa',
    href: 'https://hexart.pl/lp/wiedza-pracownika',
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
    kicker: 'Streaming',
    title: 'Jesteś streamerem?',
    body: 'Damy Ci grafikę 3D i efekty na twarzy na żywo. Zero opóźnień.',
    cta: 'Zobacz technologię',
    href: 'https://hexart.pl/case-studies/facemapping',
    art: 'facemapping',
  },
  {
    kicker: 'Dziennikarstwo',
    title: 'Jesteś dziennikarzem?',
    body: 'AI przekopie setki stron źródeł i poda fakty z cytatami. W minuty, nie dni.',
    cta: 'Zobacz, jak to działa',
    href: 'https://hexart.pl/lp/prywatna-baza-wiedzy-rag',
    art: 'live',
  },
  {
    kicker: 'Kultura / Muzea',
    title: 'Tworzysz muzeum i szukasz innowacji?',
    body: 'Zbudujemy interaktywną instalację i immersyjną oś czasu. Zwiedzający jej dotknie.',
    cta: 'Zobacz instalacje',
    href: 'https://hexart.pl/uslugi/xr',
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
    kicker: 'Bez ściemy',
    title: 'AI? Ale po co to komu?',
    body: 'Żeby ludzie robili to, co ważne — a nudną, powtarzalną robotę wziął komputer.',
    cta: 'Zobacz przykłady',
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
