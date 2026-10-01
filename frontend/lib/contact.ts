/**
 * The person behind the studio, in one place for the business card and the
 * desktop stage. The name is written without diacritics on purpose.
 */
export const CONTACT = {
  name: 'P. Lazniak',
  role: 'HEXART Studio · film, XR, systemy AI',
  phoneDisplay: '+48 662 016 430',
  phoneTel: '+48662016430',
  photo: '/photo-paul-v2.jpg',
  photoStyle: { objectFit: 'contain', objectPosition: 'center bottom', transform: 'scale(0.78)', transformOrigin: 'center bottom' },
  /**
   * Where "Umów rozmowę" leads. Set NEXT_PUBLIC_BOOKING_URL to the real
   * calendar; the default is the studio booking page.
   */
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL || 'https://hexart.pl/rezerwacja',
} as const;
