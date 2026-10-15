/**
 * Lightweight inline SVG illustrations (each < 3 KB). Colours come from theme tokens so
 * they work in light and dark mode. Imagery is local and inclusive: a small centre under
 * a Cape sun, a flat-topped mountain, fynbos, a protea, and children of different
 * complexions flying a kite. Decorative: aria-hidden, with meaning carried by text.
 */
const v = (name: string) => `var(--wes-${name})`;

const SKIN = { deep: '#7A4A26', warm: '#B97A4A', light: '#E2B58C' };
const HAIR = '#2B1B10';

export function SunriseScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden="true" focusable="false">
      {/* Sun with halo */}
      <circle cx="236" cy="66" r="54" fill={v('brand')} opacity="0.16" />
      <circle cx="236" cy="66" r="34" fill={v('brand')} />
      {/* Birds */}
      <path
        d="M92 40q5-5 10 0q5-5 10 0M120 28q4-4 8 0q4-4 8 0"
        fill="none"
        stroke={v('ink-muted')}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Flat-topped mountain */}
      <path d="M0 124 34 108 64 86h104l26 16 46 10 80 4v64H0Z" fill={v('brand-soft')} />
      <path
        d="M64 86h104"
        stroke={v('surface')}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Hills */}
      <path d="M0 142q80-30 170-10t150-4v52H0Z" fill={v('success-soft')} />
      {/* Centre building */}
      <rect
        x="40"
        y="112"
        width="70"
        height="42"
        rx="4"
        fill={v('surface')}
        stroke={v('line')}
        strokeWidth="2"
      />
      <path d="M33 115 75 88l42 27Z" fill={v('primary')} />
      <rect x="66" y="128" width="17" height="26" rx="4" fill={v('brand')} />
      <rect
        x="47"
        y="122"
        width="13"
        height="11"
        rx="2"
        fill={v('brand-soft')}
        stroke={v('line')}
        strokeWidth="1.5"
      />
      <rect
        x="90"
        y="122"
        width="13"
        height="11"
        rx="2"
        fill={v('brand-soft')}
        stroke={v('line')}
        strokeWidth="1.5"
      />
      <circle cx="75" cy="104" r="4" fill={v('brand-soft')} />
      {/* Kite and string */}
      <path
        d="M158 132 204 70"
        stroke={v('ink-muted')}
        strokeWidth="1.3"
        strokeDasharray="3 3"
        fill="none"
      />
      <path d="M206 40l12 15-12 15-12-15Z" fill={v('accent')} />
      <path d="M206 40v30M194 55h24" stroke={v('surface')} strokeWidth="1.5" opacity="0.8" />
      <path
        d="M206 70q-4 6 0 10t0 10"
        stroke={v('accent')}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Child with kite */}
      <path d="M150 154v-9M160 154v-9" stroke={v('ink')} strokeWidth="3" strokeLinecap="round" />
      <rect x="146" y="127" width="18" height="21" rx="8" fill={v('accent')} />
      <path d="M161 133l-3-3" stroke={SKIN.deep} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="155" cy="118" r="8.5" fill={SKIN.deep} />
      <circle cx="149" cy="111" r="3.4" fill={HAIR} />
      <circle cx="155" cy="109" r="3.6" fill={HAIR} />
      <circle cx="161" cy="111" r="3.4" fill={HAIR} />
      {/* Second child */}
      <path d="M180 154v-8M188 154v-8" stroke={v('ink')} strokeWidth="3" strokeLinecap="round" />
      <rect x="176" y="131" width="16" height="18" rx="7" fill={v('success')} />
      <circle cx="184" cy="123" r="7.5" fill={SKIN.warm} />
      <path d="M176.5 122a7.5 7.5 0 0 1 15 0q-3-4-7.5-4t-7.5 4Z" fill={HAIR} />
      {/* Third child, peeking from the door */}
      <circle cx="74.5" cy="138" r="5.5" fill={SKIN.light} />
      <path d="M69 137a5.5 5.5 0 0 1 11 0q-2.5-3-5.5-3t-5.5 3Z" fill="#6B4423" />
      {/* Fynbos */}
      <path
        d="M232 156c0-10 6-14 6-20M238 156c0-8 7-10 10-16M244 156c1-7-2-12-1-18"
        stroke={v('success')}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14 158c2-9 0-13 3-18M20 158c0-6 5-9 6-14"
        stroke={v('success')}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Protea */}
      <g transform="translate(284 136)">
        <path d="M0 22V6" stroke={v('success')} strokeWidth="3" strokeLinecap="round" />
        <path d="M-12 0q2-14 12-16q10 2 12 16q-12 6-24 0Z" fill={v('accent')} />
        <path d="M-6-2q1-10 6-12q5 2 6 12q-6 3-12 0Z" fill={v('accent-soft')} />
        <path
          d="M-12 0q-6-6-4-12M12 0q6-6 4-12"
          stroke={v('accent')}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      {/* Foreground ground */}
      <path d="M0 158q160-14 320 0v22H0Z" fill={v('success')} opacity="0.22" />
    </svg>
  );
}

