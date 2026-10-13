import { arch, platform } from 'node:os'
import { PlexicusApi } from '../services/plexicusApi.js'
import {
  SUPPORT_CATEGORIES,
  isFeatureUnavailable,
  looksLikeSecret,
  validateSupportTicket,
  type SupportCategory,
} from '../services/contract.js'
import { PlexicusApiError } from '../utils/errors.js'
import { clientVersion } from '../utils/clientInfo.js'
import { deriveWebUrl } from '../utils/url.js'
import type { Config } from '../services/config.js'

export interface SupportIO {
  /** Reads one answer; resolves null at end of input. */
  ask: (prompt: string) => Promise<string | null>
  print: (line: string) => void
}

export interface SupportOptions {
  category?: string
  subject?: string
  message?: string
  yes?: boolean
}

export interface SupportOutcome {
  sent: boolean
  ticketId?: string | null
  reason?: string
}

export function contextSuffix(): string {
  return `\n\n--\nSent from Plexicus TUI ${clientVersion()} (${platform()} ${arch()})`
}

function appUrl(config: Pick<Config, 'serverUrl' | 'webUrl'>): string {
  return deriveWebUrl(config) ?? 'the Plexicus web app'
}

/**
 * `plexicus support`: files an in-app support ticket (POST /support/tickets, source "tui").
 * The user always confirms before anything is sent; no repo, finding or token data is attached.
 */
export async function runSupport(
  config: Pick<Config, 'serverUrl' | 'webUrl'>,
  token: string,
  opts: SupportOptions,
  io: SupportIO,
  api: Pick<PlexicusApi, 'createSupportTicket'> = new PlexicusApi({ baseUrl: config.serverUrl, token }),
): Promise<SupportOutcome> {
  io.print('Plexicus support ticket. Do not paste passwords, tokens or customer data: the text goes to the support team.')

  let category = (opts.category ?? '').trim()
  if (!category) {
    const a = await io.ask(`Category [${SUPPORT_CATEGORIES.join('|')}] (question): `)
    category = (a ?? '').trim() || 'question'
  }
  let subject = opts.subject?.trim() ?? ''
  if (!subject) subject = ((await io.ask('Subject (max 200 chars): ')) ?? '').trim()
  let message = opts.message?.trim() ?? ''
  if (!message) {
    io.print('Message (max 5000 chars). Finish with a line containing only a dot (.):')
    const lines: string[] = []
    for (;;) {
      const line = await io.ask('')
      if (line === null || line.trim() === '.') break
      lines.push(line)
    }
    message = lines.join('\n').trim()
  }

  const suffix = contextSuffix()
  const ticket = { category: category as SupportCategory, subject, message }
  const problem = validateSupportTicket(ticket, suffix)
  if (problem) return { sent: false, reason: problem }
  if (looksLikeSecret(subject) || looksLikeSecret(message)) {
    return { sent: false, reason: 'The text looks like it contains a token or secret. Remove it and try again.' }
  }

  io.print('')
  io.print(`  Category: ${category}`)
  io.print(`  Subject:  ${subject}`)
  io.print(`  Message:  ${message.length} characters (+ one line with the TUI version and OS)`)
  if (!opts.yes) {
    const answer = ((await io.ask('Send this ticket to Plexicus support? [y/N] ')) ?? '').trim().toLowerCase()
    if (answer !== 'y' && answer !== 'yes') return { sent: false, reason: 'Cancelled, nothing was sent.' }
  }

  try {
    const id = await api.createSupportTicket({ ...ticket, message: message + suffix })
    return { sent: true, ticketId: id }
  } catch (err) {
    if (err instanceof PlexicusApiError) {
      if (err.statusCode === 403) {
        return { sent: false, reason: `Your role cannot file support tickets from here. Open Support in the web app: ${appUrl(config)}` }
      }
      if (err.statusCode === 429) {
        return { sent: false, reason: 'Too many support tickets from your account in a short time. Wait a while and try again.' }
      }
      if (isFeatureUnavailable(err)) {
        return { sent: false, reason: `This server has no in-app support tickets. Use the Support entry in the web app: ${appUrl(config)}` }
      }
    }
    throw err
  }
}
