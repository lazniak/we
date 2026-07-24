/**
 * Terms of service. Kept as structured data so the same content renders on the
 * /regulamin page and in the acceptance modal.
 *
 * Bumping TERMS_VERSION invalidates every stored acceptance, forcing users to
 * accept again - do that only on a material change.
 */
export const TERMS_VERSION = '2026-07-24';
export const TERMS_EFFECTIVE = '24 lipca 2026';
export const TERMS_ACCEPT_KEY = 'hexart-terms-accepted';

export interface TermsSection {
  heading: string;
  paragraphs: string[];
}

export const TERMS_INTRO =
  'Niniejszy regulamin określa zasady korzystania z serwisu do przesyłania plików ' +
  'dostępnego pod adresem transfer.hexart.io („Serwis”). Operatorem Serwisu jest ' +
  'HEXART / Paul Laźniak („Operator”). Korzystanie z Serwisu, w tym rozpoczęcie ' +
  'jakiegokolwiek transferu, oznacza akceptację poniższych postanowień w całości. ' +
  'Osoby, które nie akceptują regulaminu, nie są uprawnione do korzystania z Serwisu.';

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: '1. Charakter usługi',
    paragraphs: [
      'Serwis jest udostępniany całkowicie nieodpłatnie, wyłącznie z dobrej woli Operatora, ' +
        'jako świadczenie grzecznościowe. Operator nie prowadzi z tego tytułu działalności ' +
        'zarobkowej wobec użytkowników i nie pobiera żadnych opłat.',
      'Korzystanie z Serwisu nie tworzy między użytkownikiem a Operatorem żadnego stosunku ' +
        'umownego o charakterze odpłatnym, zobowiązania do świadczenia usługi ani gwarancji ' +
        'jakiegokolwiek rezultatu. Operator nie zobowiązuje się do utrzymywania, rozwijania ' +
        'ani dalszego udostępniania Serwisu.',
      'Operator może w każdej chwili, według własnego uznania, bez podania przyczyny i bez ' +
        'uprzedzenia, zmienić zasady działania Serwisu, ograniczyć jego funkcje, zawiesić go ' +
        'lub całkowicie zakończyć jego działanie, jak również usunąć dowolne dane lub pliki.',
    ],
  },
  {
    heading: '2. Brak gwarancji',
    paragraphs: [
      'Serwis jest udostępniany „TAK JAK JEST” (as is) oraz „W MIARĘ DOSTĘPNOŚCI” ' +
        '(as available), ze wszystkimi ewentualnymi wadami. Operator w najszerszym zakresie ' +
        'dopuszczalnym przez prawo wyłącza wszelkie gwarancje i rękojmie, wyraźne i dorozumiane, ' +
        'w tym co do przydatności do określonego celu, ciągłości, niezawodności, bezpieczeństwa, ' +
        'poprawności działania oraz nienaruszania praw osób trzecich.',
      'Operator nie gwarantuje w szczególności: dostępności ani ciągłości działania Serwisu, ' +
        'zachowania, integralności, poufności ani możliwości odzyskania przesłanych plików, ' +
        'dostarczenia pliku do odbiorcy, czasu przechowywania danych, ani tego, że Serwis będzie ' +
        'wolny od błędów, przerw, utraty danych lub złośliwego oprogramowania.',
      'Pliki są automatycznie i trwale usuwane po upływie okresu ważności linku, a także mogą ' +
        'zostać usunięte wcześniej w dowolnym momencie. Operator nie tworzy kopii zapasowych. ' +
        'Użytkownik jest zobowiązany zachować własną kopię przesyłanych danych i nie traktować ' +
        'Serwisu jako miejsca przechowywania ani archiwizacji.',
    ],
  },
  {
    heading: '3. Wyłączenie odpowiedzialności',
    paragraphs: [
      'W najszerszym zakresie dopuszczalnym przez obowiązujące prawo Operator nie ponosi ' +
        'wobec użytkownika ani osób trzecich żadnej odpowiedzialności za jakiekolwiek szkody ' +
        'majątkowe i niemajątkowe, bezpośrednie i pośrednie, w tym za utracone korzyści, utratę, ' +
        'uszkodzenie, ujawnienie lub niedostarczenie danych, przerwy w działaniu, ani za skutki ' +
        'korzystania lub niemożności korzystania z Serwisu — niezależnie od podstawy prawnej ' +
        'roszczenia.',
      'Powyższe ograniczenie obejmuje również szkody wynikłe z działania osób trzecich, awarii ' +
        'infrastruktury, błędów oprogramowania, utraty danych oraz z przechwycenia lub ' +
        'nieuprawnionego dostępu do przesyłanych plików.',
      'Korzystanie z Serwisu odbywa się wyłącznie na własne ryzyko użytkownika. Jeżeli ' +
        'obowiązujące prawo nie dopuszcza wyłączenia którejś z powyższych odpowiedzialności, ' +
        'odpowiedzialność Operatora ograniczona jest do najmniejszego zakresu i najniższej ' +
        'kwoty dopuszczalnej przez prawo, przy czym z uwagi na nieodpłatny charakter usługi ' +
        'Operator odpowiada wyłącznie za szkodę wyrządzoną umyślnie.',
    ],
  },
  {
    heading: '4. Obowiązki i odpowiedzialność użytkownika',
    paragraphs: [
      'Użytkownik ponosi wyłączną odpowiedzialność za pliki, które przesyła i udostępnia, oraz ' +
        'za treści w nich zawarte, a także za zgodność swojego działania z prawem i prawami osób ' +
        'trzecich, w tym prawami autorskimi, dobrami osobistymi i przepisami o ochronie danych.',
      'Zabronione jest przesyłanie za pośrednictwem Serwisu treści niezgodnych z prawem, ' +
        'naruszających prawa osób trzecich, złośliwego oprogramowania, a także treści, do których ' +
        'użytkownik nie posiada odpowiednich praw. Operator może bez uprzedzenia usunąć lub ' +
        'zablokować dowolny transfer, w szczególności w razie podejrzenia naruszenia regulaminu ' +
        'lub prawa.',
      'Użytkownik zabezpiecza Operatora przed wszelkimi roszczeniami osób trzecich związanymi ' +
        'z przesłanymi przez niego treściami i pokrywa uzasadnione koszty obrony przed takimi ' +
        'roszczeniami. Link do transferu ma charakter poufny — udostępniając go, użytkownik ' +
        'udostępnia zawartość transferu każdemu, kto ten link posiada.',
    ],
  },
  {
    heading: '5. Dane i prywatność',
    paragraphs: [
      'Operator przetwarza jedynie dane niezbędne do działania Serwisu (m.in. przesłane pliki ' +
        'przez czas ważności linku oraz podstawowe dane techniczne). Pliki i powiązane z nimi ' +
        'metadane są trwale usuwane po wygaśnięciu linku.',
      'Serwis nie jest przeznaczony do przesyłania danych szczególnie wrażliwych, poufnych ani ' +
        'krytycznych. Przesyłając takie dane, użytkownik czyni to na własne ryzyko i we własnym ' +
        'zakresie odpowiada za ich odpowiednie zabezpieczenie.',
    ],
  },
  {
    heading: '6. Postanowienia końcowe',
    paragraphs: [
      'Operator może zmienić niniejszy regulamin w dowolnym czasie; zmiana obowiązuje od chwili ' +
        'publikacji nowej wersji w Serwisie. Dalsze korzystanie z Serwisu po zmianie oznacza ' +
        'akceptację nowej wersji regulaminu.',
      'Jeżeli którekolwiek postanowienie regulaminu okaże się nieważne lub bezskuteczne, ' +
        'pozostałe postanowienia zachowują moc. W miejsce postanowienia nieważnego stosuje się ' +
        'postanowienie najbliższe jego celowi, dopuszczalne przez prawo.',
      'W sprawach nieuregulowanych stosuje się prawo polskie. Regulamin nie ogranicza praw ' +
        'konsumentów w zakresie, w jakim są one bezwzględnie obowiązujące.',
    ],
  },
];
