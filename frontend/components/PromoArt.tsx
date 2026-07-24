'use client';

import React from 'react';

/**
 * Banner artwork for the studio promos - one distinctive scene per theme,
 * drawn as inline SVG in the HEXART palette (gold on near-black). Vector, so
 * it stays crisp at any size and ships no binary weight, and each scene is
 * self-contained with its own gradient ids since only one renders at a time.
 *
 * Motion is subtle and switches off under prefers-reduced-motion (handled in
 * globals.css via the .promo-art animations).
 */

export type PromoArtKey =
  | 'automation'
  | 'voice'
  | 'rag'
  | 'jetson'
  | 'film'
  | 'video'
  | 'xr'
  | 'facemapping'
  | 'live'
  | 'history'
  | 'ecommerce'
  | 'branding'
  | 'genai'
  | 'heritage'
  | 'contact';

const VIEW = '0 0 480 150';

/** Shared backdrop: faint hex outline + gold wash, behind every scene. */
function Frame({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <svg viewBox={VIEW} className="w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3e3a8" />
          <stop offset="55%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#a8811f" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="rgba(212,175,55,0.18)" />
          <stop offset="100%" stopColor="rgba(212,175,55,0)" />
        </radialGradient>
      </defs>

      <rect width="480" height="150" fill="#0b0b0e" />
      <rect width="480" height="150" fill={`url(#${id}-glow)`} />

      {/* faint hex lattice */}
      <g stroke="rgba(212,175,55,0.06)" strokeWidth="1" fill="none">
        <path d="M40 20l20 12v24L40 68 20 56V32z" />
        <path d="M430 90l20 12v24l-20 12-20-12v-24z" />
        <path d="M120 110l16 9v18l-16 9-16-9v-18z" />
      </g>

      {children}
    </svg>
  );
}

const gold = (id: string) => `url(#${id}-gold)`;

function Automation({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* flow: nodes wired to a hub, work routed to the machine */}
      <g stroke={gold(id)} strokeWidth="1.5" fill="none" opacity="0.9">
        <path d="M70 40h70q20 0 20 20v10q0 20 20 20h60" />
        <path d="M70 110h70q20 0 20-20v-10q0-20 20-20h60" />
        <path d="M300 75h70" />
      </g>
      {[
        [70, 40],
        [70, 110],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill={gold(id)} />
      ))}
      <circle cx="300" cy="75" r="9" fill="none" stroke={gold(id)} strokeWidth="2" />
      {/* the automated hub */}
      <g className="promo-spin" style={{ transformOrigin: '395px 75px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x="391"
            y="45"
            width="8"
            height="14"
            rx="2"
            fill={gold(id)}
            opacity={0.5 + (i % 3) * 0.2}
            transform={`rotate(${i * 45} 395 75)`}
          />
        ))}
        <circle cx="395" cy="75" r="12" fill="#0b0b0e" stroke={gold(id)} strokeWidth="2" />
      </g>
      <circle cx="395" cy="75" r="4" fill={gold(id)} className="promo-pulse" />
    </Frame>
  );
}

function Voice({ id }: { id: string }) {
  const bars = [22, 40, 64, 90, 64, 44, 78, 110, 78, 50, 30, 54, 84, 60, 34, 20];
  return (
    <Frame id={id}>
      {/* speech rings */}
      {[26, 46, 66].map((r, i) => (
        <circle
          key={i}
          cx="70"
          cy="75"
          r={r}
          fill="none"
          stroke={gold(id)}
          strokeWidth="1.5"
          opacity={0.5 - i * 0.14}
          className="promo-pulse"
          style={{ animationDelay: `${i * 0.4}s` }}
        />
      ))}
      <circle cx="70" cy="75" r="10" fill={gold(id)} />
      {/* live waveform */}
      <g className="promo-wave">
        {bars.map((h, i) => (
          <rect
            key={i}
            x={150 + i * 20}
            y={75 - h / 2}
            width="7"
            height={h}
            rx="3.5"
            fill={gold(id)}
            opacity={0.55 + (i % 4) * 0.12}
          />
        ))}
      </g>
    </Frame>
  );
}

