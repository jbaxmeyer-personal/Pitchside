// Called by pg_cron every two minutes. Creates the first world if none exists, then plays due matches.
import { initWorld, tickAll } from '../_shared/game.js';
import { config, db, json } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const secret = await config('cron_secret');
  if (!secret || req.headers.get('x-pitchside-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const [w] = await db.query<{ n: number }>(`select count(*)::int as n from worlds`);
  if (!w || w.n === 0) {
    const id = await initWorld(db, { name: 'USA', seed: 2026, now: new Date(), live: true });
    return json({ created: id });
  }
  return json(await tickAll(db));
});
