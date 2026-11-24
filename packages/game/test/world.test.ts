import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/index.js';
import { autoPick, generateWorld, initWorld, roundRobin, tick, warp, worldNow } from '../src/index.js';

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

// What Supabase provides out of the box, stubbed for a local Postgres.
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
`;

function wrap(pg: PGlite): Db {
  const make = (q: { query: PGlite['query'] }, top: boolean): Db => ({
    query: async (sql, params) => (await q.query(sql, params)).rows as never,
    tx: (fn) => (top ? pg.transaction((t) => fn(make(t, false))) : fn(make(q, false))),
  });
  return make(pg, true);
}

let pg: PGlite;
let db: Db;
let worldId: number;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !f.includes('cron')).sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  db = wrap(pg);
  worldId = await initWorld(db, { name: 'Test USA', seed: 1, now: new Date('2026-11-24T16:00:00Z') });
}, 60_000);

const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: number }>(sql, params))[0]!.n);

describe('world', () => {
  it('generates the same country from the same seed', () => {
    expect(generateWorld(5).clubs.slice(0, 3)).toEqual(generateWorld(5).clubs.slice(0, 3));
  });

  it('builds the full pyramid with unique club names', async () => {
    expect(await count(`select count(*) n from series where world_id = $1`, [worldId])).toBe(85);
    expect(await count(`select count(*) n from clubs where world_id = $1`, [worldId])).toBe(680);
    expect(await count(`select count(distinct name) n from clubs where world_id = $1`, [worldId])).toBe(680);
    expect(await count(`select count(*) n from players where world_id = $1`, [worldId])).toBe(680 * 19);
  });

  it('schedules 14 league rounds and a first cup round', async () => {
    expect(await count(`select count(*) n from fixtures where competition = 'league'`)).toBe(85 * 4 * 14);
    expect(await count(`select count(*) n from fixtures where competition = 'cup'`)).toBe(680 - 512);
    const [first] = await db.query<{ k: string }>(`select min(kickoff) k from fixtures where competition = 'league'`);
    // Sunday Dec 6 2026, 2pm Central = 20:00 UTC.
    expect(new Date(first!.k).toISOString()).toBe('2026-12-06T20:00:00.000Z');
  });

  it('round robin meets everyone twice', () => {
    const rounds = roundRobin([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rounds).toHaveLength(14);
    const meetings = new Map<string, number>();
    for (const r of rounds) for (const [a, b] of r) {
      const k = [a, b].sort().join('-');
      meetings.set(k, (meetings.get(k) ?? 0) + 1);
    }
    expect([...meetings.values()].every((n) => n === 2)).toBe(true);
    expect(meetings.size).toBe(28);
  });
});

describe('clubs and orders', () => {
  const user = '00000000-0000-0000-0000-000000000001';
  const asUser = async <T,>(fn: () => Promise<T>) => {
    await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    try { return await fn(); } finally { await pg.query(`select set_config('request.jwt.claim.sub', '', false)`); }
  };

  it('lets a new user take over a bottom-level bot club', async () => {
    await pg.query(`insert into auth.users (id) values ($1)`, [user]);
    const clubId = await asUser(async () => (await db.query<{ c: number }>(`select claim_club($1, 'John') c`, [worldId]))[0]!.c);
    const [lvl] = await db.query<{ level: number }>(`select s.level from clubs c join series s on s.id = c.series_id where c.id = $1`, [clubId]);
    expect(lvl!.level).toBe(4);
    const again = await asUser(async () => (await db.query<{ c: number }>(`select claim_club($1, 'John') c`, [worldId]))[0]!.c);
    expect(again).toBe(clubId);
  });

  it('accepts a valid lineup and rejects someone else\'s player', async () => {
    const [club] = await db.query<{ id: number }>(`select id from clubs where owner = $1`, [user]);
    const players = await db.query<{ id: number; skills: never; first_name: string }>(`select id, skills, first_name from players where club_id = $1`, [club!.id]);
    const lineup = autoPick(players.map((p) => ({ id: String(p.id), name: p.first_name, skills: p.skills, form: 1 })), '4-3-3');
    const slots = Object.fromEntries(Object.entries(lineup.slots).map(([s, p]) => [s, Number(p!.id)]));
    await asUser(() => db.query(`select save_orders($1::jsonb, $2::jsonb)`, [JSON.stringify(slots), JSON.stringify({ press: 'high' })]));
    expect(await count(`select count(*) n from club_orders where club_id = $1`, [club!.id])).toBe(1);

    const [other] = await db.query<{ id: number }>(`select id from players where club_id <> $1 limit 1`, [club!.id]);
    const bad = { ...slots, CF: other!.id };
    await expect(asUser(() => db.query(`select save_orders($1::jsonb, '{}'::jsonb)`, [JSON.stringify(bad)]))).rejects.toThrow();
  });
});

describe('the season', () => {
  it('plays matches at kickoff and hides the score until full time', async () => {
    await warp(db, worldId, 'next-kickoff');
    const r = await tick(db, worldId);
    expect(r.played).toBe(168);
    const [live] = await db.query<{ state: string; home_goals: number | null }>(
      `select state, home_goals from fixtures_public where competition = 'cup' and round = 1 limit 1`,
    );
    expect(live).toEqual({ state: 'live', home_goals: null });
    expect(await count(`select count(*) n from cup_entrants where out_round = 1`)).toBe(168);

    await warp(db, worldId, 'next-week');
    await tick(db, worldId);
    const [done] = await db.query<{ state: string; home_goals: number | null }>(
      `select state, home_goals from fixtures_public where competition = 'cup' and round = 1 limit 1`,
    );
    expect(done!.state).toBe('final');
    expect(done!.home_goals).not.toBeNull();
    expect(await count(`select count(*) n from fixtures where competition = 'cup' and round = 2`)).toBe(256);
  }, 120_000);

  it('runs a whole season, then promotes and relegates', async () => {
    const before = await db.query<{ id: number; level: number }>(`select c.id, s.level from clubs c join series s on s.id = c.series_id`);
    await warp(db, worldId, 'season-end');
    let rolled = false;
    for (let i = 0; i < 20 && !rolled; i++) rolled = (await tick(db, worldId)).rolled;
    expect(rolled).toBe(true);

    const [w] = await db.query<{ season: number }>(`select season from worlds where id = $1`, [worldId]);
    expect(w!.season).toBe(2);
    expect(await count(`select count(*) n from cup_entrants where season = 1 and out_round is null`)).toBe(1);
    // Still eight clubs in every series.
    const sizes = await db.query<{ n: number }>(`select count(*)::int n from clubs group by series_id`);
    expect(sizes.every((s) => s.n === 8)).toBe(true);
    const after = new Map((await db.query<{ id: number; level: number }>(`select c.id, s.level from clubs c join series s on s.id = c.series_id`)).map((r) => [r.id, r.level]));
    const up = before.filter((b) => after.get(b.id)! < b.level).length;
    const down = before.filter((b) => after.get(b.id)! > b.level).length;
    expect(up).toBe((1 + 4 + 16) * 2);
    expect(down).toBe(up);
    expect(await count(`select count(*) n from fixtures where season = 2 and competition = 'league'`)).toBe(85 * 4 * 14);
    expect((await worldNow(db, worldId)).getTime()).toBeGreaterThan(0);
  }, 300_000);
});
