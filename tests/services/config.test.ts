import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { ConfigSchema } from '../../src/services/config.js'

describe('ConfigSchema', () => {
  it('provides defaults', () => {
    const config = ConfigSchema.parse({})
    expect(config.serverUrl).toBe('https://api.app.plexicus.ai')
    expect(config.theme).toBe('plexicus')
  })

  it('accepts valid config', () => {
    const config = ConfigSchema.parse({
      serverUrl: 'https://custom.example.com',
      token: 'sk-test',
      theme: 'light',
    })
    expect(config.serverUrl).toBe('https://custom.example.com')
    expect(config.token).toBe('sk-test')
    expect(config.theme).toBe('light')
  })

  it('rejects invalid serverUrl', () => {
    expect(() => ConfigSchema.parse({ serverUrl: 'not-a-url' })).toThrow()
  })

  it('rejects invalid theme', () => {
    expect(() => ConfigSchema.parse({ theme: 'pink' })).toThrow()
  })
})

describe('setConfigValue', () => {
  let tmpDir: string
  let origHome: string | undefined

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'plexicus-test-'))
    origHome = process.env.HOME
    process.env.HOME = tmpDir
  })

  afterEach(async () => {
    process.env.HOME = origHome
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('sets serverUrl directly', async () => {
    const { setConfigValue } = await import('../../src/services/config.js')
    const result = await setConfigValue('serverUrl', 'https://self-hosted.example.com')
    expect(result.serverUrl).toBe('https://self-hosted.example.com')
  })

  it('rejects invalid theme via setConfigValue', async () => {
    const { setConfigValue } = await import('../../src/services/config.js')
    await expect(setConfigValue('theme', 'pink')).rejects.toThrow()
  })
})
