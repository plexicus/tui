import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExecFn, ExecOptions, ExecResult } from '../../src/services/auth/keychain.js'

export interface RecordedCall {
  cmd: string
  args: string[]
  opts: ExecOptions
}

/** In-memory fake OS keychains driven through the same exec seam the real adapters use. */
export function fakeExec(behaviour: {
  /** commands that "do not exist" (code 127) */
  missing?: string[]
  /** make writes fail with this stderr */
  failWrites?: string
  store?: Map<string, string>
} = {}) {
  const calls: RecordedCall[] = []
  const store = behaviour.store ?? new Map<string, string>()
  const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' })
  const exec: ExecFn = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts })
    if (behaviour.missing?.includes(cmd)) return { code: 127, stdout: '', stderr: 'ENOENT' }
    if (cmd === 'security') {
      if (args[0] === '-h') return ok()
      if (args[0] === 'find-generic-password') {
        const v = store.get(args[args.indexOf('-a') + 1]!)
        return v ? ok(v + '\n') : { code: 44, stdout: '', stderr: 'not found' }
      }
      if (args[0] === 'delete-generic-password') {
        store.delete(args[args.indexOf('-a') + 1]!)
        return ok()
      }
      if (args[0] === '-i') {
        if (behaviour.failWrites) return { code: 1, stdout: '', stderr: behaviour.failWrites }
        const m = /-a "([^"]+)" -w "([^"]+)"/.exec(opts.input ?? '')
        if (m) store.set(m[1]!, m[2]!)
        return ok()
      }
    }
    if (cmd === 'secret-tool') {
      if (args[0] === '--help') return ok()
      const account = args[args.indexOf('account') + 1]!
      if (args[0] === 'lookup') {
        const v = store.get(account)
        return v ? ok(v) : { code: 1, stdout: '', stderr: '' }
      }
      if (args[0] === 'store') {
        if (behaviour.failWrites) return { code: 1, stdout: '', stderr: behaviour.failWrites }
        store.set(account, opts.input ?? '')
        return ok()
      }
      if (args[0] === 'clear') {
        store.delete(account)
        return ok()
      }
    }
    if (cmd === 'powershell.exe') {
      const script = args[args.length - 1]!
      if (script === 'exit 0') return ok()
      const account = opts.env?.PLEXICUS_KC_ACCOUNT ?? ''
      if (script.includes('.Add(')) {
        if (behaviour.failWrites) return { code: 1, stdout: '', stderr: behaviour.failWrites }
        store.set(account, opts.env?.PLEXICUS_KC_SECRET ?? '')
        return ok()
      }
      if (script.includes('RetrievePassword')) {
        const v = store.get(account)
        return v ? ok(v + '\r\n') : { code: 1, stdout: '', stderr: '' }
      }
      store.delete(account)
      return ok()
    }
    return { code: 127, stdout: '', stderr: 'unknown' }
  }
  return { exec, calls, store }
}

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'plexicus-auth-'))
  const prev = process.env.HOME
  process.env.HOME = dir
  try {
    return await fn(dir)
  } finally {
    if (prev === undefined) delete process.env.HOME
    else process.env.HOME = prev
    await rm(dir, { recursive: true, force: true })
  }
}

export const DUMMY_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.ZHVtbXktc2lnbmF0dXJl'
