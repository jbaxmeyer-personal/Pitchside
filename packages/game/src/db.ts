/** The few database calls the game needs. Implemented by postgres.js in production and PGlite in tests. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

/** Bulk insert through jsonb_to_recordset, which works the same on every driver. */
export async function insertMany(
  db: Db,
  table: string,
  columns: Record<string, string>,
  rows: Array<Record<string, unknown>>,
  returning?: string,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const names = Object.keys(columns);
  const defs = names.map((n) => `${n} ${columns[n]}`).join(', ');
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000);
    const res = await db.query(
      `insert into ${table} (${names.join(', ')})
       select ${names.join(', ')} from jsonb_to_recordset($1::jsonb) as x(${defs})
       ${returning ? `returning ${returning}` : ''}`,
      [JSON.stringify(chunk)],
    );
    out.push(...res);
  }
  return out;
}
