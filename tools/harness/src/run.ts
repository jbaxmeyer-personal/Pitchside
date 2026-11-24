import { simulateMatch } from '@pitchside/engine';
import { FORMATIONS, PRESETS, buildTeam } from './setups.js';

/**
 * Plays every formation x tactic preset against every other at equal squad quality.
 * Score = win + half a draw, so 0.5 is average. Target: nothing above ~0.56.
 */
const N = Number(process.env.N ?? 60);
const setups = Object.keys(FORMATIONS).flatMap((f) => Object.keys(PRESETS).map((t) => ({ f, t, key: `${f} / ${t}` })));

interface Rec { score: number; games: number; gf: number; ga: number; poss: number; xgf: number }
const rec = new Map<string, Rec>(setups.map((s) => [s.key, { score: 0, games: 0, gf: 0, ga: 0, poss: 0, xgf: 0 }]));
const h2h = new Map<string, number>();
let totalGoals = 0;
let matches = 0;
let seed = 1;

for (let i = 0; i < setups.length; i++) {
  for (let j = i + 1; j < setups.length; j++) {
    const a = setups[i]!;
    const b = setups[j]!;
    let aScore = 0;
    for (let k = 0; k < N; k++) {
      const ta = buildTeam('a', a.f, PRESETS[a.t]!);
      const tb = buildTeam('b', b.f, PRESETS[b.t]!);
      const flip = k % 2 === 1;
      const res = flip ? simulateMatch(tb, ta, seed++) : simulateMatch(ta, tb, seed++);
      const [sa, sb] = flip ? [res.stats[1], res.stats[0]] : [res.stats[0], res.stats[1]];
      const pa = sa.goals > sb.goals ? 1 : sa.goals === sb.goals ? 0.5 : 0;
      aScore += pa;
      const ra = rec.get(a.key)!;
      const rb = rec.get(b.key)!;
      ra.score += pa; rb.score += 1 - pa;
      ra.games++; rb.games++;
      ra.gf += sa.goals; ra.ga += sb.goals; rb.gf += sb.goals; rb.ga += sa.goals;
      ra.poss += sa.possession; rb.poss += sb.possession;
      ra.xgf += sa.xg; rb.xgf += sb.xg;
      totalGoals += sa.goals + sb.goals;
      matches++;
    }
    h2h.set(`${a.key} vs ${b.key}`, aScore / N);
  }
}

const rows = [...rec.entries()]
  .map(([k, r]) => ({ k, s: r.score / r.games, gf: r.gf / r.games, ga: r.ga / r.games, poss: r.poss / r.games, xg: r.xgf / r.games }))
  .sort((x, y) => y.s - x.s);

console.log(`\n${matches} matches, ${(totalGoals / matches).toFixed(2)} goals per match\n`);
console.log('setup'.padEnd(34), 'score', '  GF ', '  GA ', 'poss');
for (const r of rows) {
  console.log(r.k.padEnd(34), r.s.toFixed(3), r.gf.toFixed(2).padStart(5), r.ga.toFixed(2).padStart(5), r.poss.toFixed(0).padStart(4));
}

const agg = (pick: (k: string) => string) => {
  const m = new Map<string, number[]>();
  for (const r of rows) { const g = pick(r.k); m.set(g, [...(m.get(g) ?? []), r.s]); }
  return [...m.entries()].map(([g, v]) => [g, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => b[1] - a[1]);
};
console.log('\nby formation:'); for (const [g, v] of agg((k) => k.split(' / ')[0]!)) console.log('  ', g.padEnd(16), v.toFixed(3));
console.log('\nby tactic:'); for (const [g, v] of agg((k) => k.split(' / ')[1]!)) console.log('  ', g.padEnd(16), v.toFixed(3));

const look = (a: string, b: string) => h2h.get(`${a} vs ${b}`) ?? (h2h.has(`${b} vs ${a}`) ? 1 - h2h.get(`${b} vs ${a}`)! : NaN);
console.log('\nsanity checks (score of the first side):');
console.log('   4-4-2/balanced vs 0CB/balanced     ', look('4-4-2 / balanced', '0CB 2WB-5-3 / balanced').toFixed(3));
console.log('   3-5-2/possession vs 5-3-2/counter   ', look('3-5-2 / possession', '5-3-2 / counter').toFixed(3));
console.log('   4-3-3/highpress vs 4-4-2/counter    ', look('4-3-3 / highpress', '4-4-2 / counter').toFixed(3));
console.log('   4-5-1/possession vs 4-3-3/highpress ', look('4-5-1 / possession', '4-3-3 / highpress').toFixed(3));
