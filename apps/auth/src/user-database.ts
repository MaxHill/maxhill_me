import type { Database } from "bun:sqlite"

/** Persist a user and ensure they have one personal tenant and owner membership. */
export function getOrCreateUser(db: Database, email: string): string {
  const userID = hashEmail(email)
  const now = Date.now()

  return db.transaction(() => {
    db.query(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING",
    ).run(
      userID,
      email,
      now,
    )

    const user = db
      .query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?")
      .get(email)
    if (!user) {
      throw new Error("Unable to create or retrieve user")
    }

    let tenant = db
      .query<{ id: string }, [string]>("SELECT id FROM tenants WHERE personal_owner_user_id = ?")
      .get(user.id)
    if (!tenant) {
      const tenantID = crypto.randomUUID()
      db.query(
        "INSERT INTO tenants (id, name, personal_owner_user_id, created_at) VALUES (?, ?, ?, ?)",
      ).run(tenantID, "Personal", user.id, now)
      tenant = { id: tenantID }
    }

    db.query(
      `INSERT INTO memberships (tenant_id, user_id, role, created_at)
       VALUES (?, ?, 'owner', ?)
       ON CONFLICT(tenant_id, user_id) DO NOTHING`,
    ).run(tenant.id, user.id, now)

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
