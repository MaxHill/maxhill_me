import { Database } from "bun:sqlite"
import { joinKey, splitKey, type StorageAdapter } from "@openauthjs/openauth/storage/storage"

/**
 * SQLite-backed StorageAdapter for OpenAuth.
 *
 * Schema: one `kv` table keyed by the 0x1F-joined key (matching MemoryStorage),
 * with an optional `expiry` in unix milliseconds. `get` and `scan` filter
 * expired rows lazily; the `sweep` subcommand does the actual DELETE.
 */
export function openDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL,
      expiry INTEGER
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS kv_expiry ON kv(expiry) WHERE expiry IS NOT NULL`)
  return db
}

export function SqliteStorage(db: Database): StorageAdapter {
  const getStmt = db.query<{ value: string; expiry: number | null }, [string]>(
    "SELECT value, expiry FROM kv WHERE key = ?",
  )
  const upsertStmt = db.query<never, [string, string, number | null]>(
    `INSERT INTO kv (key, value, expiry) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, expiry = excluded.expiry`,
  )
  const removeStmt = db.query<never, [string]>("DELETE FROM kv WHERE key = ?")
  const removeExpiredOne = db.query<never, [string]>("DELETE FROM kv WHERE key = ?")
  const scanStmt = db.query<
    { key: string; value: string; expiry: number | null },
    [string, string]
  >("SELECT key, value, expiry FROM kv WHERE key >= ? AND key < ? ORDER BY key")

  return {
    async get(key: string[]) {
      const k = joinKey(key)
      const row = getStmt.get(k)
      if (!row) return undefined
      if (row.expiry !== null && Date.now() >= row.expiry) {
        removeExpiredOne.run(k)
        return undefined
      }
      return JSON.parse(row.value)
    },

    async set(key: string[], value: unknown, expiry?: Date) {
      upsertStmt.run(joinKey(key), JSON.stringify(value), expiry ? expiry.getTime() : null)
    },

    async remove(key: string[]) {
      removeStmt.run(joinKey(key))
    },

    async *scan(prefix: string[]) {
      const start = joinKey(prefix)
      const end = prefixUpperBound(start)
      const now = Date.now()
      for (const row of scanStmt.iterate(start, end)) {
        if (row.expiry !== null && now >= row.expiry) continue
        yield [splitKey(row.key), JSON.parse(row.value)] as [string[], unknown]
      }
    },
  }
}

/** Sweep expired rows. Returns rows deleted. */
export function sweepExpired(db: Database): number {
  const result = db.query("DELETE FROM kv WHERE expiry IS NOT NULL AND expiry <= ?").run(Date.now())
  return Number(result.changes)
}

/**
 * Smallest string strictly greater than every string with `prefix` as prefix,
 * so that `key >= prefix AND key < upper` matches exactly the prefix range.
 * Increments the last byte; if the prefix is empty or ends at 0xFFFF, falls
 * back to appending a high sentinel.
 */
function prefixUpperBound(prefix: string): string {
  if (prefix.length === 0) return "\uFFFF"
  const last = prefix.charCodeAt(prefix.length - 1)
  if (last === 0xffff) return prefix + "\uFFFF"
  return prefix.slice(0, -1) + String.fromCharCode(last + 1)
}
