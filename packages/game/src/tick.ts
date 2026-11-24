import { Rng, simulateMatch, validateLineup } from '@pitchside/engine';
import type { Lineup, Player, Skills, Slot, Tactics, TeamInput } from '@pitchside/engine';
import type { Db } from './db.js';
import { autoPick, DEFAULT_TACTICS } from './lineup.js';
import { advanceCup, createSeason } from './season.js';
import { seasonEnd } from './time.js';

interface FixtureRow { id: number; competition: string; round: number; home_id: number; away_id: number; seed: number }
interface PlayerRow { id: number; club_id: number; first_name: string; last_name: string; skills: Skills; form: number }
interface OrdersRow { club_id: number; slots: Record<string, number>; tactics: Tactics }

export async function worldNow(db: Db, worldId: number): Promise<Date> {
  const [r] = await db.query<{ t: string | Date }>(`select world_now($1) as t`, [worldId]);
  return new Date(r!.t);
}

/** Builds a club's lineup from its orders, falling back to an automatic best XI. */
export function lineupFor(players: Player[], orders: OrdersRow | undefined): Lineup {
  if (orders) {
    const byId = new Map(players.map((p) => [p.id, p]));
    const slots: Lineup['slots'] = {};
    for (const [slot, pid] of Object.entries(orders.slots)) slots[slot as Slot] = byId.get(String(pid));
    const lineup = { slots, tactics: { ...DEFAULT_TACTICS, ...orders.tactics } };
    if (validateLineup(lineup).length === 0) return lineup;
  }
  return autoPick(players);
}

/** Plays every match that has reached kickoff on the world clock. */
export async function playDue(db: Db, worldId: number, now: Date, limit = 400): Promise<number> {
  const fixtures = await db.query<FixtureRow>(
    `select id, competition, round, home_id, away_id, seed from fixtures
     where world_id = $1 and status = 'scheduled' and kickoff <= $2 order by kickoff, id limit $3`,
    [worldId, now.toISOString(), limit],
  );
  if (!fixtures.length) return 0;

  const clubIds = [...new Set(fixtures.flatMap((f) => [f.home_id, f.away_id]))];
  const playerRows = await db.query<PlayerRow>(
    `select id, club_id, first_name, last_name, skills, form from players where club_id = any($1::int[])`, [clubIds],
  );
  const orderRows = await db.query<OrdersRow>(`select club_id, slots, tactics from club_orders where club_id = any($1::int[])`, [clubIds]);
  const clubRows = await db.query<{ id: number; name: string }>(`select id, name from clubs where id = any($1::int[])`, [clubIds]);

  const squads = new Map<number, Player[]>();
  for (const p of playerRows) {
    const player: Player = { id: String(p.id), name: `${p.first_name} ${p.last_name}`, skills: p.skills, form: Number(p.form) };
    squads.set(p.club_id, [...(squads.get(p.club_id) ?? []), player]);
  }
  const orders = new Map(orderRows.map((o) => [o.club_id, o]));
  const names = new Map(clubRows.map((c) => [c.id, c.name]));

  for (const f of fixtures) {
    const team = (id: number): TeamInput => ({
      id: String(id), name: names.get(id) ?? String(id), lineup: lineupFor(squads.get(id) ?? [], orders.get(id)),
    });
    const home = team(f.home_id);
    const away = team(f.away_id);
    const result = simulateMatch(home, away, f.seed);
    const hg = result.stats[0].goals;
    const ag = result.stats[1].goals;
    let winner: number | null = hg > ag ? f.home_id : ag > hg ? f.away_id : null;
    let penalties: [number, number] | null = null;
    if (f.competition === 'cup' && winner === null) {
      const rng = new Rng(f.seed + 1);
      const a = 3 + Math.floor(rng.next() * 3);
      const b = a + (rng.chance(0.5) ? 1 : -1);
      penalties = [Math.max(a, b), Math.min(a, b)];
      winner = rng.chance(0.5) ? f.home_id : f.away_id;
      if (winner === f.away_id) penalties = [penalties[1], penalties[0]];
    }
    const snapshot = (t: TeamInput) => ({
      tactics: t.lineup.tactics,
      slots: Object.fromEntries(Object.entries(t.lineup.slots).map(([s, p]) => [s, { id: Number(p!.id), name: p!.name }])),
    });

    await db.tx(async (tx) => {
      await tx.query(
        `update fixtures set status = 'played', home_goals = $2, away_goals = $3, winner_id = $4 where id = $1 and status = 'scheduled'`,
        [f.id, hg, ag, winner],
      );
      await tx.query(
        `insert into match_results (fixture_id, result, lineups) values ($1, $2::text::jsonb, $3::text::jsonb) on conflict (fixture_id) do nothing`,
        [f.id, JSON.stringify({ ...result, penalties }), JSON.stringify({ home: snapshot(home), away: snapshot(away) })],
      );
      if (f.competition === 'cup' && winner !== null) {
        const loser = winner === f.home_id ? f.away_id : f.home_id;
        await tx.query(
          `update cup_entrants set out_round = $3 where world_id = $1 and club_id = $2 and season = (select season from worlds where id = $1)`,
          [worldId, loser, f.round],
        );
      }
    });
  }
  return fixtures.length;
}

export interface TableRow { club_id: number; series_id: number; points: number; gd: number; gf: number }

export function rankTable(rows: TableRow[]): TableRow[] {
  return [...rows].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.club_id - b.club_id);
}

/**
 * Promotion and relegation. Each series feeds from four series below it:
 * the two best of those four winners go up, and the bottom two come down into their places.
 */
