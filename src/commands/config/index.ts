import type { LocalCommand } from '../../commands.js'
import { setConfigValue } from '../../services/config.js'

const THEMES = new Set(['dark', 'light', 'plexicus'])

const configCommand: LocalCommand = {
  name: 'config',
  type: 'local',
  description: 'Manage configuration (:config set <key> <value>)',
  call: async (args, ctx) => {
    const [subcommand, key, ...valueParts] = args
    if (subcommand !== 'set' || !key || valueParts.length === 0) {
      return 'Usage: :config set <key> <value>'
    }
    const value = valueParts.join(' ')
    await setConfigValue(key, value)
    // Persisting the theme without also applying it live would leave the running
    // session showing the old theme until restart, looking like the command no-op'd.
    if (key === 'theme' && THEMES.has(value)) {
      ctx.dispatch({ type: 'ui/setTheme', payload: value as 'dark' | 'light' | 'plexicus' })
    }
    return `Config updated: ${key} = ${value}`
  },
}

export default configCommand
