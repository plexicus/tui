import pkg from '../../package.json' with { type: 'json' }

export const CLIENT_NAME = 'tui'
export const CLIENT_ID = 'plexicus-tui'
export const CLIENT_HEADER = 'X-Plexicus-Client'

// The platform accepts [A-Za-z0-9._/@+-]{1,64}; anything else is logged as "invalid".
export function clientHeaderValue(version: string = pkg.version): string {
  const safe = String(version).replace(/[^A-Za-z0-9._/@+-]/g, '').slice(0, 64 - CLIENT_NAME.length - 1)
  return `${CLIENT_NAME}/${safe || '0'}`
}

export function clientVersion(): string {
  return pkg.version
}
