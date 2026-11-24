// Generated club crest: shield, a pattern picked from the seed, and the club's initials.
export function Badge({ name, colors, seed, size = 40 }: { name: string; colors: { primary: string; secondary: string }; seed: number; size?: number }) {
  const pattern = seed % 4;
  const initials = name.split(' ').filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('').slice(0, 3);
  const shield = 'M20 2 L37 8 V20 C37 31 29 37 20 40 C11 37 3 31 3 20 V8 Z';
  const id = `b${seed}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 42" aria-label={`${name} crest`}>
      <defs><clipPath id={id}><path d={shield} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="42" fill={colors.primary} />
        {pattern === 1 && [0, 1, 2].map((i) => <rect key={i} x={6 + i * 11} width="5" height="42" fill={colors.secondary} />)}
        {pattern === 2 && <rect y="15" width="40" height="9" fill={colors.secondary} />}
        {pattern === 3 && <path d="M0 0 L40 0 L0 42 Z" fill={colors.secondary} opacity="0.85" />}
      </g>
      <path d={shield} fill="none" stroke="#0b0d0c" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="20" y="25" textAnchor="middle" fontFamily="Kalam, cursive" fontWeight="700" fontSize={initials.length > 2 ? 10 : 13}
        fill={pattern === 2 ? colors.primary : colors.secondary} stroke="#0b0d0c" strokeWidth="0.4">{initials}</text>
    </svg>
  );
}
