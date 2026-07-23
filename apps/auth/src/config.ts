import { object, string, url, pipe, parse, minLength } from "valibot"

const ConfigSchema = object({
  issuer: pipe(string(), url()),
  dbPath: pipe(string(), minLength(1)),
  resendApiKey: pipe(string(), minLength(1)),
})

export type Config = ReturnType<typeof parseConfig>

/**
 * Read config from process.env. Prod: systemd's EnvironmentFile= populates
 * these before ExecStart=. Dev: source vps/auth/auth.dev.env, or run via
 * `bun --env-file=...`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parseConfig({
    issuer: env.ISSUER,
    dbPath: env.DB_PATH,
    resendApiKey: env.RESEND_API_KEY,
  })
}

function parseConfig(raw: unknown) {
  return parse(ConfigSchema, raw)
}
