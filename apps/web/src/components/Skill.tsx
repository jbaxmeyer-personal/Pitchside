// Skill words, from 0 to 20. Our own ladder.
const WORDS = ['hopeless', 'woeful', 'poor', 'shaky', 'fair', 'decent', 'solid', 'sharp', 'excellent', 'superb', 'elite'];
export const skillWord = (v: number) => WORDS[Math.max(0, Math.min(WORDS.length - 1, Math.floor(v / 2)))]!;

/** Whole levels only: the decimals are hidden from players, as in the classic managers. */
export function Skill({ v }: { v: number }) {
  const level = Math.floor(v);
  return (
    <span title={skillWord(level)}>
      <span className={`bar ${level < 6 ? 'low' : ''}`} style={{ width: Math.max(3, level * 3) }} /> <span className="muted">{level}</span>
    </span>
  );
}
