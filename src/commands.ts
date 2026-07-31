import { memoize } from 'lodash-es'
import type { AppState } from './state/AppState.js'
import type { Action } from './state/actions.js'

interface CommandCtx {
  state: AppState
  dispatch: React.Dispatch<Action>
}

export interface LocalCommand {
  name: string
  description: string
  aliases?: string[]
  type: 'local'
  call: (args: string[], ctx: CommandCtx) => Promise<string | void>
}

// Memoized command registry — lazy loads modules
const loadCommands = memoize(async (): Promise<LocalCommand[]> => {
  const [configMod] = await Promise.all([
    import('./commands/config/index.js'),
  ])
  return [
    configMod.default,
  ]
})

export async function findCommand(name: string): Promise<LocalCommand | undefined> {
  const commands = await loadCommands()
  return commands.find(c => c.name === name || c.aliases?.includes(name))
}

export async function getAllCommands(): Promise<LocalCommand[]> {
  return loadCommands()
}
