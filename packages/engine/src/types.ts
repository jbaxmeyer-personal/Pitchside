/** Skill levels run 0–20. 10 is a solid pro, 15 elite, 20 world class. */
export interface Skills {
  keeper: number;
  defending: number;
  playmaking: number;
  winger: number;
  passing: number;
  scoring: number;
  setPieces: number;
  stamina: number;
  pace: number;
  strength: number;
}

export interface Player {
  id: string;
  name: string;
  skills: Skills;
  /** Current form as a multiplier, roughly 0.8–1.1. */
  form: number;
}

/**
 * Pitch slots, mirroring the classic 14-slot layout:
 * keeper, 2 wing backs, up to 3 central defenders, 2 wingers,
 * up to 3 inner midfielders, up to 3 forwards.
 */
export type Slot =
  | 'GK'
  | 'LB' | 'LCB' | 'CB' | 'RCB' | 'RB'
  | 'LW' | 'LCM' | 'CM' | 'RCM' | 'RW'
  | 'LF' | 'CF' | 'RF';

export const SLOTS: readonly Slot[] = [
  'GK', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'LW', 'LCM', 'CM', 'RCM', 'RW', 'LF', 'CF', 'RF',
];

export type Zone = 'left' | 'center' | 'right';
export const ZONES: readonly Zone[] = ['left', 'center', 'right'];

export interface Tactics {
  /** How the team spreads its attacks. */
  width: 'narrow' | 'balanced' | 'wide';
  /** Height of the defensive line. */
  line: 'deep' | 'normal' | 'high';
  /** Pressing intensity without the ball. */
  press: 'off' | 'normal' | 'high';
  /** How the team moves the ball forward. */
  style: 'possession' | 'balanced' | 'direct';
  /** How many players push forward in attack. */
  mentality: 'defensive' | 'balanced' | 'attacking';
}

export interface Lineup {
  /** Exactly 11 slots filled; GK required. */
  slots: Partial<Record<Slot, Player>>;
  tactics: Tactics;
}

export interface TeamInput {
  id: string;
  name: string;
  lineup: Lineup;
}

export interface ZoneRatings {
  left: number;
  center: number;
  right: number;
}

/** What the engine computes from a lineup before kickoff. Shown to users. */
export interface TeamRatings {
  midfield: number;
  attack: ZoneRatings;
  defense: ZoneRatings;
  /** Counter-attack threat. */
  transition: number;
  /** How many players join attacks: 0 (none) to ~1 (everyone). */
  commitment: number;
  keeper: number;
  setPieces: number;
  /** Defending crosses and set pieces in the box. */
  aerial: number;
  /** Build-up quality through midfield vs over the top. */
  buildUp: number;
  longBall: number;
  /** Ability to beat a press. */
  pressResistance: number;
  /** Speed of the back line against balls in behind. */
  recoveryPace: number;
  /** Fitness factor, 0–1; higher holds ratings later in the match. */
  fitness: number;
}

export type EventKind = 'open' | 'counter' | 'setpiece' | 'longball';
export type Outcome = 'goal' | 'saved' | 'missed' | 'blocked';

export interface MatchEvent {
  minute: number;
  team: 0 | 1;
  kind: EventKind;
  zone: Zone;
  shooterId: string;
  /** Probability this chance became a goal, 0–1. Shown in reports as xG. */
  xg: number;
  outcome: Outcome;
  /** Short reason the chance happened, for match reports. */
  cause: string;
}

export interface TeamStats {
  goals: number;
  possession: number;
  chances: number;
  xg: number;
  counters: number;
}

export interface MatchResult {
  seed: number;
  ratings: [TeamRatings, TeamRatings];
  stats: [TeamStats, TeamStats];
  events: MatchEvent[];
  /** Possession owner per tick, for the 3D director and live view. */
  possessionTimeline: Array<{ minute: number; team: 0 | 1; zone: Zone; progressed: boolean }>;
}
