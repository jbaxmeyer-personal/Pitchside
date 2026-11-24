import type { Lineup, Player, Skills, Slot, Tactics, TeamInput } from '@pitchside/engine';
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
  '1CB 2WB-5-2': ['GK', 'LB', 'CB', 'RB', 'LW', 'LCM', 'CM', 'RCM', 'RW', 'CF', 'RF'],
  '0CB 2WB-5-3': ['GK', 'LB', 'RB', 'LW', 'LCM', 'CM', 'RCM', 'RW', 'LF', 'CF', 'RF'],
};

export const PRESETS: Record<string, Tactics> = {
  balanced: { width: 'balanced', line: 'normal', press: 'normal', style: 'balanced', mentality: 'balanced' },
  possession: { width: 'narrow', line: 'normal', press: 'normal', style: 'possession', mentality: 'balanced' },
  counter: { width: 'balanced', line: 'deep', press: 'off', style: 'direct', mentality: 'defensive' },
  highpress: { width: 'balanced', line: 'high', press: 'high', style: 'balanced', mentality: 'attacking' },
  wings: { width: 'wide', line: 'normal', press: 'normal', style: 'balanced', mentality: 'attacking' },
};

const base = (o: Partial<Skills>): Skills => ({
  keeper: 2, defending: 5, playmaking: 5, winger: 4, passing: 6, scoring: 4,
  setPieces: 6, stamina: 11, pace: 9, strength: 9, ...o,
});

/** A specialist for each role at the same quality level Q. */
export function specialist(slot: Slot, q: number): Skills {
  switch (roleOf(slot)) {
    case 'GK': return base({ keeper: q, passing: 4, pace: 6 });
    case 'CB': return base({ defending: q, strength: 11, passing: 7 });
    case 'WB': return base({ defending: q - 1, pace: 11, winger: 9, passing: 7 });
    case 'WG': return base({ winger: q, pace: 11, passing: 8, playmaking: 7, scoring: 6 });
    case 'IM': return base({ playmaking: q, passing: 10, defending: 7, scoring: 6 });
    case 'FW': return base({ scoring: q, pace: 10, strength: 10, passing: 7, playmaking: 4, winger: 5 });
  }
}

export function buildTeam(id: string, formation: string, tactics: Tactics, q = 12): TeamInput {
  const slots: Lineup['slots'] = {};
  for (const slot of FORMATIONS[formation]!) {
    const p: Player = { id: `${id}-${slot}`, name: `${slot}`, skills: specialist(slot, q), form: 1 };
    slots[slot] = p;
  }
  return { id, name: `${formation} ${id}`, lineup: { slots, tactics } };
}
