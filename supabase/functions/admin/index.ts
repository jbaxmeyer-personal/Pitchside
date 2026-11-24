// Admin actions from the web app: time-warp and run the scheduler now. Admins only.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { tick, warp } from '../_shared/game.js';
import { db, json } from '../_shared/db.ts';

const WARPS = ['next-kickoff', 'full-time', 'next-week', 'season-end'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({});
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return json({ error: 'sign in first' }, 401);
  const [p] = await db.query<{ is_admin: boolean }>(`select is_admin from profiles where user_id = $1`, [data.user.id]);
  if (!p?.is_admin) return json({ error: 'admins only' }, 403);

  const body = await req.json().catch(() => ({}));
  const worldId = Number(body.worldId ?? 1);
  if (body.action === 'tick') return json(await tick(db, worldId));
  if (WARPS.includes(body.action)) {
    const to = await warp(db, worldId, body.action);
    return json({ warpedTo: to, ...(await tick(db, worldId)) });
  }
  return json({ error: 'unknown action' }, 400);
});
