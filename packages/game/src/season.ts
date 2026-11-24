import { Rng } from '@pitchside/engine';
import type { Db } from './db.js';
import { insertMany } from './db.js';
import { CUP_DOW, CUP_HOUR, LEAGUE_DOW, LEAGUE_HOUR, seasonTime } from './time.js';

/** Double round-robin for 8 clubs: 14 rounds, each club home 7 times. */
export function roundRobin<T>(clubs: T[]): Array<Array<[T, T]>> {
  const n = clubs.length;
  const list = [...clubs];
  const rounds: Array<Array<[T, T]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[T, T]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]!;
      const b = list[n - 1 - i]!;
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Rotate everyone except the first club.
    list.splice(1, 0, list.pop()!);
  }
  return [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a] as [T, T]))];
}

export async function createSeason(db: Db, worldId: number, season: number, start: Date, seed: number): Promise<void> {
  const rng = new Rng(seed * 7919 + season);
  const clubs = await db.query<{ id: number; series_id: number; level: number }>(
    `select c.id, c.series_id, s.level from clubs c join series s on s.id = c.series_id where c.world_id = $1 order by c.series_id, c.id`,
    [worldId],
  );

  const bySeries = new Map<number, number[]>();
  for (const c of clubs) bySeries.set(c.series_id, [...(bySeries.get(c.series_id) ?? []), c.id]);

  const fixtures: Array<Record<string, unknown>> = [];
  for (const [seriesId, ids] of bySeries) {
    const order = [...ids].sort(() => rng.next() - 0.5);
    roundRobin(order).forEach((pairs, i) => {
      const kickoff = seasonTime(start, i + 1, LEAGUE_DOW, LEAGUE_HOUR).toISOString();
      for (const [home, away] of pairs) {
        fixtures.push({
          world_id: worldId, season, competition: 'league', round: i + 1, series_id: seriesId,
          home_id: home, away_id: away, kickoff, seed: Math.floor(rng.next() * 2 ** 31),
        });
      }
    });
  }
  await insertFixtures(db, fixtures);

  await insertMany(db, 'cup_entrants', { world_id: 'int', season: 'int', club_id: 'int' },
    clubs.map((c) => ({ world_id: worldId, season, club_id: c.id })));

  // Round one trims the field to a power of two. Lower-level clubs play it; higher clubs get byes.
  let bracket = 1;
  while (bracket * 2 <= clubs.length) bracket *= 2;
  const matches = clubs.length - bracket;
  if (matches > 0) {
    const pool = [...clubs].sort((a, b) => b.level - a.level || rng.next() - 0.5).slice(0, matches * 2).map((c) => c.id);
    await insertFixtures(db, pairUp(pool, rng, worldId, season, 1, start));
  }
}

function pairUp(ids: number[], rng: Rng, worldId: number, season: number, round: number, start: Date) {
  const shuffled = [...ids].sort(() => rng.next() - 0.5);
  const kickoff = seasonTime(start, round, CUP_DOW, CUP_HOUR).toISOString();
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    out.push({
      world_id: worldId, season, competition: 'cup', round, series_id: null,
      home_id: shuffled[i], away_id: shuffled[i + 1], kickoff, seed: Math.floor(rng.next() * 2 ** 31),
    });
  }
  return out;
}

export async function insertFixtures(db: Db, rows: Array<Record<string, unknown>>): Promise<void> {
  await insertMany(db, 'fixtures',
    { world_id: 'int', season: 'int', competition: 'text', round: 'int', series_id: 'int', home_id: 'int', away_id: 'int', kickoff: 'timestamptz', seed: 'int' },
    rows);
}

/** Draws the next cup round once the last one is over. Returns true if a round was drawn. */
export async function advanceCup(db: Db, worldId: number, now: Date): Promise<boolean> {
  const [w] = await db.query<{ season: number; season_start: string }>(`select season, season_start from worlds where id = $1`, [worldId]);
  if (!w) return false;
  const [last] = await db.query<{ round: number; open: number; ends: string }>(
    `select round, count(*) filter (where status <> 'played')::int as open, max(kickoff) + interval '95 minutes' as ends
     from fixtures where world_id = $1 and season = $2 and competition = 'cup'
     group by round order by round desc limit 1`,
    [worldId, w.season],
  );
  if (!last || last.open > 0 || new Date(last.ends) > now) return false;
  const remaining = await db.query<{ club_id: number }>(
    `select club_id from cup_entrants where world_id = $1 and season = $2 and out_round is null order by club_id`,
    [worldId, w.season],
  );
  if (remaining.length < 2) return false;
  const rng = new Rng(worldId * 1_000_003 + w.season * 101 + last.round);
  await insertFixtures(db, pairUp(remaining.map((r) => r.club_id), rng, worldId, w.season, last.round + 1, new Date(w.season_start)));
  return true;
}
