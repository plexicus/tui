import { describe, it, expect } from 'bun:test'
import { challengeS256, generateState, generateVerifier, safeEqual } from '../../src/services/auth/pkce.js'

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B test vector', () => {
    expect(challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('builds the verifier from 32 random bytes (43 url-safe chars, no padding)', () => {
    const v = generateVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateVerifier()).not.toBe(v)
  })

  it('generates states inside the contract bounds (16-128 chars of [A-Za-z0-9_-])', () => {
    const s = generateState()
    expect(s).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
  })

  it('compares in constant time and rejects different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
