import { createClient } from "@openauthjs/openauth/client";
import type { Database } from "bun:sqlite";
import { Config } from "./config";
import { subjects } from "./subjects";

/** Persist a user and provision a personal tenant when the user is first created. */
export function getOrCreateUser(db: Database, email: string): string {
  const userID = hashEmail(email);
  const now = Date.now();

  return db.transaction(() => {
    const createdUser = db
      .query<{ id: string }, [string, string, number]>(
        `INSERT INTO users (id, email, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(email) DO NOTHING
         RETURNING id`,
      )
      .get(userID, email, now);

    if (createdUser) {
      const tenantID = crypto.randomUUID();
      db.query("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run(
        tenantID,
        "Personal",
        now,
      );
      db.query(
        `INSERT INTO memberships (tenant_id, user_id, role, created_at)
         VALUES (?, ?, 'owner', ?)`,
      ).run(tenantID, createdUser.id, now);
      return createdUser.id;
    }

    const user = db
      .query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (!user) {
      throw new Error("Unable to create or retrieve user");
    }
    return user.id;
  })();
}

export const routes = (db: Database, config: Config) => {
  // Create once, not on every request.
  const auth = createClient({
    clientID: "auth",
    issuer: config.issuer,
  });

  return {
    "/me/roles": {
      GET: async (request: Bun.BunRequest<"/me/roles">) => {
        const token = request.headers
          .get("authorization")
          ?.match(/^Bearer\s+(\S+)$/i)?.[1];

        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const verified = await auth.verify(subjects, token);
        if (verified.err) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userID = verified.subject.properties.userID;
        const roles = db
          .query<{ id: string; role: string }, [string]>(`
            SELECT tenants.id as tenant_id, tenants.name, memberships.role
            FROM users 
            JOIN memberships on memberships.user_id = users.id
            JOIN tenants on tenants.id = memberships.tenant_id
            WHERE users.id = ?`)
          .all(userID);

        return Response.json(roles, { status: 200 });
      },
    },
  };
};

/** Keep the existing token subject ID format until the planned UUID migration. */
function hashEmail(email: string): string {
  const data = new TextEncoder().encode(email);
  // Retain the same SHA-256 derivation used before persistence.
  const digest = new Bun.CryptoHasher("sha256").update(data).digest("hex");
  return `user_${digest.slice(0, 16)}`;
}
