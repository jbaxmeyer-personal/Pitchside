import type { Lineup, Player, Slot, TeamRatings, Zone, ZoneRatings } from './types.js';

type Role = 'GK' | 'CB' | 'WB' | 'WG' | 'IM' | 'FW';

const ROLE: Record<Slot, Role> = {
  GK: 'GK',
  LB: 'WB', RB: 'WB',
  LCB: 'CB', CB: 'CB', RCB: 'CB',
  LW: 'WG', RW: 'WG',
  LCM: 'IM', CM: 'IM', RCM: 'IM',
  LF: 'FW', CF: 'FW', RF: 'FW',
};

const SIDE: Record<Slot, Zone> = {
  GK: 'center',
  LB: 'left', LCB: 'left', LW: 'left', LCM: 'left', LF: 'left',
  RB: 'right', RCB: 'right', RW: 'right', RCM: 'right', RF: 'right',
  CB: 'center', CM: 'center', CF: 'center',
};

export const roleOf = (slot: Slot): Role => ROLE[slot];
export const sideOf = (slot: Slot): Zone => SIDE[slot];

const zr = (): ZoneRatings => ({ left: 0, center: 0, right: 0 });

/** Adds a sideways contribution: to the player's own side, or split across both if central. */
function addSide(target: ZoneRatings, side: Zone, value: number): void {
  if (side === 'center') {
    target.left += value / 2;
    target.right += value / 2;
  } else {
    target[side] += value;
  }
}

const MENTALITY_SHIFT = { defensive: -0.15, balanced: 0, attacking: 0.15 } as const;

export function filledSlots(lineup: Lineup): Array<[Slot, Player]> {
  return Object.entries(lineup.slots).filter((e): e is [Slot, Player] => e[1] !== undefined);
}

export function validateLineup(lineup: Lineup): string[] {
  const errors: string[] = [];
  const filled = filledSlots(lineup);
  if (filled.length !== 11) errors.push(`needs 11 players, has ${filled.length}`);
  if (!lineup.slots.GK) errors.push('needs a goalkeeper');
  const ids = new Set(filled.map(([, p]) => p.id));
  if (ids.size !== filled.length) errors.push('a player is in two slots');
  return errors;
}

/**
 * Turns a lineup into the ratings the engine plays with.
 * Every number here is visible to users, so a result can always be explained.
 */
export function computeRatings(lineup: Lineup): TeamRatings {
  const attack = zr();
  const defense = zr();
  let midfield = 0;
  let transition = 0;
  let structure = 0;
  let keeper = 0;
  let passingSum = 0;
  let passingCount = 0;
  let setPieceTaker = 0;
  let aerialSum = 0;
  let aerialCount = 0;
  let longBall = 0;
  let pressRes = 0;
  let pressResCount = 0;
  let backPace = 0;
  let backCount = 0;
  let midPace = 0;
  let midCount = 0;
  let staminaSum = 0;
  let cbCount = 0;
  let cbStrength = 0;
  let otherStrength = 0;
  const sideCover = { left: 0, right: 0 };

  for (const [slot, p] of filledSlots(lineup)) {
    const s = p.skills;
    const f = p.form;
    const role = ROLE[slot];
    const side = SIDE[slot];
    staminaSum += s.stamina;

    if (role === 'GK') {
      keeper = s.keeper * f;
      continue;
    }

    passingSum += s.passing;
    if (role !== 'CB') otherStrength += s.strength;
    passingCount++;
    setPieceTaker = Math.max(setPieceTaker, s.setPieces * f);

    switch (role) {
      case 'CB':
        cbCount++;
        cbStrength += s.strength;
        if (side !== 'center') sideCover[side] += 0.5;
        defense.center += s.defending * 1.0 * f;
        addSide(defense, side, s.defending * (side === 'center' ? 0.3 : 0.45) * f);
        midfield += s.playmaking * 0.15 * f;
        longBall += s.passing * 0.35;
        pressRes += s.passing + s.playmaking * 0.5;
        pressResCount++;
        aerialSum += s.strength;
        aerialCount++;
        backPace += s.pace;
        backCount++;
        break;
      case 'WB':
        if (side !== 'center') sideCover[side] += 1;
        addSide(defense, side, (s.defending * 0.9 + s.pace * 0.1) * f);
        defense.center += s.defending * 0.2 * f;
        addSide(attack, side, (s.winger * 0.35 + s.pace * 0.1) * f);
        midfield += s.playmaking * 0.2 * f;
        transition += s.pace * 0.1 * f;
        structure += 0.25;
        backPace += s.pace;
        backCount++;
        break;
      case 'WG':
        addSide(attack, side, (s.winger * 0.7 + s.passing * 0.2 + s.pace * 0.15) * f);
        attack.center += s.passing * 0.15 * f;
        addSide(defense, side, s.defending * 0.45 * f);
        midfield += s.playmaking * 0.5 * f;
        transition += (s.pace * 0.35 + s.winger * 0.15) * f;
        structure += 0.6;
        midPace += s.pace;
        midCount++;
        break;
      case 'IM':
        midfield += s.playmaking * 1.0 * f;
        attack.center += (s.passing * 0.3 + s.scoring * 0.15) * f;
        addSide(attack, side, s.passing * 0.1 * f);
        defense.center += s.defending * 0.4 * f;
        addSide(defense, side, s.defending * 0.1 * f);
        transition += s.passing * 0.15 * f;
        longBall += s.passing * 0.25;
        pressRes += s.passing + s.playmaking;
        pressResCount++;
        structure += 0.25;
        midPace += s.pace;
        midCount++;
        break;
      case 'FW':
        attack.center += (s.scoring * 0.75 + s.passing * 0.15 + s.strength * 0.1) * f * (side === 'center' ? 1 : 0.7);
        addSide(attack, side, (s.scoring * 0.25 + s.winger * 0.2) * f);
        midfield += s.playmaking * 0.25 * f;
        defense.center += s.defending * 0.05 * f;
        transition += (s.pace * 0.5 + s.scoring * 0.2 + s.passing * 0.1) * f;
        longBall += s.strength * 0.4 + s.pace * 0.3;
        aerialSum += s.strength;
        aerialCount++;
        structure += 1;
        break;
    }
  }

  // Exposure: a zone without a specialist defender is covered by players out of position.
  defense.center *= cbCount === 0 ? 0.65 : cbCount === 1 ? 0.8 : 1;
  if (sideCover.left === 0) defense.left *= 0.8;
  if (sideCover.right === 0) defense.right *= 0.8;

  const t = lineup.tactics;
  const commitment = clamp(structure / 7 + MENTALITY_SHIFT[t.mentality], 0.1, 1);
  const avgPassing = passingCount ? passingSum / passingCount : 0;

  return {
    midfield,
    attack,
    defense,
    transition,
    commitment,
    keeper,
    setPieces: setPieceTaker * 0.6 + (aerialCount ? aerialSum / aerialCount : 0) * 0.4,
    aerial: cbCount ? (cbStrength / cbCount) * Math.min(1, 0.6 + cbCount * 0.2) : (otherStrength / 10) * 0.6,
    buildUp: avgPassing,
    longBall,
    pressResistance: pressResCount ? pressRes / pressResCount / 1.5 : avgPassing * 0.7,
    // No defenders at all means midfielders have to chase back, more slowly.
    recoveryPace: backCount ? backPace / backCount : midCount ? (midPace / midCount) * 0.8 : 4,
    fitness: staminaSum / 11 / 20,
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
