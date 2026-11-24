import { simulateMatch } from '@pitchside/engine';
import { buildTeam, PRESETS } from './setups.js';
const pairs: Array<[string, string, string, string]> = [
  ['4-4-2', 'balanced', '4-4-2', 'balanced'],
  ['4-4-2', 'balanced', '4-4-2', 'counter'],
  ['4-3-3', 'highpress', '4-4-2', 'counter'],
  ['4-4-2', 'balanced', '0CB 2WB-5-3', 'balanced'],
];
for (const [fa, ta, fb, tb] of pairs) {
  const kinds: Record<string, { n: number; xg: number; g: number }> = {};
  const goals: [number, number] = [0, 0];
  const N = 400;
  for (let s = 1; s <= N; s++) {
    const r = simulateMatch(buildTeam('a', fa, PRESETS[ta]!), buildTeam('b', fb, PRESETS[tb]!), s);
    goals[0] += r.stats[0].goals; goals[1] += r.stats[1].goals;
    for (const e of r.events) { const k = `${e.team}:${e.kind}`; kinds[k] ??= { n: 0, xg: 0, g: 0 }; const v = kinds[k]!; v.n++; v.xg += e.xg; if (e.outcome === "goal") v.g++; }
  }
  console.log(`\n${fa}/${ta} vs ${fb}/${tb}: ${(goals[0] / N).toFixed(2)} - ${(goals[1] / N).toFixed(2)}`);
  for (const [k, v] of Object.entries(kinds).sort()) console.log('  ', k.padEnd(12), 'per match', (v.n / N).toFixed(1).padStart(5), ' avg xg', (v.xg / v.n).toFixed(3), ' goals/match', (v.g / N).toFixed(2));
  const r0 = simulateMatch(buildTeam('a', fa, PRESETS[ta]!), buildTeam('b', fb, PRESETS[tb]!), 1).ratings;
  console.log('   ratings A', JSON.stringify(r0[0], (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v));
  console.log('   ratings B', JSON.stringify(r0[1], (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v));
}
