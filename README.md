# Pitchside (working title)

A browser football manager in the spirit of the classic slow-paced online managers: one league match a week, a
cup midweek, bot clubs that humans take over, and a match engine built on trade-offs instead of a midfield-only gate.

Plan and spec: https://claude.ai/artifact/W54v7Aq53J2vCaDxUbVZbS

## Layout

| Path | What |
| --- | --- |
| `packages/engine` | Pure, seeded TypeScript match engine. No I/O. |
| `packages/game` | Server-side game logic: world generator, season schedule, cup, promotion/relegation, time-warp, scheduler tick. Pure TS over a tiny `Db` interface. |
| `apps/web` | Vite + React app, deployed to GitHub Pages. Talks to Supabase directly. |
| `supabase/migrations` | Schema, row-level security, RPCs (`claim_club`, `save_orders`, `rename_club`), pg_cron schedule. |
| `supabase/functions` | `tick` (runs every 2 min from pg_cron; creates the USA world on first run) and `admin` (time-warps, for admins). They import a bundle of `packages/game` built by `npm run build:functions`. |
| `tools/harness` | Balance harness: plays every formation x tactic against every other at equal squad strength. |

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: tests, then migrations + functions to Supabase, then the web app to Pages.
Needs repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` and variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
The first account to take over a club becomes admin and gets the Admin page (time-warp).

## Commands

```
npm install
npm test            # engine + game tests (game tests run on PGlite)
npm run dev -w @pitchside/web   # needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run typecheck
N=40 npm run harness   # balance report (N matches per pairing)
npx tsx tools/harness/src/diag.ts   # chance breakdown for sample matchups
```

## How the engine works

1. Ratings come from the lineup: midfield, attack and defense per zone (left, center, right), transition,
   commitment, keeper, set pieces, aerial, build-up, long ball, press resistance, recovery pace, fitness.
2. A zone with no specialist defender is *exposed*: no center backs cuts central defense by 35%.
3. About 104 possessions per match. Midfield decides who has the ball (softened and clamped to 28-72%).
4. Each possession tries to reach the final third, by ground or long ball. Commitment, build-up, open space,
   the opponent's press and its block depth all move the odds.
5. Failing to progress can hand the opponent a press win or a counter. Counters are likelier and better against
   teams that commit numbers and play a high line.
6. Chances become shots with an xG from attack vs defense in that zone, the shooter and the keeper.

All tuning constants live in `TUNING` in `packages/engine/src/simulate.ts`.
