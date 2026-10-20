import type { Database } from "bun:sqlite"

/** Persist a user and provision a personal tenant when the user is first created. */
export function getOrCreateUser(db: Database, email: string): string {
  const userID = hashEmail(email)
  const now = Date.now()

  return db.transaction(() => {
    const createdUser = db
      .query<{ id: string }, [string, string, number]>(
        `INSERT INTO users (id, email, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(email) DO NOTHING
         RETURNING id`,
      )
      .get(userID, email, now)

    if (createdUser) {
      const tenantID = crypto.randomUUID()
      db.query("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run(
        tenantID,
        "Personal",
        now,
      )
      db.query(
        `INSERT INTO memberships (tenant_id, user_id, role, created_at)
         VALUES (?, ?, 'owner', ?)`,
      ).run(tenantID, createdUser.id, now)
      return createdUser.id
    }

    const user = db
      .query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?")
      .get(email)
    if (!user) {
      throw new Error("Unable to create or retrieve user")
    }
    return user.id
  })()
}

/** Keep the existing token subject ID format until the planned UUID migration. */
function hashEmail(email: string): string {
  const data = new TextEncoder().encode(email)
  // Retain the same SHA-256 derivation used before persistence.
  const digest = new Bun.CryptoHasher("sha256").update(data).digest("hex")
  return `user_${digest.slice(0, 16)}`
}
