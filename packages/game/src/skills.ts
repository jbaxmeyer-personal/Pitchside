import type { Skills } from '@pitchside/engine';

/** Database column for each skill. */
export const SKILL_COLUMNS: Record<keyof Skills, string> = {
  keeper: 'keeper', defending: 'defending', playmaking: 'playmaking', winger: 'winger', passing: 'passing',
  scoring: 'scoring', setPieces: 'set_pieces', stamina: 'stamina', pace: 'pace', strength: 'strength',
};

/** Comma-separated column list for selects. */
export const SKILL_SELECT = Object.values(SKILL_COLUMNS).join(', ');

export function skillsFromRow(row: Record<string, unknown>): Skills {
  const out = {} as Skills;
  for (const [k, col] of Object.entries(SKILL_COLUMNS)) out[k as keyof Skills] = Number(row[col]);
  return out;
}

export function skillsToRow(s: Skills): Record<string, number> {
  return Object.fromEntries(Object.entries(SKILL_COLUMNS).map(([k, col]) => [col, s[k as keyof Skills]]));
}
