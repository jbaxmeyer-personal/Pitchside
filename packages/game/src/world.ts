import { Rng } from '@pitchside/engine';
import type { Skills } from '@pitchside/engine';
import type { Db } from './db.js';
import { insertMany } from './db.js';
import { CITIES, CLUB_SUFFIXES, FIRST_NAMES, KIT_COLORS, LAST_NAMES } from './names.js';
import { createSeason } from './season.js';
import { SKILL_COLUMNS, skillsToRow } from './skills.js';
import { nextMonday } from './time.js';

/** Series per level: 1, 4, 16, 64. Eight clubs each. */
export const LEVELS = [1, 4, 16, 64];
export const CLUBS_PER_SERIES = 8;
/** Typical main-skill level of a squad at each level. */
const LEVEL_QUALITY = [11.5, 10, 8.5, 7];

type Role = 'GK' | 'CB' | 'WB' | 'WG' | 'IM' | 'FW';
const SQUAD: Array<[Role, number]> = [['GK', 2], ['CB', 4], ['WB', 3], ['WG', 3], ['IM', 4], ['FW', 3]];

export function seriesName(level: number, number: number): string {
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][level - 1] ?? String(level);
  return level === 1 ? 'Premier' : `${roman}.${number}`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const clampSkill = (v: number) => Math.max(0.5, Math.min(20, r1(v)));

export function makeSkills(rng: Rng, role: Role, q: number): Skills {
  const n = () => rng.noise();
  const low = () => clampSkill(2 + rng.next() * 4);
  const s: Skills = {
    keeper: role === 'GK' ? 0 : clampSkill(0.5 + rng.next() * 1.5),
    defending: low(), playmaking: low(), winger: low(), passing: low(), scoring: low(),
    setPieces: clampSkill(2 + rng.next() * 8),
    stamina: clampSkill(q - 1 + n() * 1.5),
    pace: clampSkill(6 + n() * 2.5),
    strength: clampSkill(6 + n() * 2.5),
  };
  const main = clampSkill(q + n() * 1.4);
  const side = (k: keyof Skills, f: number) => { s[k] = clampSkill(q * f + n()); };
  switch (role) {
    case 'GK': s.keeper = main; side('passing', 0.4); break;
    case 'CB': s.defending = main; side('strength', 0.95); side('passing', 0.55); side('playmaking', 0.4); break;
    case 'WB': s.defending = clampSkill(main - 0.5); side('winger', 0.7); side('pace', 0.95); side('passing', 0.55); break;
    case 'WG': s.winger = main; side('pace', 0.95); side('passing', 0.65); side('playmaking', 0.55); side('scoring', 0.45); break;
    case 'IM': s.playmaking = main; side('passing', 0.8); side('defending', 0.55); side('scoring', 0.45); break;
    case 'FW': s.scoring = main; side('pace', 0.85); side('strength', 0.8); side('passing', 0.55); break;
  }
  return s;
}

export function wageFor(s: Skills): number {
  const top = Math.max(s.keeper, s.defending, s.playmaking, s.winger, s.scoring);
  return Math.round((300 * 1.32 ** (top - 5)) / 10) * 10;
}

export interface GeneratedWorld {
  series: Array<{ level: number; number: number; name: string }>;
  clubs: Array<{ key: string; level: number; number: number; name: string; city: string; colors: { primary: string; secondary: string }; badge_seed: number; fans: number; cash: number }>;
  players: Array<{ club_key: string; first_name: string; last_name: string; age: number; skills: Skills; form: number; portrait_seed: number; wage: number }>;
}

