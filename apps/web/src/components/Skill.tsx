// Skill words, from 0 to 20. Our own ladder.
const WORDS = ['hopeless', 'woeful', 'poor', 'shaky', 'fair', 'decent', 'solid', 'sharp', 'excellent', 'superb', 'elite'];
export const skillWord = (v: number) => WORDS[Math.max(0, Math.min(WORDS.length - 1, Math.floor(v / 2)))]!;

export function Skill({ v }: { v: number }) {
  return (
    <span title={`${skillWord(v)} (${v.toFixed(1)})`}>
      <span className={`bar ${v < 6 ? 'low' : ''}`} style={{ width: Math.max(3, v * 3) }} /> <span className="muted">{v.toFixed(1)}</span>
    </span>
  );
}
