import { describe, it, expect, spyOn } from 'bun:test'
import { debugLog, redactSecrets } from '../../src/utils/redact.js'
import { PlexicusApiError, friendlyError } from '../../src/utils/errors.js'
import { DUMMY_TOKEN } from './helpers.js'

describe('redaction', () => {
  it('removes JWTs, Bearer headers, one-time codes and secret fields', () => {
    const input = [
      `Authorization: Bearer ${DUMMY_TOKEN}`,
      `jwt ${DUMMY_TOKEN}`,
      'code plxc_AbCdEf123 device plxd_ZyXw987',
      '{"access_token":"abc.def.ghi","name":"ok"}',
      'GET /callback?code=plxc_zzz&state=keepme',
      'body code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&x=1',
    ].join('\n')
    const out = redactSecrets(input)
    for (const secret of [DUMMY_TOKEN, 'plxc_AbCdEf123', 'plxd_ZyXw987', 'abc.def.ghi', 'plxc_zzz', 'dBjftJeZ4CVP']) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain('"name":"ok"')
    expect(out).toContain('state=keepme')
  })

  it('is applied to API errors and friendlyError', () => {
    const e = new PlexicusApiError(`GET /x failed: Bearer ${DUMMY_TOKEN}`, 400, '/x')
    expect(e.message).not.toContain(DUMMY_TOKEN)
    expect(friendlyError(new Error(`oops ${DUMMY_TOKEN}`), 'fallback')).not.toContain(DUMMY_TOKEN)
  })

  it('debug logging is off by default and redacted when on', () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      delete process.env.PLEXICUS_DEBUG
      debugLog(`token ${DUMMY_TOKEN}`)
      expect(spy).not.toHaveBeenCalled()
      process.env.PLEXICUS_DEBUG = '1'
      debugLog(`token ${DUMMY_TOKEN}`)
      expect(JSON.stringify(spy.mock.calls)).not.toContain(DUMMY_TOKEN)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      delete process.env.PLEXICUS_DEBUG
      spy.mockRestore()
    }
  })
})
