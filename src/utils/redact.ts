// Defence in depth: tokens must never reach stdout, stderr, error messages or debug logs.
// Patterns cover JWTs (API/session tokens), Bearer headers, the platform's one-time artefacts
// (plxc_ authorization codes, plxd_ device codes) and key=value / JSON pairs of secret fields.
const SECRET_KEYS = 'access_token|refresh_token|id_token|token|code_verifier|code|device_code|user_code|password|api_key|secret'

const PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  [/\bplx[cd]_[A-Za-z0-9_-]+/g, '[redacted-code]'],
  [new RegExp(`("(?:${SECRET_KEYS})"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"[redacted]"'],
  [new RegExp(`(\\b(?:${SECRET_KEYS})=)[^&\\s"']+`, 'gi'), '$1[redacted]'],
]

export function redactSecrets(input: string): string {
  let out = input
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl)
  return out
}

export function debugLog(message: string): void {
  if (process.env.PLEXICUS_DEBUG === '1') {
    console.error(`[plexicus:debug] ${redactSecrets(message)}`)
  }
}
