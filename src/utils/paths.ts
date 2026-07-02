import { homedir } from 'os'
import { join } from 'path'

export function getConfigDir(): string {
  // process.env.HOME first: Bun's homedir() ignores the HOME override tests rely on
  return join(process.env.HOME ?? homedir(), '.config', 'plexicus')
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}
