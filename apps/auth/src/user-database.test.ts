import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { migrateDatabase, openDatabase, SqliteStorage } from "./sqlite-storage"
import { getOrCreateUser } from "./user-database"

function makeDatabase() {
  return openDatabase(":memory:")
}

async function legacyUserID(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email))
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `user_${hex.slice(0, 16)}`
}

describe("auth user database schema", () => {
  it("removes the legacy tenant owner column without losing relationships", () => {
    const db = new Database(":memory:")
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          personal_owner_user_id TEXT UNIQUE REFERENCES users(id),
          created_at INTEGER NOT NULL
        );
        CREATE TABLE memberships (
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (tenant_id, user_id)
        );
        INSERT INTO users VALUES ('user-1', 'person@example.com', 1);
        INSERT INTO tenants VALUES ('tenant-1', 'Personal', 'user-1', 2);
        INSERT INTO memberships VALUES ('tenant-1', 'user-1', 'owner', 3);
      `)

      migrateDatabase(db)

      const columns = db
        .query<{ name: string }, []>("PRAGMA table_info(tenants)")
        .all()
        .map(({ name }) => name)
      expect(columns).toEqual(["id", "name", "created_at"])
      expect(db.query("SELECT * FROM tenants").get()).toEqual({
        id: "tenant-1",
        name: "Personal",
        created_at: 2,
      })
      expect(db.query("SELECT * FROM memberships").get()).toEqual({
        tenant_id: "tenant-1",
        user_id: "user-1",
        role: "owner",
        created_at: 3,
      })
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([])
      expect(db.query<{ user_version: number }, []>("PRAGMA user_version").get()).toEqual({
        user_version: 1,
      })
    } finally {
      db.close()
    }
  })

  it("creates relational tables and keeps OpenAuth kv storage", async () => {
    const db = makeDatabase()
    try {
      const tables = db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map(({ name }) => name)
      expect(tables).toContain("kv")
      expect(tables).toContain("users")
      expect(tables).toContain("tenants")
      expect(tables).toContain("memberships")

      const storage = SqliteStorage(db)
      await storage.set(["test", "key"], { preserved: true })
      expect(await storage.get(["test", "key"])).toEqual({ preserved: true })
    } finally {
      db.close()
    }
  })

  it("creates a user, UUID personal tenant, and owner membership on first login", async () => {
    const db = makeDatabase()
    try {
      const email = "person@example.com"
      const userID = getOrCreateUser(db, email)
      expect(userID).toBe(await legacyUserID(email))

      const user = db.query("SELECT id, email FROM users").get() as { id: string; email: string }
      expect(user).toEqual({ id: userID, email })
      const tenant = db.query("SELECT id, name FROM tenants").get() as {
        id: string
        name: string
      }
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(tenant.id).toMatch(uuidPattern)
      expect(tenant.name).toBe("Personal")
      expect(db.query("SELECT user_id, role FROM memberships").get()).toEqual({
        user_id: userID,
        role: "owner",
      })
    } finally {
      db.close()
    }
  })
})

describe("auth user database provisioning", () => {
  it("does not duplicate the personal tenant or membership on repeat login", () => {
    const db = makeDatabase()
    try {
      const firstID = getOrCreateUser(db, "repeat@example.com")
      const secondID = getOrCreateUser(db, "repeat@example.com")
      expect(secondID).toBe(firstID)
      expect(db.query("SELECT COUNT(*) AS count FROM users").get()).toEqual({ count: 1 })
      expect(db.query("SELECT COUNT(*) AS count FROM tenants").get()).toEqual({ count: 1 })
      expect(db.query("SELECT COUNT(*) AS count FROM memberships").get()).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })

  it("allows a user to own multiple tenants", () => {
    const db = makeDatabase()
    try {
      const userID = getOrCreateUser(db, "owner@example.com")
      const secondTenantID = crypto.randomUUID()
      db.query("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run(
        secondTenantID,
        "Team",
        Date.now(),
      )
      db.query(
        `INSERT INTO memberships (tenant_id, user_id, role, created_at)
         VALUES (?, ?, 'owner', ?)`,
      ).run(secondTenantID, userID, Date.now())

      expect(db.query("SELECT COUNT(*) AS count FROM memberships WHERE role = 'owner'").get())
        .toEqual({ count: 2 })
    } finally {
      db.close()
    }
  })

  it("enforces unique email and membership/user/tenant constraints", () => {
    const db = makeDatabase()
    try {
      const userID = getOrCreateUser(db, "unique@example.com")
      expect(() => {
        db.query("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
          "another-user",
          "unique@example.com",
          Date.now(),
        )
      }).toThrow()
      expect(() => {
        db.query(
          "INSERT INTO memberships (tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
        ).run(
          "missing-tenant",
          userID,
          "owner",
          Date.now(),
        )
      }).toThrow()
    } finally {
      db.close()
    }
  })
})
