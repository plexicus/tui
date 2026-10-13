import { z } from 'zod'
import { mkdir, readFile, writeFile, chmod } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { set } from 'lodash-es'
import { getConfigDir, getConfigPath } from '../utils/paths.js'
import { PlexicusConfigError } from '../utils/errors.js'

// Accepts a URL string or empty/null (converts falsy → undefined so Zod url() never sees "")
const optionalUrl = z.preprocess(
  v => (!v || typeof v !== 'string' ? undefined : v),
  z.string().url().optional(),
)

export const ConfigSchema = z.object({
  serverUrl: z.string().url().default('https://api.app.plexicus.ai'),
  webUrl: optionalUrl,
  wsUrl: z.string().optional(),
  theme: z.enum(['dark', 'light', 'plexicus']).default('plexicus'),
})

// Tokens are NOT part of the config: they live in the OS keychain (services/auth/credentials.ts).
// A `token` key in an old config.json is read once by readLegacyToken() for the migration and is
// never returned by loadConfig() nor written back by saveConfig().
export type Config = z.infer<typeof ConfigSchema>

export async function readLegacyToken(): Promise<string | null> {
  try {
    const json = JSON.parse(await readFile(getConfigPath(), 'utf-8')) as { token?: unknown }
    return typeof json.token === 'string' && json.token ? json.token : null
  } catch {
    return null
  }
}

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return ConfigSchema.parse({})
  }
  let json: unknown = {}
  try {
    const raw = await readFile(configPath, 'utf-8')
    json = JSON.parse(raw)
  } catch {
    return ConfigSchema.parse({})
  }
  const result = ConfigSchema.safeParse(json)
  if (result.success) return result.data
  // Validation failed for some fields — strip invalid optional URL fields and retry
  // so a bad webUrl doesn't wipe out serverUrl / token
  if (typeof json === 'object' && json !== null) {
    const safe = { ...(json as Record<string, unknown>) }
    if (!safe.webUrl) delete safe.webUrl
    const retry = ConfigSchema.safeParse(safe)
    if (retry.success) return retry.data
  }
  return ConfigSchema.parse({})
}

export async function saveConfig(config: Config): Promise<void> {
  const configDir = getConfigDir()
  const configPath = getConfigPath()
  const tmpPath = configPath + '.tmp'

  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await chmod(configDir, 0o700)
  await writeFile(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
  await Bun.file(tmpPath).text() // ensure write is flushed
  // atomic rename
  const { rename } = await import('fs/promises')
  await rename(tmpPath, configPath)
  await chmod(configPath, 0o600)
}

export async function setConfigValue(key: string, value: string): Promise<Config> {
  if (key === 'token' || key.startsWith('token.')) {
    throw new PlexicusConfigError('Tokens are not stored in the config. Run `plexicus login` (or set PLEXICUS_TOKEN for non-interactive use).')
  }
  // A legacy config.json token is moved to the keychain before the file is rewritten.
  const { migrateLegacyToken } = await import('./auth/credentials.js')
  await migrateLegacyToken()
  const current = await loadConfig()
  const updated = set({ ...current }, key, value)
  const validated = ConfigSchema.parse(updated)
  await saveConfig(validated)
  return validated
}
