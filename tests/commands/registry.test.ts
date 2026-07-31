import { describe, it, expect } from 'bun:test'
import { findCommand, getAllCommands } from '../../src/commands.js'

describe('command registry', () => {
  it('finds config command by name', async () => {
    const cmd = await findCommand('config')
    expect(cmd).toBeDefined()
    expect(cmd?.name).toBe('config')
  })

  it('returns undefined for unknown command', async () => {
    const cmd = await findCommand('nonexistent-cmd-xyz')
    expect(cmd).toBeUndefined()
  })

  it('getAllCommands returns all registered commands', async () => {
    const cmds = await getAllCommands()
    expect(Array.isArray(cmds)).toBe(true)
    const names = cmds.map(c => c.name)
    expect(names).toContain('config')
  })

  it('memoizes — returns same array on second call', async () => {
    const first = await getAllCommands()
    const second = await getAllCommands()
    expect(first).toBe(second) // same reference due to memoize
  })
})
