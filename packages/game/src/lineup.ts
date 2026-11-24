import type { Lineup, Player, Skills, Slot, Tactics } from '@pitchside/engine';
import { roleOf } from '@pitchside/engine';

export const FORMATIONS: Record<string, Slot[]> = {
  '4-4-2': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LW', 'LCM', 'RCM', 'RW', 'LF', 'RF'],
  '4-3-3': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LF', 'CF', 'RF'],
  '4-5-1': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LW', 'LCM', 'CM', 'RCM', 'RW', 'CF'],
  '3-5-2': ['GK', 'LCB', 'CB', 'RCB', 'LW', 'LCM', 'CM', 'RCM', 'RW', 'LF', 'RF'],
  '3-4-3': ['GK', 'LCB', 'CB', 'RCB', 'LW', 'LCM', 'RCM', 'RW', 'LF', 'CF', 'RF'],
  '5-3-2': ['GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LF', 'RF'],
  '5-4-1': ['GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LW', 'LCM', 'RCM', 'RW', 'CF'],
  '5-2-3': ['GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LCM', 'RCM', 'LF', 'CF', 'RF'],
  '2-5-3': ['GK', 'LCB', 'RCB', 'LW', 'LCM', 'CM', 'RCM', 'RW', 'LF', 'CF', 'RF'],
};

export const DEFAULT_TACTICS: Tactics = {
  width: 'balanced', line: 'normal', press: 'normal', style: 'balanced', mentality: 'balanced',
};

/** How well a player fits a slot's role. Shown in the lineup editor too. */
export function fit(slot: Slot, s: Skills): number {
  switch (roleOf(slot)) {
    case 'GK': return s.keeper;
    case 'CB': return s.defending + s.strength * 0.15 + s.pace * 0.05;
    case 'WB': return s.defending * 0.7 + s.winger * 0.3 + s.pace * 0.2;
    case 'WG': return s.winger + s.pace * 0.2 + s.passing * 0.2 + s.playmaking * 0.2;
    case 'IM': return s.playmaking + s.passing * 0.3 + s.defending * 0.2;
    case 'FW': return s.scoring + s.pace * 0.15 + s.passing * 0.1 + s.strength * 0.1;
  }
}

export type NaturalRole = 'GK' | 'CB' | 'WB' | 'W' | 'CM' | 'FW';

/** A player's natural position, from his strongest skill. */
export function naturalRole(s: Skills): NaturalRole {
  const top = Math.max(s.keeper, s.defending, s.playmaking, s.winger, s.scoring);
  if (top === s.keeper) return 'GK';
  if (top === s.defending) return s.winger >= s.defending * 0.55 ? 'WB' : 'CB';
  if (top === s.playmaking) return 'CM';
  if (top === s.winger) return 'W';
  return 'FW';
}

/** Best XI for a formation, filling the most specialised slots first. Keepers only play in goal if possible. */
export function autoPick(players: Player[], formation = '4-4-2', tactics = DEFAULT_TACTICS): Lineup {
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-4-2']!;
  const order = [...slots].sort((a, b) => rank(a) - rank(b));
  const used = new Set<string>();
  const out: Lineup['slots'] = {};
  for (const slot of order) {
    let best: Player | undefined;
    const outfield = slot !== 'GK';
    const score = (p: Player) => fit(slot, p.skills) - (outfield === (naturalRole(p.skills) === 'GK') ? 100 : 0);
    for (const p of players) {
      if (used.has(p.id)) continue;
      if (!best || score(p) > score(best)) best = p;
    }
    if (best) {
      used.add(best.id);
      out[slot] = best;
    }
  }
  return { slots: out, tactics };
}

function rank(slot: Slot): number {
  return { GK: 0, FW: 1, IM: 2, CB: 3, WG: 4, WB: 5 }[roleOf(slot)];
}
