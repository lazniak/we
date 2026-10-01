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
 *
 * Every claim about the studio comes from the brandbook (marka.md): years,
 * projects and what was done in them. Nothing here may be rounded up or made
 * up; a case study card names only what that project actually delivered.
 */
export const HEXART_PROMOS: Promo[] = [
  {
    kicker: 'AI · Automatyzacja',
    title: 'Automatyzuj powtarzalną pracę.',
    body: 'Tworzymy systemy AI do ofert, raportów i obsługi danych. Najpierw pokazujemy działający prototyp.',
    cta: 'Zobacz rozwiązanie',
    href: 'https://hexart.pl/lp/automatyzacja-sprzedazy',
    art: 'automation',
  },
  {
    kicker: 'AI · Asystent głosowy',
    title: 'Rozmowa, która trafia do kalendarza.',
    body: 'Łączymy asystenta głosowego z kalendarzem i CRM. Zobacz, jak działa rezerwacja podczas rozmowy.',
    cta: 'Zobacz asystenta',
    href: 'https://hexart.pl/lp/kalendarz-voicebot',
    art: 'voice',
  },
  {
    kicker: 'AI · Wiedza firmowa',
    title: 'Wiedza firmy. Z podaniem źródeł.',
    body: 'Łączymy dokumenty w bazę wiedzy. Asystent wskazuje źródła odpowiedzi, żeby można było je sprawdzić.',
    cta: 'Zobacz rozwiązanie',
    href: 'https://hexart.pl/lp/wiedza-pracownika',
    art: 'rag',
  },
  {
    kicker: 'XR · Jetson ONE',
    title: 'Cyfrowy bliźniak Jetson ONE.',
    body: 'Dla Jetson ONE zbudowaliśmy cyfrowy bliźniak eVTOL w Unreal Engine, połączony z platformą ruchową i goglami VR.',
    cta: 'Zobacz projekt',
    href: 'https://hexart.pl/case-studies/jetson',
    art: 'jetson',
  },
  {
    kicker: 'Film · Wojna1939.pl',
    title: 'Pipeline dla Wojna1939.pl.',
    body: 'Do prequela Wojna1939.pl stworzyliśmy oprogramowanie pipeline’u i wygenerowaliśmy sekwencje serialu.',
    cta: 'Zobacz projekt',
    href: 'https://hexart.pl/case-studies/wojna-1939',
    art: 'wojna1939',
  },
  {
    kicker: 'Film',
    title: 'Film zaczyna się od historii.',
    body: 'Realizujemy filmy i reklamy: scenariusz, zdjęcia, montaż i kolor. Technologia służy temu, co widz ma zobaczyć.',
    cta: 'Obejrzyj realizacje',
    href: 'https://hexart.pl/uslugi/film',
    art: 'film',
  },
  {
    kicker: 'Film · Narzędzia AI',
    title: 'Powtarzalny proces produkcji wideo.',
    body: 'Budujemy narzędzia do przygotowania i montażu materiałów. Dopasowujemy proces do formatu, treści i kanału.',
    cta: 'Zobacz proces',
    href: 'https://hexart.pl/lp/automatyzacja-wideo',
    art: 'video',
  },
  {
    kicker: 'XR',
    title: 'Pokaż produkt w przestrzeni.',
    body: 'Projektujemy światy XR i interaktywne prezentacje. Produkt można obejrzeć, zanim powstanie jego fizyczna wersja.',
    cta: 'Zobacz światy XR',
    href: 'https://hexart.pl/uslugi/xr',
    art: 'xr',
  },
  {
    kicker: 'XR · FaceMapping',
    title: 'Obraz na twarzy. Na żywo.',
    body: 'W 2016 roku nasz zespół realizował face mapping na żywo w finale talent show. Zobacz, jak obraz pracuje z ruchem twarzy.',
    cta: 'Zobacz projekt',
    href: 'https://hexart.pl/case-studies/facemapping',
    art: 'facemapping',
  },
  {
    kicker: 'AI · Źródła',
    title: 'Źródła pod ręką.',
    body: 'Pomagamy przeszukiwać i porządkować archiwa. Odpowiedź prowadzi do dokumentu, który można sprawdzić.',
    cta: 'Zobacz bazę wiedzy',
    href: 'https://hexart.pl/lp/prywatna-baza-wiedzy-rag',
    art: 'live',
  },
  {
    kicker: 'XR · Kultura',
    title: 'Historia, której można doświadczyć.',
    body: 'Łączymy obraz, dźwięk i interakcję w instalacjach XR. Projekt zaczynamy od historii i odbiorcy.',
    cta: 'Zobacz instalacje XR',
    href: 'https://hexart.pl/uslugi/xr',
    art: 'history',
  },
  {
    kicker: 'AI · Ceny',
    title: 'Ceny pod Twoją kontrolą.',
    body: 'Narzędzia AI śledzą zmiany cen i wspierają decyzje. Reguły ustalasz Ty.',
    cta: 'Zobacz rozwiązanie',
    href: 'https://hexart.pl/lp/snajper-cen-ai',
    art: 'ecommerce',
  },
  {
    kicker: 'Brand',
    title: 'Marka spójna w każdym miejscu.',
    body: 'Projektujemy identyfikację wizualną i zasady jej stosowania. Od znaku po materiały, które trafiają do odbiorcy.',
    cta: 'Zobacz identyfikacje',
    href: 'https://hexart.pl/uslugi/marki',
    art: 'branding',
  },
  {
    kicker: 'AI · Obraz',
    title: 'Obrazy zgodne z Twoją marką.',
    body: 'Budujemy proces tworzenia obrazów z pomocą AI. Ustalamy kierunek wizualny, pracujemy na referencjach i sprawdzamy spójność.',
    cta: 'Zobacz proces',
    href: 'https://hexart.pl/lp/generator-obrazow-ai',
    art: 'genai',
  },
  {
    kicker: 'Konsultacja',
    title: 'Zacznij od działającego prototypu.',
    body: 'Pokażemy działającą rzecz, zanim zaczniemy o niej opowiadać. Porozmawiajmy o Twoim projekcie.',
    cta: 'Umów konsultację',
    href: 'https://hexart.pl/rezerwacja',
    art: 'paul',
  },
  {
    kicker: 'HEXART',
    title: 'Inżynieryjna precyzja. Artystyczna wizja.',
    body: 'Film, XR, AI i Brand. Od 2006 roku w produkcji, od 2020 jako HEXART.',
    cta: 'Poznaj nasze systemy AI',
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
