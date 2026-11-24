import { Rng } from './rng.js';
import { clamp, computeRatings, filledSlots, roleOf, sideOf, validateLineup } from './ratings.js';
import type {
  EventKind,
  MatchEvent,
  MatchResult,
  Player,
  TeamInput,
  TeamRatings,
  TeamStats,
  Zone,
  ZoneRatings,
} from './types.js';
import { ZONES } from './types.js';

/**
 * All tuning constants in one place. The balance harness reports against these.
 */
export const TUNING = {
  possessions: 104,
  possessionExponent: 1.8,
  possessionClamp: [0.28, 0.72] as const,
  styleMidfield: { possession: 1.08, balanced: 1, direct: 0.9 },
  longBallShare: { possession: 0.08, balanced: 0.25, direct: 0.6 },
  progressBase: 0.3,
  progressCommitment: 0.32,
  pressTurnover: { off: 0, normal: 0.05, high: 0.12 },
  pressDrain: { off: 0, normal: 0.03, high: 0.07 },
  baseDrain: 0.1,
  lineProgress: { deep: 0.12, normal: 0, high: -0.05 },
  lineOpenXg: { deep: 0.88, normal: 1, high: 1.05 },
  longBallVsLine: { deep: -0.1, normal: 0, high: 0.12 },
  counterBase: 0.07,
  counterLine: { deep: 0.7, normal: 1, high: 1.5 },
  counterAfterChance: 1.3,
  xgOpen: 0.045,
  xgOpenExp: 1.6,
  xgCounter: 0.085,
  xgPressWin: 0.085,
  pressWin: 0.14,
  xgCounterExp: 1.2,
  xgLong: 0.04,
  xgSetPiece: 0.038,
  setPieceShare: 0.14,
  widthWeights: {
    narrow: [0.18, 0.64, 0.18],
    balanced: [0.3, 0.4, 0.3],
    wide: [0.4, 0.2, 0.4],
  },
  mentalityShape: { defensive: 1.06, balanced: 1, attacking: 0.92 },
};

const LEVEL = { off: 0, normal: 1, high: 2 } as const;

interface Side {
  team: TeamInput;
  r: TeamRatings;
  players: Array<{ slot: string; p: Player }>;
}

/** Simulates a full match. Pure: same inputs and seed, same result. */
export function simulateMatch(home: TeamInput, away: TeamInput, seed: number): MatchResult {
  for (const t of [home, away]) {
    const errors = validateLineup(t.lineup);
    if (errors.length) throw new Error(`${t.name}: ${errors.join(', ')}`);
  }

  const rng = new Rng(seed);
  const sides: [Side, Side] = [home, away].map((team) => ({
    team,
    r: computeRatings(team.lineup),
    players: filledSlots(team.lineup).map(([slot, p]) => ({ slot, p })),
  })) as [Side, Side];

  const stats: [TeamStats, TeamStats] = [newStats(), newStats()];
  const events: MatchEvent[] = [];
  const timeline: MatchResult['possessionTimeline'] = [];
  const owned: [number, number] = [0, 0];

  for (let i = 0; i < TUNING.possessions; i++) {
    const minute = Math.min(90, Math.floor(((i + rng.next()) / TUNING.possessions) * 90) + 1);
    const fatigue = sides.map((s) => fatigueAt(s, minute)) as [number, number];

    const pHome = possessionShare(sides[0], sides[1], fatigue);
    const owner: 0 | 1 = rng.chance(pHome) ? 0 : 1;
    const opp: 0 | 1 = owner === 0 ? 1 : 0;
    owned[owner]++;
    const X = sides[owner];
    const Y = sides[opp];
    const fx = fatigue[owner];
    const fy = fatigue[opp];

    const longRoute = rng.chance(TUNING.longBallShare[X.team.lineup.tactics.style]);
    const progressed = rng.chance(progressChance(X, Y, fx, fy, longRoute));
    const zone = pickZone(rng, X, Y, longRoute);
    timeline.push({ minute, team: owner, zone, progressed });

    if (!progressed) {
      // Lost the ball before the final third. A pressing side may win it high up...
      if (!longRoute && rng.chance(pressWinChance(Y, X))) {
        record(pressWin(rng, opp, Y, X, minute), stats, events);
        continue;
      }
      // ...otherwise the other side may break.
      if (rng.chance(counterChance(Y, X, 1))) {
        events.push(counter(rng, opp, Y, X, fy, fx, minute, stats));
      }
      continue;
    }

    let ev: MatchEvent;
    if (rng.chance(TUNING.setPieceShare)) {
      ev = setPiece(rng, owner, X, Y, minute, zone);
    } else if (longRoute) {
      ev = longBall(rng, owner, X, Y, fx, fy, minute, zone);
    } else {
      ev = openPlay(rng, owner, X, Y, fx, fy, minute, zone);
    }
    record(ev, stats, events);

    if (ev.outcome !== 'goal' && rng.chance(counterChance(Y, X, TUNING.counterAfterChance))) {
      events.push(counter(rng, opp, Y, X, fy, fx, minute, stats));
    }
  }

  const total = owned[0]! + owned[1]!;
  stats[0].possession = Math.round((owned[0]! / total) * 100);
  stats[1].possession = 100 - stats[0].possession;
  events.sort((a, b) => a.minute - b.minute);

  return {
    seed,
    ratings: [sides[0].r, sides[1].r],
    stats,
    events,
    possessionTimeline: timeline,
  };
}

