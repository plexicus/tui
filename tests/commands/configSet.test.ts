import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

describe('ConfigSetCommand', () => {
  let tmpDir: string
  let origHome: string | undefined

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'plexicus-configset-'))
    origHome = process.env.HOME
    process.env.HOME = tmpDir
  })

  afterEach(async () => {
    process.env.HOME = origHome
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('writes theme and prints confirmation', async () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(' '))

    const { default: ConfigSetCommand } = await import('../../src/commands/configSet.js')
    await ConfigSetCommand('theme', 'dark')

    console.log = origLog
    expect(logs.some(l => l.includes('✓'))).toBe(true)
  })

  it('refuses to store a token in the config and never echoes it', async () => {
    const out: string[] = []
    const origErr = console.error
    const origLog = console.log
    const origExit = process.exit
    let exitCode: number | undefined
    console.error = (...args: unknown[]) => out.push(args.join(' '))
    console.log = (...args: unknown[]) => out.push(args.join(' '))
    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    try {
      const { default: ConfigSetCommand } = await import('../../src/commands/configSet.js')
      await ConfigSetCommand('token', 'sk-secret')
    } finally {
      console.error = origErr
      console.log = origLog
      process.exit = origExit
    }
    expect(exitCode).toBe(1)
    expect(out.join('\n')).toContain('plexicus login')
    expect(out.every(l => !l.includes('sk-secret'))).toBe(true)
  })

  it('persists value to config file', async () => {
    const { default: ConfigSetCommand } = await import('../../src/commands/configSet.js')
    await ConfigSetCommand('theme', 'light')

    const { loadConfig } = await import('../../src/services/config.js')
    const config = await loadConfig()
    expect(config.theme).toBe('light')
  })
})