export async function rollSeason(db: Db, worldId: number, now: Date): Promise<boolean> {
  const [w] = await db.query<{ season: number; season_start: string }>(`select season, season_start from worlds where id = $1`, [worldId]);
  if (!w) return false;
  const end = seasonEnd(new Date(w.season_start));
  if (now < end) return false;
  const [open] = await db.query<{ n: number }>(
    `select count(*)::int as n from fixtures where world_id = $1 and season = $2 and status <> 'played'`, [worldId, w.season],
  );
  if (open && open.n > 0) return false;
  const [cup] = await db.query<{ n: number }>(
    `select count(*)::int as n from cup_entrants where world_id = $1 and season = $2 and out_round is null`, [worldId, w.season],
  );
  if (cup && cup.n > 1) return false;

  const rows = await db.query<{ club_id: number; series_id: number; level: number; number: number; gf: number; ga: number; pts: number }>(
    `with r as (
       select home_id as club_id, home_goals as gf, away_goals as ga from fixtures where world_id = $1 and season = $2 and competition = 'league'
       union all
       select away_id, away_goals, home_goals from fixtures where world_id = $1 and season = $2 and competition = 'league')
     select c.id as club_id, c.series_id, s.level, s.number,
            coalesce(sum(r.gf), 0)::int as gf, coalesce(sum(r.ga), 0)::int as ga,
            coalesce(sum(case when r.gf > r.ga then 3 when r.gf = r.ga then 1 else 0 end), 0)::int as pts
     from clubs c join series s on s.id = c.series_id left join r on r.club_id = c.id
     where c.world_id = $1 group by c.id, c.series_id, s.level, s.number`,
    [worldId, w.season],
  );
  const series = await db.query<{ id: number; level: number; number: number }>(`select id, level, number from series where world_id = $1`, [worldId]);
  const seriesAt = new Map(series.map((s) => [`${s.level}.${s.number}`, s.id]));
  const tables = new Map<number, TableRow[]>();
  for (const r of rows) {
    const t: TableRow = { club_id: r.club_id, series_id: r.series_id, points: r.pts, gd: r.gf - r.ga, gf: r.gf };
    tables.set(r.series_id, [...(tables.get(r.series_id) ?? []), t]);
  }
  for (const [k, v] of tables) tables.set(k, rankTable(v));

  const moves: Array<[number, number]> = [];
  for (const s of series) {
    const children = [1, 2, 3, 4].map((i) => seriesAt.get(`${s.level + 1}.${(s.number - 1) * 4 + i}`)).filter((x): x is number => !!x);
    if (children.length === 0) continue;
    const winners = rankTable(children.map((c) => tables.get(c)![0]!)).slice(0, 2);
    const relegated = tables.get(s.id)!.slice(-2);
    winners.forEach((up, i) => {
      const down = relegated[i]!;
      moves.push([up.club_id, s.id], [down.club_id, up.series_id]);
    });
  }

  await db.tx(async (tx) => {
    for (const [club, to] of moves) await tx.query(`update clubs set series_id = $2 where id = $1`, [club, to]);
    await tx.query(`update players set age = age + 1 where world_id = $1`, [worldId]);
    await tx.query(`update worlds set season = season + 1, season_start = $2 where id = $1`, [worldId, end.toISOString()]);
    await createSeason(tx, worldId, w.season + 1, end, worldId);
  });
  return true;
}

/** One pass of the scheduler for one world. Safe to run as often as you like. */
export async function tick(db: Db, worldId: number): Promise<{ played: number; cupDrawn: boolean; rolled: boolean }> {
  const now = await worldNow(db, worldId);
  let played = 0;
  let cupDrawn = false;
  // Catch up fully: after a time-warp several cup rounds may need playing and drawing in turn.
  for (;;) {
    const n = await playDue(db, worldId, now);
    const drawn = await advanceCup(db, worldId, now);
    played += n;
    cupDrawn ||= drawn;
    if (n === 0 && !drawn) break;
  }
  const rolled = await rollSeason(db, worldId, now);
  return { played, cupDrawn, rolled };
}

export async function tickAll(db: Db) {
  const worlds = await db.query<{ id: number }>(`select id from worlds order by id`);
  const out: Record<number, Awaited<ReturnType<typeof tick>>> = {};
  for (const w of worlds) out[w.id] = await tick(db, w.id);
  return out;
}

/** Admin time-warp: jump a world's clock forward. */
export async function warp(db: Db, worldId: number, to: 'next-kickoff' | 'full-time' | 'next-week' | 'season-end'): Promise<Date> {
  const now = await worldNow(db, worldId);
  let target: Date;
  if (to === 'next-kickoff' || to === 'full-time') {
    const [f] = await db.query<{ kickoff: string }>(
      `select min(kickoff) as kickoff from fixtures where world_id = $1 and status = 'scheduled'`, [worldId],
    );
    if (!f?.kickoff) throw new Error('nothing scheduled');
    target = new Date(new Date(f.kickoff).getTime() + (to === 'full-time' ? 96 * 60_000 : 1000));
  } else if (to === 'next-week') {
    target = new Date(now.getTime() + 7 * 86_400_000);
  } else {
    const [w] = await db.query<{ season_start: string }>(`select season_start from worlds where id = $1`, [worldId]);
    target = new Date(seasonEnd(new Date(w!.season_start)).getTime() + 1000);
  }
  const shift = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000));
  await db.query(`update worlds set clock_offset_s = clock_offset_s + $2 where id = $1`, [worldId, shift]);
  return target;
}

export type { OrdersRow };