function newStats(): TeamStats {
  return { goals: 0, possession: 0, chances: 0, xg: 0, counters: 0 };
}

function record(ev: MatchEvent, stats: [TeamStats, TeamStats], events: MatchEvent[]): void {
  const s = stats[ev.team];
  s.chances++;
  s.xg += ev.xg;
  if (ev.outcome === 'goal') s.goals++;
  if (ev.kind === 'counter') s.counters++;
  events.push(ev);
}

function fatigueAt(s: Side, minute: number): number {
  const t = s.team.lineup.tactics;
  const drain = (TUNING.baseDrain + TUNING.pressDrain[t.press]) * (1.25 - s.r.fitness);
  return 1 - drain * (minute / 90);
}

function possessionShare(a: Side, b: Side, fatigue: [number, number]): number {
  const m = (s: Side, opp: Side, f: number) => {
    const t = s.team.lineup.tactics;
    // A press wins the ball back more often against teams that can't pass through it.
    const pressGain = 1 + LEVEL[t.press] * 0.05 * clamp(1 - opp.r.pressResistance / 16, 0, 1);
    return s.r.midfield * TUNING.styleMidfield[t.style] * pressGain * f;
  };
  const ma = m(a, b, fatigue[0]) ** TUNING.possessionExponent;
  const mb = m(b, a, fatigue[1]) ** TUNING.possessionExponent;
  const [lo, hi] = TUNING.possessionClamp;
  return clamp(ma / (ma + mb), lo, hi);
}

function progressChance(X: Side, Y: Side, fx: number, fy: number, longRoute: boolean): number {
  const tx = X.team.lineup.tactics;
  const ty = Y.team.lineup.tactics;
  if (longRoute) {
    // Over the top: depends on target men and pace, not midfield.
    const quality = (X.r.longBall * fx) / 12;
    return clamp(0.18 + 0.15 * (quality - 1) + TUNING.longBallVsLine[ty.line], 0.06, 0.5);
  }
  const press = TUNING.pressTurnover[ty.press] * clamp(1.3 - X.r.pressResistance / 14, 0.2, 1.3) * fy;
  const blockDepth = TUNING.lineProgress[ty.line];
  const commit = TUNING.progressCommitment * (X.r.commitment - 0.5);
  const quality = 0.08 * ((X.r.buildUp * fx) / 10 - 1);
  const atk = X.r.attack.left + X.r.attack.center + X.r.attack.right;
  const def = Y.r.defense.left + Y.r.defense.center + Y.r.defense.right;
  const space = 0.15 * Math.log(ratio(atk * fx, def * fy * TUNING.mentalityShape[ty.mentality]));
  return clamp(TUNING.progressBase + commit + quality + space - press + blockDepth, 0.08, 0.8);
}

function pickZone(rng: Rng, X: Side, Y: Side, longRoute: boolean): Zone {
  const base = TUNING.widthWeights[X.team.lineup.tactics.width];
  if (longRoute) return rng.pick(ZONES, [0.25, 0.5, 0.25]);
  // Good teams find the weak side.
  const w = ZONES.map((z, i) => (base[i] ?? 0) * ratio(X.r.attack[z], Y.r.defense[z]));
  return rng.pick(ZONES, w);
}

function ratio(a: number, d: number): number {
  return (a + 1) / (d + 1);
}

function openPlay(rng: Rng, team: 0 | 1, X: Side, Y: Side, fx: number, fy: number, minute: number, zone: Zone): MatchEvent {
  const shape = TUNING.mentalityShape[Y.team.lineup.tactics.mentality];
  const r = ratio(X.r.attack[zone] * fx, Y.r.defense[zone] * fy * shape);
  const shooter = pickShooter(rng, X, zone);
  const block = TUNING.lineOpenXg[Y.team.lineup.tactics.line];
  const xg = clamp(TUNING.xgOpen * block * r ** TUNING.xgOpenExp * finishing(shooter, Y), 0.02, 0.55);
  const cause = r > 1.6 ? `cut through a thin ${zone === 'center' ? 'central' : zone} defense` : r < 0.7 ? 'forced a shot against a set defense' : `worked an opening ${zoneWord(zone)}`;
  return shot(rng, team, 'open', zone, shooter, xg, minute, cause);
}

