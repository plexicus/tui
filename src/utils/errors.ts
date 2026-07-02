export class PlexicusApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message)
    this.name = 'PlexicusApiError'
  }
}

export class PlexicusAuthError extends Error {
  constructor(message = 'Not authenticated') {
    super(message)
    this.name = 'PlexicusAuthError'
  }
}

export class PlexicusConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlexicusConfigError'
  }
}

export function friendlyError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  // If the message looks like a JSON array/object (Zod errors, API error arrays) replace with fallback
  const trimmed = msg.trim()
  if (trimmed.startsWith('[') || (trimmed.startsWith('{') && trimmed.includes('"code"'))) {
    return fallback
  }
  return msg || fallback
}
