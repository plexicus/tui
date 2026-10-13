import { describe, it, expect } from 'bun:test'
import { isApiToken } from '../../src/utils/token.js'

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`

describe('isApiToken', () => {
  it('detects token_type=api', () => {
    expect(isApiToken(jwt({ sub: 'u', token_type: 'api' }))).toBe(true)
  })
  it('treats session tokens and junk as non-API', () => {
    expect(isApiToken(jwt({ sub: 'u' }))).toBe(false)
    expect(isApiToken('not-a-jwt')).toBe(false)
    expect(isApiToken('')).toBe(false)
  })
})
