// CLI/API tokens minted by POST /auth/cli/exchange or /users/me/api-tokens carry
// token_type=api (fastapi/helper.py build_api_token); web/session tokens do not.
export function isApiToken(token: string): boolean {
  try {
    const part = token.split('.')[1]
    if (!part) return false
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return (JSON.parse(json) as { token_type?: unknown }).token_type === 'api'
  } catch {
    return false
  }
}
