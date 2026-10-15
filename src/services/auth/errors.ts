import { redactSecrets } from '../../utils/redact.js'

// Every message is display text; callers branch on `code` (contract rule 4).
export type LoginErrorCode =
  | 'access_denied'
  | 'expired_token'
  | 'invalid_grant'
  | 'upgrade_required'
  | 'timeout'
  | 'no_port'
  | 'state_mismatch'
  | 'rate_limited'
  | 'server_error'
  | 'client_error'
  | 'network'

export class LoginError extends Error {
  constructor(
    public readonly code: LoginErrorCode,
    message: string,
  ) {
    super(redactSecrets(message))
    this.name = 'LoginError'
  }
}

export const UPGRADE_MESSAGE =
  'This version of the Plexicus client is no longer supported. Upgrade the TUI and run `plexicus login` again.'

export function upgradeRequired(): LoginError {
  return new LoginError('upgrade_required', UPGRADE_MESSAGE)
}

// invalid_grant means the one-time code is burned: restart the whole login, never retry it.
export function invalidGrant(): LoginError {
  return new LoginError(
    'invalid_grant',
    'The login code is invalid, expired or already used. Start the login again with `plexicus login`.',
  )
}