function Rag({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* stacked documents feeding an answer spark */}
      <g stroke={gold(id)} strokeWidth="1.5" fill="none">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${60 + i * 14} ${100 - i * 18})`} opacity={0.5 + i * 0.2}>
            <rect width="70" height="52" rx="5" fill="#0b0b0e" />
            <path d="M12 16h46M12 28h46M12 40h30" strokeWidth="2" />
          </g>
        ))}
      </g>
      <path d="M170 74h80" stroke={gold(id)} strokeWidth="1.5" strokeDasharray="4 5" className="promo-dash" />
      {/* the answer */}
      <g transform="translate(300 75)">
        <circle r="34" fill="none" stroke={gold(id)} strokeWidth="1.5" opacity="0.4" />
        <path
          d="M0-20l6 14 14 6-14 6-6 14-6-14-14-6 14-6z"
          fill={gold(id)}
          className="promo-pulse"
        />
      </g>
      <path d="M348 60q40 0 40 15t-40 15" stroke={gold(id)} strokeWidth="1.5" fill="none" opacity="0.6" />
      <circle cx="392" cy="75" r="5" fill={gold(id)} />
    </Frame>
  );
}

function Jetson({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* horizon + a drone banking over hex terrain */}
      <path d="M0 108h480" stroke={gold(id)} strokeWidth="1" opacity="0.25" />
      {[80, 180, 300, 410].map((x, i) => (
        <path
          key={i}
          d={`M${x} 108l14 8v16l-14 8-14-8v-16z`}
          fill="none"
          stroke={gold(id)}
          strokeWidth="1"
          opacity="0.3"
        />
      ))}
      <g transform="translate(240 60)" className="promo-float">
        <ellipse cx="0" cy="0" rx="46" ry="12" fill="none" stroke={gold(id)} strokeWidth="1.5" />
        <path d="M-46 0h-14M46 0h14" stroke={gold(id)} strokeWidth="2" />
        {[-60, 60].map((x, i) => (
          <g key={i} className="promo-spin" style={{ transformOrigin: `${x}px 0px` }}>
            <line x1={x - 12} y1="0" x2={x + 12} y2="0" stroke={gold(id)} strokeWidth="2" />
          </g>
        ))}
        <path d="M-18 4q18 14 36 0" fill="none" stroke={gold(id)} strokeWidth="2.5" />
        <circle cx="0" cy="2" r="4" fill={gold(id)} />
      </g>
    </Frame>
  );
}

function Film({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* film strip of frames + a clapper */}
      <g className="promo-slide">
        {[40, 150, 260, 370, 480].map((x, i) => (
          <g key={i} transform={`translate(${x} 46)`}>
            <rect width="86" height="58" rx="4" fill="none" stroke={gold(id)} strokeWidth="1.5" opacity="0.7" />
            <rect x="10" y="12" width="66" height="34" rx="2" fill="rgba(212,175,55,0.08)" />
            {[0, 1, 2, 3].map((p) => (
              <rect key={p} x={10 + p * 20} y="-8" width="8" height="6" rx="1" fill={gold(id)} opacity="0.6" />
            ))}
          </g>
        ))}
      </g>
      <g transform="translate(60 96) rotate(-4)">
        <rect width="70" height="14" rx="2" fill={gold(id)} className="promo-clap" style={{ transformOrigin: '0 14px' }} />
        <rect y="16" width="70" height="34" rx="3" fill="none" stroke={gold(id)} strokeWidth="2" />
      </g>
    </Frame>
  );
}

function Video({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* camera aperture */}
      <g transform="translate(120 75)" className="promo-spin-slow" style={{ transformOrigin: '120px 75px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <path
            key={i}
            d="M0-42L36 -12 0 0z"
            fill={gold(id)}
            opacity={0.35 + (i % 2) * 0.25}
            transform={`rotate(${i * 60})`}
          />
        ))}
        <circle r="14" fill="#0b0b0e" />
      </g>
      {/* play + resolution ticks */}
      <path d="M250 55l38 20-38 20z" fill={gold(id)} className="promo-pulse" />
      <g stroke={gold(id)} strokeWidth="2" opacity="0.6">
        <path d="M330 60h110M330 75h90M330 90h110" />
      </g>
      <text x="430" y="44" fill={gold(id)} fontSize="14" fontWeight="700" fontFamily="Outfit, sans-serif">
        4K
      </text>
    </Frame>
  );
}

function Xr({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* wireframe cube + headset */}
      <g stroke={gold(id)} strokeWidth="1.5" fill="none" className="promo-float">
        <g transform="translate(110 75)">
          <path d="M-30-30h48v48h-48z" opacity="0.5" />
          <path d="M-12-46h48v48h-48z" opacity="0.9" />
          <path d="M-30-30l18-16M18-30l18-16M18 18l18-16M-30 18l18-16" opacity="0.7" />
        </g>
      </g>
      <g transform="translate(320 75)">
        <rect x="-70" y="-26" width="140" height="52" rx="26" fill="none" stroke={gold(id)} strokeWidth="2" />
        <circle cx="-32" cy="0" r="16" fill="rgba(212,175,55,0.12)" stroke={gold(id)} strokeWidth="1.5" />
        <circle cx="32" cy="0" r="16" fill="rgba(212,175,55,0.12)" stroke={gold(id)} strokeWidth="1.5" />
        <path d="M-70-6q-14 6 0 12M70-6q14 6 0 12" stroke={gold(id)} strokeWidth="2" fill="none" />
      </g>
    </Frame>
  );
}

function FaceMapping({ id }: { id: string }) {
  const pts = [
    [340, 40], [370, 55], [385, 85], [372, 115], [340, 128], [308, 115], [295, 85], [310, 55],
    [340, 70], [325, 90], [355, 90], [340, 105],
  ];
  return (
    <Frame id={id}>
      {/* tracked face mesh */}
      <g stroke={gold(id)} strokeWidth="1" fill="none" opacity="0.7">
        <path d="M340 40l30 15 15 30-13 30-32 13-32-13-13-30 15-30z" />
        <path d="M340 70l-15 20 15 15 15-15zM325 90h30" />
        <path d="M310 55l30 15 30-15M308 115l32-10 32 10" />
      </g>
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill={gold(id)} className="promo-pulse" style={{ animationDelay: `${(i % 5) * 0.2}s` }} />
      ))}
      {/* scan line */}
      <rect x="288" y="30" width="104" height="3" fill={gold(id)} opacity="0.5" className="promo-scan" />
      {/* live tag */}
      <g transform="translate(70 60)">
        <circle r="6" fill="#e0483b" className="promo-pulse" />
        <text x="16" y="5" fill={gold(id)} fontSize="15" fontWeight="700" fontFamily="Outfit, sans-serif">
          LIVE
        </text>
        <path d="M0 30h150" stroke={gold(id)} strokeWidth="1" opacity="0.3" />
      </g>
    </Frame>
  );
}

function Live({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* broadcast tower + signal arcs */}
      <g transform="translate(240 90)" stroke={gold(id)} fill="none">
        <path d="M-14 0l14-54 14 54z" strokeWidth="2" />
        <path d="M-9 -20h18M-5 -38h10" strokeWidth="2" />
        {[26, 44, 62].map((r, i) => (
          <g key={i} className="promo-pulse" style={{ animationDelay: `${i * 0.35}s`, transformOrigin: '0 -54px' }}>
            <path d={`M${-r} -54a${r} ${r} 0 0 1 ${r * 2} 0`} strokeWidth="1.5" opacity={0.55 - i * 0.14} transform="translate(0 0)" />
          </g>
        ))}
      </g>
      <circle cx="240" cy="36" r="5" fill={gold(id)} className="promo-pulse" />
      <path d="M160 118h160" stroke={gold(id)} strokeWidth="1" opacity="0.25" />
    </Frame>
  );
}

function History({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* a timeline resolving into a constellation */}
      <path d="M40 110h400" stroke={gold(id)} strokeWidth="1.5" opacity="0.6" />
      {[70, 150, 230, 310, 390].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="102" x2={x} y2="118" stroke={gold(id)} strokeWidth="1.5" opacity="0.5" />
          <circle cx={x} cy="110" r={i === 2 ? 6 : 4} fill={gold(id)} className={i === 2 ? 'promo-pulse' : ''} />
        </g>
      ))}
      <g stroke={gold(id)} strokeWidth="1" opacity="0.55" fill="none">
        <path d="M150 60l60-24 54 30 66-18" />
      </g>
      {[
        [150, 60], [210, 36], [264, 66], [330, 48], [400, 40],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill={gold(id)} className="promo-pulse" style={{ animationDelay: `${i * 0.25}s` }} />
      ))}
    </Frame>
  );
}

function Ecommerce({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* cart + price tags that shift (repricing) */}
      <g transform="translate(90 60)" stroke={gold(id)} strokeWidth="2" fill="none">
        <path d="M0 0h14l10 46h56l12-32H30" />
        <circle cx="34" cy="60" r="7" fill={gold(id)} />
        <circle cx="76" cy="60" r="7" fill={gold(id)} />
      </g>
      {[
        [250, 50, '−15%'],
        [340, 82, '+8%'],
      ].map(([x, y, t], i) => (
        <g key={i} transform={`translate(${x} ${y})`} className="promo-float" style={{ animationDelay: `${i * 0.6}s` }}>
          <path d="M0 0l40 0 22 22-22 22H0z" fill="rgba(212,175,55,0.1)" stroke={gold(id)} strokeWidth="1.5" />
          <circle cx="12" cy="22" r="4" fill={gold(id)} />
          <text x="24" y="27" fill={gold(id)} fontSize="14" fontWeight="700" fontFamily="Outfit, sans-serif">
            {t as string}
          </text>
        </g>
      ))}
    </Frame>
  );
}

function Branding({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* colour swatches + pen nib */}
      {['#f3e3a8', '#d4af37', '#a8811f', '#ffffff'].map((c, i) => (
        <rect
          key={i}
          x={60 + i * 44}
          y={50 + (i % 2) * 10}
          width="36"
          height="50"
          rx="6"
          fill={c}
          opacity={c === '#ffffff' ? 0.85 : 1}
          className="promo-float"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}
      <g transform="translate(320 44)" fill="none" stroke={gold(id)} strokeWidth="2">
        <path d="M0 0l52 20-16 46-46-14z" fill="rgba(212,175,55,0.08)" />
        <path d="M0 0l30 44" />
        <circle cx="30" cy="44" r="4" fill={gold(id)} />
      </g>
    </Frame>
  );
}

function GenAi({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* image tiles resolving from noise, with a spark */}
      <g>
        {Array.from({ length: 12 }).map((_, i) => {
          const col = i % 4;
          const rowN = Math.floor(i / 4);
          return (
            <rect
              key={i}
              x={80 + col * 40}
              y={40 + rowN * 30}
              width="34"
              height="24"
              rx="4"
              fill={gold(id)}
              opacity={0.14 + ((i * 7) % 5) * 0.16}
              className="promo-shimmer"
              style={{ animationDelay: `${(i % 6) * 0.2}s` }}
            />
          );
        })}
      </g>
      <g transform="translate(330 66)">
        <path d="M0-26l7 17 17 7-17 7-7 17-7-17-17-7 17-7z" fill={gold(id)} className="promo-pulse" />
      </g>
    </Frame>
  );
}

function Heritage({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* a medallion: 20+ years */}
      <g transform="translate(240 75)">
        {[54, 44].map((r, i) => (
          <circle key={i} r={r} fill="none" stroke={gold(id)} strokeWidth={i ? 1 : 2} opacity={i ? 0.4 : 1} />
        ))}
        <text x="0" y="6" textAnchor="middle" fill={gold(id)} fontSize="38" fontWeight="800" fontFamily="Outfit, sans-serif">
          20+
        </text>
        <text x="0" y="28" textAnchor="middle" fill="rgba(212,175,55,0.7)" fontSize="9" letterSpacing="3" fontFamily="Outfit, sans-serif">
          LAT
        </text>
        {[-1, 1].map((s, i) => (
          <path
            key={i}
            d={`M${s * 60} -34q${s * 26} 34 0 68`}
            fill="none"
            stroke={gold(id)}
            strokeWidth="2"
            opacity="0.6"
          />
        ))}
      </g>
      <circle cx="240" cy="14" r="4" fill={gold(id)} className="promo-pulse" />
    </Frame>
  );
}

function Contact({ id }: { id: string }) {
  return (
    <Frame id={id}>
      {/* message bubble + a spark reply */}
      <g transform="translate(90 45)">
        <path d="M0 0h150a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H40l-22 20v-20H0a12 12 0 0 1-12-12V12A12 12 0 0 1 0 0z" fill="rgba(212,175,55,0.08)" stroke={gold(id)} strokeWidth="1.5" transform="translate(12 0)" />
        <g fill={gold(id)} className="promo-wave">
          <circle cx="46" cy="34" r="5" />
          <circle cx="78" cy="34" r="5" />
          <circle cx="110" cy="34" r="5" />
        </g>
      </g>
      <g transform="translate(360 78)">
        <path d="M0-24l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill={gold(id)} className="promo-pulse" />
      </g>
    </Frame>
  );
}

const SCENES: Record<PromoArtKey, (props: { id: string }) => React.ReactNode> = {
  automation: Automation,
  voice: Voice,
  rag: Rag,
  jetson: Jetson,
  film: Film,
  video: Video,
  xr: Xr,
  facemapping: FaceMapping,
  live: Live,
  history: History,
  ecommerce: Ecommerce,
  branding: Branding,
  genai: GenAi,
  heritage: Heritage,
  contact: Contact,
};

export default function PromoArt({ art }: { art: PromoArtKey }) {
  const Scene = SCENES[art] ?? Automation;
  // A stable id per art key keeps gradient references valid across re-renders.
  return <Scene id={`art-${art}`} />;
}
