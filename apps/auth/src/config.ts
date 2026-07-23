import { readFileSync } from "node:fs"
import { object, string, url, pipe, parse, minLength } from "valibot"

const ConfigSchema = object({
  issuer: pipe(string(), url()),
  dbPath: pipe(string(), minLength(1)),
  resendApiKey: pipe(string(), minLength(1)),
})

export type Config = ReturnType<typeof parseConfig>

export function loadConfig(path: string) {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch (err) {
    throw new Error(`failed to read/parse config at ${path}: ${(err as Error).message}`)
  }
  return parseConfig(raw)
}

function parseConfig(raw: unknown) {
  return parse(ConfigSchema, raw)
}
