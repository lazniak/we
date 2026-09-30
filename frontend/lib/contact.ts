/**
 * The person behind the studio, in one place for the business card and the
 * desktop stage. The name is written without diacritics on purpose.
 */
export const CONTACT = {
  name: 'P. Lazniak',
  role: 'HEXART Studio · automatyzacja AI, film, XR',
  phoneDisplay: '+48 662 016 430',
  phoneTel: '+48662016430',
  photo: '/photo-paul.jpg',
  /**
   * Where "Umów rozmowę" leads. Set NEXT_PUBLIC_BOOKING_URL to the real
   * calendar; until then it falls back to the contact section on hexart.pl.
   */
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL || 'https://hexart.pl/#contact',
} as const;
