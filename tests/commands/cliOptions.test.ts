import { describe, it, expect } from 'bun:test'

const MAIN = new URL('../../src/main.tsx', import.meta.url).pathname

async function run(args: string[]) {
  const p = Bun.spawn(['bun', 'run', MAIN, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: '/nonexistent-plexicus-home', PLEXICUS_TOKEN: '' },
  })
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  await p.exited
  return { out, err, code: p.exitCode }
}

describe('CLI surface: no keys or passwords on the command line', () => {
  it('root command registers neither --token nor --headless', async () => {
    const { out } = await run(['--help'])
    expect(out).not.toContain('--token')
    expect(out).not.toContain('--headless')
    expect(out).toContain('login')
  })

  it('login registers --device only', async () => {
    const { out } = await run(['login', '--help'])
    expect(out).toContain('--device')
    expect(out).not.toContain('--token')
    expect(out).not.toContain('--headless')
  })

  it('rejects --token as an unknown option on both commands', async () => {
    for (const args of [['--token', 'abc'], ['login', '--token', 'abc'], ['login', '--headless']]) {
      const { err, code } = await run(args)
      expect(code).not.toBe(0)
      expect(err).toContain('unknown option')
    }
  })
})
