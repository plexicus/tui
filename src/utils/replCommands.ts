export interface ReplCommand {
  name: string
  aliases?: string[]
  template: string
  description: string
}

// Contract-v1 views are offered only when the server answered for them (404/403 -> hidden).
const GATED_COMMANDS: Array<ReplCommand & { gate: 'pentests' | 'credits' }> = [
  { name: 'pentests', gate: 'pentests', template: 'pentests', description: 'AI pentests: status and severity counts (read-only)' },
  { name: 'credits', gate: 'credits', template: 'credits', description: 'Show remaining AI credits and Pentest Units' },
]

const REPL_COMMANDS: ReplCommand[] = [
  { name: 'filter', template: 'filter', description: 'Open filter modal' },
  { name: 'scan', template: 'scan', description: 'Request scan for selected repo' },
  { name: 'theme', template: 'theme <plexicus|dark|light>', description: 'Switch UI theme' },
  { name: 'config', template: 'config set <key> <value>', description: 'Set a config value' },
  { name: 'help', aliases: ['?'], template: 'help', description: 'Show keybindings help' },
]

export interface CommandGates {
  pentests?: boolean
  credits?: boolean
}

export function filterCommands(input: string, gates: CommandGates = {}): ReplCommand[] {
  const all: ReplCommand[] = [...REPL_COMMANDS, ...GATED_COMMANDS.filter(c => gates[c.gate])]
  const normalized = (input.startsWith('/') ? input.slice(1) : input).toLowerCase().trim()
  if (!normalized) return all
  return all.filter(c =>
    c.name.startsWith(normalized) ||
    c.aliases?.some(a => a.startsWith(normalized))
  )
}