/** Pure: the same seed always builds the same country. */
export function generateWorld(seed: number): GeneratedWorld {
  const rng = new Rng(seed);
  const series: GeneratedWorld['series'] = [];
  const clubs: GeneratedWorld['clubs'] = [];
  const players: GeneratedWorld['players'] = [];

  // Spread clubs across cities: every city gets one club before any gets a second.
  const total = LEVELS.reduce((a, b) => a + b, 0) * CLUBS_PER_SERIES;
  const shuffle = <T,>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const cities = shuffle(CITIES);
  const usedSuffix = new Map<string, Set<string>>();
  const picked: Array<{ name: string; city: string }> = [];
  while (picked.length < total) {
    for (const city of cities) {
      if (picked.length >= total) break;
      const used = usedSuffix.get(city) ?? new Set<string>();
      const suffix = shuffle(CLUB_SUFFIXES).find((x) => !used.has(x));
      if (!suffix) continue;
      used.add(suffix);
      usedSuffix.set(city, used);
      picked.push({ name: `${city} ${suffix}`, city });
    }
  }

  let k = 0;
  LEVELS.forEach((count, li) => {
    const level = li + 1;
    for (let number = 1; number <= count; number++) {
      series.push({ level, number, name: seriesName(level, number) });
      for (let c = 0; c < CLUBS_PER_SERIES; c++) {
        const pick = picked[k++]!;
        const [primary, secondary] = KIT_COLORS[Math.floor(rng.next() * KIT_COLORS.length)]!;
        const key = `${level}.${number}.${c}`;
        const clubQ = LEVEL_QUALITY[li]! + rng.noise() * 0.5;
        clubs.push({
          key, level, number, name: pick.name, city: pick.city,
          colors: { primary, secondary },
          badge_seed: Math.floor(rng.next() * 1e9),
          fans: Math.round((60 + rng.next() * 80) * (5 - li) ** 2),
          cash: Math.round((150_000 + rng.next() * 100_000) * (5 - li)),
        });
        for (const [role, n] of SQUAD) {
          for (let i = 0; i < n; i++) {
            const skills = makeSkills(rng, role, clubQ);
            players.push({
              club_key: key,
              first_name: FIRST_NAMES[Math.floor(rng.next() * FIRST_NAMES.length)]!,
              last_name: LAST_NAMES[Math.floor(rng.next() * LAST_NAMES.length)]!,
              age: 17 + Math.floor(rng.next() * 17),
              skills,
              form: r1(0.9 + rng.next() * 0.2),
              portrait_seed: Math.floor(rng.next() * 1e9),
              wage: wageFor(skills),
            });
          }
        }
      }
    }
  });
  return { series, clubs, players };
}

/** Creates a world in the database with its first season scheduled. Returns the world id. */
export async function initWorld(db: Db, opts: { name: string; seed: number; now: Date; live?: boolean }): Promise<number> {
  const gen = generateWorld(opts.seed);
  return db.tx(async (tx) => {
    const start = nextMonday(opts.now);
    const [w] = await tx.query<{ id: number }>(
      `insert into worlds (name, is_live, season, season_start) values ($1, $2, 1, $3) returning id`,
      [opts.name, opts.live ?? false, start.toISOString()],
    );
    const worldId = w!.id;

    const series = await insertMany(tx, 'series', { world_id: 'int', level: 'int', number: 'int', name: 'text' },
      gen.series.map((s) => ({ ...s, world_id: worldId })), 'id, level, number');
    const seriesId = new Map(series.map((s) => [`${s.level}.${s.number}`, s.id as number]));

    const clubs = await insertMany(tx, 'clubs',
      { world_id: 'int', series_id: 'int', name: 'text', city: 'text', colors: 'jsonb', badge_seed: 'int', fans: 'int', cash: 'bigint' },
      gen.clubs.map((c) => ({
        world_id: worldId, series_id: seriesId.get(`${c.level}.${c.number}`), name: c.name, city: c.city,
        colors: c.colors, badge_seed: c.badge_seed, fans: c.fans, cash: c.cash,
      })), 'id');
    const clubId = new Map(gen.clubs.map((c, i) => [c.key, clubs[i]!.id as number]));

    await insertMany(tx, 'players',
      {
        world_id: 'int', club_id: 'int', first_name: 'text', last_name: 'text', age: 'int', form: 'real', portrait_seed: 'int', wage: 'int',
        ...Object.fromEntries(Object.values(SKILL_COLUMNS).map((c) => [c, 'real'])),
      },
      gen.players.map((p) => ({
        world_id: worldId, club_id: clubId.get(p.club_key), first_name: p.first_name, last_name: p.last_name,
        age: p.age, form: p.form, portrait_seed: p.portrait_seed, wage: p.wage, ...skillsToRow(p.skills),
      })));

    await createSeason(tx, worldId, 1, start, opts.seed);
    return worldId;
  });
}
