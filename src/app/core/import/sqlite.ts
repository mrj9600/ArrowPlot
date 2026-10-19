import type { Database, SqlJsStatic } from 'sql.js';

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Loads sql.js (and its wasm, served from assets/) on first use only. */
export function getSql(): Promise<SqlJsStatic> {
  sqlPromise ??= import('sql.js').then((m) => {
    const init = (m as unknown as { default: (cfg: object) => Promise<SqlJsStatic> }).default;
    return init({ locateFile: (f: string) => new URL(`assets/${f}`, document.baseURI).toString() });
  });
  return sqlPromise;
}

export type Row = Record<string, unknown>;

export function query(db: Database, sql: string): Row[] {
  const r = db.exec(sql)[0];
  if (!r) return [];
  return r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])));
}

export function tables(db: Database): Set<string> {
  return new Set(
    query(db, `select name from sqlite_master where type='table'`).map((r) => String(r['name'])),
  );
}

export function columns(db: Database, table: string): Set<string> {
  return new Set(query(db, `pragma table_info(\`${table}\`)`).map((r) => String(r['name'])));
}
