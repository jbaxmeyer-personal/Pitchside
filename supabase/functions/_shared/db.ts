// Database adapter for Edge Functions, using the project's direct database connection.
import postgres from 'npm:postgres@3.4.5';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 });

// Arrays go over the wire as Postgres array literals, e.g. $1::int[].
const prep = (params: unknown[] = []) =>
  params.map((p) => (Array.isArray(p) ? `{${p.join(',')}}` : p)) as never[];

function wrap(q: typeof sql): Db {
  return {
    query: async (text, params) => (await q.unsafe(text, prep(params))) as never,
    tx: (fn) => sql.begin((t) => fn(wrap(t as unknown as typeof sql))) as never,
  };
}

export const db = wrap(sql);

export async function config(key: string): Promise<string | undefined> {
  const [row] = await db.query<{ value: string }>(`select value from app_config where key = $1`, [key]);
  return row?.value;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    },
  });
