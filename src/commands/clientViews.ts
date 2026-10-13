import { PlexicusApi } from '../services/plexicusApi.js'
import {
  formatCreditsLine,
  formatPentestRow,
  isFeatureUnavailable,
  type PentestList,
} from '../services/contract.js'
import type { Config } from '../services/config.js'

export const PENTEST_STATUSES = ['draft', 'pending', 'running', 'completed', 'failed', 'cancelled'] as const

export async function creditsText(api: Pick<PlexicusApi, 'getCreditsSummary'>): Promise<string> {
  try {
    const line = formatCreditsLine(await api.getCreditsSummary())
    return line ?? 'Credits are not tracked for this account on this server.'
  } catch (err) {
    if (isFeatureUnavailable(err)) return 'This server does not expose a credits summary.'
    throw err
  }
}

export function pentestListText(list: PentestList): string[] {
  if (list.items.length === 0) return ['No pentests.']
  const lines = list.items.map(p => `${p.id}  ${formatPentestRow(p)}`)
  if (list.total > list.items.length) lines.push(`... ${list.total - list.items.length} more (use --page).`)
  return lines
}

export async function pentestsText(
  api: Pick<PlexicusApi, 'listPentests'>,
  opts: { status?: string; page?: number } = {},
): Promise<string[]> {
  try {
    return pentestListText(await api.listPentests({ status: opts.status, page: opts.page }))
  } catch (err) {
    if (isFeatureUnavailable(err)) return ['This server does not expose pentests to API tokens.']
    throw err
  }
}

export function apiFor(config: Pick<Config, 'serverUrl'>, token: string): PlexicusApi {
  return new PlexicusApi({ baseUrl: config.serverUrl, token })
}
