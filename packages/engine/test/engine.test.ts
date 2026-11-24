import { describe, expect, it } from 'vitest';
import { computeRatings, simulateMatch, validateLineup } from '../src/index.js';
import { PRESETS, buildTeam } from '../../../tools/harness/src/setups.js';

const avgGoals = (fa: string, fb: string, n = 300) => {
  let a = 0;
  let b = 0;
  for (let s = 1; s <= n; s++) {
    const r = simulateMatch(buildTeam('a', fa, PRESETS.balanced!), buildTeam('b', fb, PRESETS.balanced!), s);
    a += r.stats[0].goals;
    b += r.stats[1].goals;
  }
  return [a / n, b / n] as const;
};

describe('engine', () => {
  it('is deterministic for a seed', () => {
    const a = buildTeam('a', '4-4-2', PRESETS.balanced!);
    const b = buildTeam('b', '4-3-3', PRESETS.highpress!);
    expect(simulateMatch(a, b, 42)).toEqual(simulateMatch(a, b, 42));
  });

  it('rejects an incomplete lineup', () => {
    const t = buildTeam('a', '4-4-2', PRESETS.balanced!);
    delete t.lineup.slots.GK;
    expect(validateLineup(t.lineup)).toContain('needs a goalkeeper');
    expect(() => simulateMatch(t, buildTeam('b', '4-4-2', PRESETS.balanced!), 1)).toThrow();
  });

  it('punishes a side with no center backs', () => {
    const [twoStrikers, noCbs] = avgGoals('4-4-2', '0CB 2WB-5-3');
    expect(twoStrikers).toBeGreaterThan(noCbs);
    expect(twoStrikers).toBeGreaterThan(2);
  });

  it('gives five midfielders more of the ball but not a free win', () => {
    const r = simulateMatch(buildTeam('a', '4-5-1', PRESETS.possession!), buildTeam('b', '4-4-2', PRESETS.counter!), 7);
    expect(r.stats[0].possession).toBeGreaterThan(50);
    const [fiveMids, counter] = avgGoals('4-5-1', '4-4-2');
    expect(Math.abs(fiveMids - counter)).toBeLessThan(0.6);
  });

  it('scores a realistic number of goals between equal sides', () => {
    const [a, b] = avgGoals('4-4-2', '4-4-2');
    expect(a + b).toBeGreaterThan(1.3);
    expect(a + b).toBeLessThan(3.5);
  });

  it('shows exposure in the ratings', () => {
    const full = computeRatings(buildTeam('a', '4-4-2', PRESETS.balanced!).lineup);
    const none = computeRatings(buildTeam('b', '0CB 2WB-5-3', PRESETS.balanced!).lineup);
    expect(none.defense.center).toBeLessThan(full.defense.center * 0.5);
  });
});
