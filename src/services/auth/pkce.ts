import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// RFC 7636 section 4.1: 43-128 chars of [A-Za-z0-9._~-]. 32 random bytes in base64url = 43 chars.
export function generateVerifier(bytes: Buffer = randomBytes(32)): string {
  return bytes.toString('base64url')
}

// RFC 7636 section 4.2 (S256): BASE64URL(SHA256(ASCII(verifier))) without padding.
export function challengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

// AUTH-API-CONTRACT: state is 16-128 chars [A-Za-z0-9_-]; 24 random bytes = 32 chars.
export function generateState(bytes: Buffer = randomBytes(24)): string {
  return bytes.toString('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}
