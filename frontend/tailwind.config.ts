import type { Config } from 'tailwindcss';

/** Values mirror the HEXART studio site so both surfaces stay in step. */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        // Large screen held sideways: panel on the left, studio ad behind it.
        // Mirrors DESK_QUERY in lib/hooks.ts.
        desk: { raw: '(min-width: 1024px) and (orientation: landscape)' },
      },
      fontFamily: {
        display: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
        body: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
        // Brand face for kickers, labels and numbers (uppercase, tracked).
        label: ['"Barlow Condensed"', '"Bahnschrift SemiCondensed"', 'sans-serif'],
      },
      colors: {
        bg: {
          primary: '#0a0a0c',
          darker: '#050507',
          card: 'rgba(20, 20, 22, 0.7)',
        },
        accent: {
          DEFAULT: '#d1ae53',
          light: '#ebd065',
          dark: '#7a5f1c',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          light: 'rgba(255, 255, 255, 0.12)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
        'pulse-glow': 'pulse-glow 2.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(209, 174, 83, 0.16)' },
          '50%': { boxShadow: '0 0 40px rgba(209, 174, 83, 0.32)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