/** Shown when a pack is complete. Confetti pops in once; still under reduced motion. */
export function Celebration({ className }: { className?: string }) {
  const bits: [number, number, string, number][] = [
    [34, 36, 'accent', 20],
    [164, 30, 'brand', -15],
    [24, 104, 'brand', 40],
    [176, 112, 'accent', -35],
    [58, 18, 'success', 10],
    [142, 14, 'primary', 60],
    [190, 70, 'success', 25],
    [12, 66, 'primary', -20],
    [70, 140, 'accent', 15],
    [132, 144, 'brand', -40],
  ];
  return (
    <svg viewBox="0 0 200 160" className={className} aria-hidden="true" focusable="false">
      <style>{`@keyframes wes-pop{0%{transform:scale(.2);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}.wes-pop{transform-box:fill-box;transform-origin:center;animation:wes-pop .6s cubic-bezier(.2,.9,.3,1.3) both}`}</style>
      <circle cx="100" cy="80" r="58" fill={v('success-soft')} />
      <circle cx="100" cy="80" r="40" fill={v('success')} className="wes-pop" />
      <path
        d="m82 81 12 12 24-26"
        fill="none"
        stroke={v('on-success')}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {bits.map(([x, y, c, r], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={i % 3 === 0 ? 7 : 10}
          height={i % 3 === 0 ? 7 : 4}
          rx="2"
          fill={v(c)}
          transform={`rotate(${r} ${x} ${y})`}
          className="wes-pop"
          style={{ animationDelay: `${120 + i * 40}ms` }}
        />
      ))}
    </svg>
  );
}

/** Empty states: an open book with a seedling — "this is where things will grow". */
export function SproutBook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="104" rx="60" ry="8" fill={v('surface-sunk')} />
      <path
        d="M80 92c-14-8-34-10-52-6V36c18-4 38-2 52 6Z"
        fill={v('surface')}
        stroke={v('line')}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M80 92c14-8 34-10 52-6V36c-18-4-38-2-52 6Z"
        fill={v('surface')}
        stroke={v('line')}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M40 50c10-1 20 0 30 4M40 62c10-1 20 0 30 4M90 54c10-4 20-5 30-4M90 66c10-4 20-5 30-4"
        stroke={v('line')}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M80 42V18" stroke={v('success')} strokeWidth="4" strokeLinecap="round" />
      <path d="M80 26c-2-10-10-14-20-12 1 10 9 15 20 12Z" fill={v('success')} />
      <path d="M80 22c3-9 11-12 20-10-2 9-10 13-20 10Z" fill={v('success')} opacity="0.75" />
      <circle cx="124" cy="22" r="10" fill={v('brand')} />
    </svg>
  );
}

/** Offline: a phone resting under the sun, not a scary error. */
export function RestingPhone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" focusable="false">
      <circle cx="118" cy="30" r="16" fill={v('brand')} />
      <ellipse cx="72" cy="106" rx="50" ry="7" fill={v('surface-sunk')} />
      <rect
        x="46"
        y="22"
        width="52"
        height="84"
        rx="10"
        fill={v('surface')}
        stroke={v('ink-muted')}
        strokeWidth="3"
      />
      <rect x="54" y="32" width="36" height="58" rx="4" fill={v('brand-soft')} />
      <path
        d="M64 58q8-8 16 0M68 64q4-4 8 0"
        stroke={v('primary')}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="72" cy="70" r="2.5" fill={v('primary')} />
      <path d="M60 50l24 24" stroke={v('primary')} strokeWidth="3" strokeLinecap="round" />
      <path
        d="M128 76c0-8 4-11 4-16M134 76c0-6 5-8 7-12"
        stroke={v('success')}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
