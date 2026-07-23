import { issuer } from "@openauthjs/openauth"
import { PasswordProvider } from "@openauthjs/openauth/provider/password"
import { PasswordUI } from "@openauthjs/openauth/ui/password"
import type { Database } from "bun:sqlite"
import { subjects } from "./subjects"
import { loadConfig, type Config } from "./config"
import { openDatabase, SqliteStorage, sweepExpired } from "./sqlite-storage"

const PORT = 8081
const EMAIL_FROM = "auth@maxhill.me"

async function sendVerificationEmail(config: Config, email: string, code: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: email,
      subject: "Your maxhill.me verification code",
      text: `Your verification code is: ${code}\n\nIt expires shortly. If you did not request this, ignore this email.`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`resend send failed (${res.status}): ${body}`)
  }
}

async function getOrCreateUser(email: string): Promise<string> {
  // Placeholder: deterministic hash-based user ID. Replace with a real user
  // service lookup once one exists. Kept intentionally stable across restarts
  // so dev sessions survive DB wipes.
  const data = new TextEncoder().encode(email)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `user_${hex.slice(0, 16)}`
}

function buildIssuer(config: Config, db: Database) {
  return issuer({
    subjects,
    storage: SqliteStorage(db),
    providers: {
      password: PasswordProvider(
        PasswordUI({
          sendCode: async (email, code) => {
            await sendVerificationEmail(config, email, code)
          },
        }),
      ),
    },
    success: async (ctx, value) => {
      if (value.provider === "password") {
        const userID = await getOrCreateUser(value.email)
        return ctx.subject("user", { userID })
      }
      throw new Error("Invalid provider")
    },
  })
}

function usage(): never {
  console.error("usage: auth-exe <run|sweep> <config-path>")
  process.exit(2)
}

async function main() {
  const [subcommand, configPath] = process.argv.slice(2)
  if (!subcommand || !configPath) usage()

  const config = loadConfig(configPath)
  const db = openDatabase(config.dbPath)

  if (subcommand === "sweep") {
    const n = sweepExpired(db)
    console.log(`swept ${n} expired row(s)`)
    db.close()
    return
  }

  if (subcommand !== "run") usage()

  const app = buildIssuer(config, db)
  const server = Bun.serve({ port: PORT, fetch: app.fetch })
  console.log(`auth listening on http://localhost:${server.port} (issuer=${config.issuer})`)

  const shutdown = (signal: string) => {
    console.log(`received ${signal}, shutting down`)
    server.stop()
    db.close()
    process.exit(0)
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
