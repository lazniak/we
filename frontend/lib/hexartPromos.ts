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
 * Rotating studio promos. Automation leads, because that is the core of the
 * business, but the pool is deliberately varied so a returning visitor keeps
 * learning something new instead of reading the same banner twice.
 *
 * Every entry pairs a concrete claim - a capability, a shipped project, a
 * number - with its own artwork, so the card sells at a glance.
 */
export const HEXART_PROMOS: Promo[] = [
  {
    kicker: 'Automatyzacja',
    title: 'Robisz to ręcznie? Algorytm zrobi to za Ciebie.',
    body: 'Ofertowanie, faktury, obsługa zapytań, raporty. Projektujemy systemy AI szyte pod konkretny proces — proste narzędzie wdrażamy w tydzień.',
    cta: 'Zobacz, co da się zautomatyzować',
    href: 'https://hexart.pl/lp/automatyzacja-sprzedazy',
    art: 'automation',
  },
  {
    kicker: 'Voice AI',
    title: 'Agent głosowy, który naprawdę rozmawia z klientem',
    body: 'Odbiera, kwalifikuje, umawia i wpisuje do CRM-u. Nie infolinia z drzewkiem wyboru, tylko rozmowa — o każdej porze i bez kolejki.',
    cta: 'Posłuchaj, jak to działa',
    href: 'https://hexart.pl/uslugi/ai',
    art: 'voice',
  },
  {
    kicker: 'RAG / wiedza firmowa',
    title: 'Cała wiedza firmy w jednym pytaniu',
    body: 'Umowy, procedury, oferty, maile z lat. Budujemy prywatny model, który odpowiada z Twoich dokumentów — na Twoim serwerze.',
    cta: 'Zapytaj o wdrożenie',
    href: 'https://hexart.pl/lp/konsulting-ai',
    art: 'rag',
  },
  {
    kicker: 'Case study · Jetson',
    title: 'Zbudowaliśmy symulator lotu drona pasażerskiego',
    body: 'Pełne VR z platformą ruchową i realną fizyką lotu Jetson ONE. Zrobił to ten sam zespół, który przed chwilą przesłał Ci te pliki.',
    cta: 'Zobacz projekt',
    href: 'https://hexart.pl/case-studies/jetson',
    art: 'jetson',
  },
  {
    kicker: 'Case study · Wojna 1939',
    title: 'Pierwszy polski serial zrobiony z pomocą AI',
    body: 'Autorskie oprogramowanie i pipeline HEXART. Top 11 na świecie w kategorii Action w Chroma Awards.',
    cta: 'Przeczytaj case study',
    href: 'https://hexart.pl/case-studies/wojna-1939',
    art: 'film',
  },
  {
    kicker: 'Produkcja wideo',
    title: 'Kino reklamowe, nie „materiał na social media”',
    body: 'Zdjęcia na kamerach RED, CGI i postprodukcja. Spoty TVC i B2B, które wyglądają jak budżet dwa razy większy niż faktyczny.',
    cta: 'Obejrzyj realizacje',
    href: 'https://hexart.pl/uslugi/film',
    art: 'video',
  },
  {
    kicker: 'XR / VR',
    title: 'Salon sprzedaży, do którego klient wchodzi z fotela',
    body: 'Wirtualne showroomy, symulatory szkoleniowe 3D i interaktywne przestrzenie marki. Produkt można obejrzeć, zanim powstanie.',
    cta: 'Wejdź do środka',
    href: 'https://hexart.pl/uslugi/xr',
    art: 'xr',
  },
  {
    kicker: 'Live · FaceMapping',
    title: 'Cyfrowy makijaż na oczach milionów widzów',
    body: 'Śledzenie twarzy 3D w czasie rzeczywistym, na żywej antenie, bez opóźnienia. Technologia, którą zbudowaliśmy dla telewizji.',
    cta: 'Zobacz jak',
    href: 'https://hexart.pl/case-studies/facemapping',
    art: 'facemapping',
  },
  {
    kicker: 'live.hexart.io',
    title: 'Transmisja i grafika real-time pod jednym panelem',
    body: 'Nasza platforma do streamingu i sterowania grafiką na żywo. Zbudowana tak, żeby produkcja nie zależała od ludzkiego refleksu.',
    cta: 'Zajrzyj na live.hexart.io',
    href: 'https://live.hexart.io',
    art: 'live',
  },
  {
    kicker: 'omnihistory.space',
    title: 'Historia świata jako jedna mapa czasu',
    body: 'Nasz projekt własny — interaktywna oś dziejów napędzana AI. Dowód, że te same narzędzia działają na naprawdę dużych zbiorach danych.',
    cta: 'Odwiedź omnihistory.space',
    href: 'https://omnihistory.space',
    art: 'history',
  },
  {
    kicker: 'E-commerce',
    title: 'Ceny, które same reagują na rynek',
    body: 'Repricing, opisy produktów, packshoty i obsługa zwrotów. Sklep pracuje w nocy, Ty rano czytasz podsumowanie.',
    cta: 'Zobacz rozwiązania',
    href: 'https://hexart.pl/lp/automatyzacja-sprzedazy',
    art: 'ecommerce',
  },
  {
    kicker: 'Branding',
    title: 'Marka, która wygląda drożej niż kosztowała',
    body: 'Logotyp, pełny system identyfikacji i corporate design 360°. Robimy to od 2004 roku — zanim stało się to modne.',
    cta: 'Zobacz nasze marki',
    href: 'https://hexart.pl/uslugi/marki',
    art: 'branding',
  },
  {
    kicker: 'Grafika AI',
    title: 'Generator obrazów wytrenowany na Twojej marce',
    body: 'Nie stockowe „coś w tym stylu”, tylko model znający Twoje produkty, kolory i sposób kadrowania. Zasoby na kampanię w godzinę.',
    cta: 'Wypróbuj generator',
    href: 'https://hexart.pl/lp/generator-obrazow-ai',
    art: 'genai',
  },
  {
    kicker: '20 lat na rynku',
    title: 'Agencja, która pamięta czasy przed AI',
    body: 'Od 2004 roku w produkcji i w biznesie. Dlatego wiemy, które procesy warto zautomatyzować, a które tylko wyglądają na kandydatów.',
    cta: 'Poznaj HEXART',
    href: 'https://hexart.pl/#about',
    art: 'heritage',
  },
  {
    kicker: 'Porozmawiajmy',
    title: 'Powiedz, co Cię najbardziej spowalnia',
    body: 'Zwykle wystarczy jedna rozmowa, żeby ocenić, czy problem da się zdjąć z ludzi. Wycena i harmonogram bez zobowiązań.',
    cta: 'Napisz do nas',
    href: 'https://hexart.pl/#contact',
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