function longBall(rng: Rng, team: 0 | 1, X: Side, Y: Side, fx: number, fy: number, minute: number, zone: Zone): MatchEvent {
  const line = Y.team.lineup.tactics.line;
  const behind = line === 'high' ? 1.35 : line === 'deep' ? 0.75 : 1;
  const paceEdge = ratio(X.r.transition * fx, Y.r.recoveryPace * 2.2 * fy);
  const shooter = pickShooter(rng, X, 'center');
  const xg = clamp(TUNING.xgLong * behind * paceEdge ** 1.2 * finishing(shooter, Y), 0.02, 0.5);
  const cause = line === 'high' ? 'ball over a high line' : 'long ball won up front';
  return shot(rng, team, 'longball', zone, shooter, xg, minute, cause);
}

function setPiece(rng: Rng, team: 0 | 1, X: Side, Y: Side, minute: number, zone: Zone): MatchEvent {
  const shooter = pickShooter(rng, X, 'center');
  const xg = clamp(TUNING.xgSetPiece * ratio(X.r.setPieces, Y.r.aerial * 0.75) * (12 / (Y.r.keeper + 4)) * 1.0, 0.02, 0.35);
  return shot(rng, team, 'setpiece', zone, shooter, xg, minute, 'set piece');
}

function pressWinChance(P: Side, V: Side): number {
  const level = LEVEL[P.team.lineup.tactics.press];
  return TUNING.pressWin * level * clamp(1.4 - V.r.pressResistance / 12, 0.2, 1.4);
}

function pressWin(rng: Rng, team: 0 | 1, P: Side, V: Side, minute: number): MatchEvent {
  const zone = rng.pick(ZONES, [0.25, 0.5, 0.25]);
  const shooter = pickShooter(rng, P, zone);
  const r = ratio(P.r.attack[zone], V.r.defense[zone] * 0.8);
  const xg = clamp(TUNING.xgPressWin * r ** 0.8 * finishing(shooter, V), 0.03, 0.45);
  return shot(rng, team, 'counter', zone, shooter, xg, minute, 'won the ball high up');
}

function counterChance(C: Side, V: Side, mult: number): number {
  // C counters against V. More bodies forward and a higher line mean more counters.
  const line = TUNING.counterLine[V.team.lineup.tactics.line];
  const threat = C.r.transition / 30;
  return clamp(TUNING.counterBase * mult * line * threat * (0.5 + V.r.commitment), 0, 0.4);
}

function counter(rng: Rng, team: 0 | 1, C: Side, V: Side, fc: number, fv: number, minute: number, stats: [TeamStats, TeamStats]): MatchEvent {
  const zone = rng.pick(ZONES, [0.3, 0.4, 0.3]);
  const line = V.team.lineup.tactics.line;
  // Who's left behind the ball, and can they get back?
  const behind = (V.r.defense.center * 0.6 + (V.r.defense.left + V.r.defense.right) * 0.2) * (1 - 0.55 * V.r.commitment);
  const recovery = (V.r.recoveryPace / 10) * (line === 'high' ? 0.8 : line === 'deep' ? 1.15 : 1);
  const r = ratio(C.r.transition * 0.45 * fc, behind * recovery * fv);
  const shooter = pickShooter(rng, C, zone, true);
  const xg = clamp(TUNING.xgCounter * r ** TUNING.xgCounterExp * finishing(shooter, V), 0.03, 0.6);
  const cause = r > 1.5 ? 'counter into an empty half' : 'quick break';
  const ev = shot(rng, team, 'counter', zone, shooter, xg, minute, cause);
  const s = stats[team];
  s.chances++;
  s.xg += ev.xg;
  s.counters++;
  if (ev.outcome === 'goal') s.goals++;
  return ev;
}

function finishing(shooter: Player, Y: Side): number {
  return ((shooter.skills.scoring + 6) / 18) * (16 / (Y.r.keeper + 6));
}

function pickShooter(rng: Rng, X: Side, zone: Zone, fast = false): Player {
  const weights = X.players.map(({ slot, p }) => {
    const role = roleOf(slot as never);
    const side = sideOf(slot as never);
    if (role === 'GK') return 0;
    let w =
      role === 'FW' ? 5 : role === 'WG' ? 2.5 : role === 'IM' ? 1.5 : role === 'WB' ? 0.6 : 0.4;
    if (zone !== 'center' && side === zone) w *= 1.8;
    if (fast) w *= 0.5 + p.skills.pace / 10;
    return w * (0.5 + p.skills.scoring / 10);
  });
  return rng.pick(X.players.map((x) => x.p), weights);
}

function shot(rng: Rng, team: 0 | 1, kind: EventKind, zone: Zone, shooter: Player, xg: number, minute: number, cause: string): MatchEvent {
  const roll = rng.next();
  const outcome = roll < xg ? 'goal' : roll < xg + (1 - xg) * 0.45 ? 'saved' : roll < xg + (1 - xg) * 0.8 ? 'missed' : 'blocked';
  return { minute, team, kind, zone, shooterId: shooter.id, xg: round(xg), outcome, cause };
}

function zoneWord(z: Zone): string {
  return z === 'center' ? 'through the middle' : `down the ${z}`;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export type { ZoneRatings };
