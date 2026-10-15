import type { Finding, Repository, Remediation, ApiToken, ApiTokenListItem, SessionUser, ScmRepo } from '../types.js'
import {
  FindingsResponseSchema, SingleFindingResponseSchema,
  RepositoriesResponseSchema,
  RemediationSchema, RemediationsCollectionSchema,
  ApiTokensListSchema, ApiTokenCreatedSchema,
  SessionUserSchema,
} from './apiSchemas.js'
import type { FindingsFilter } from '../state/actions.js'
import { PlexicusApiError, PlexicusAuthError } from '../utils/errors.js'
import { CLIENT_HEADER, clientHeaderValue } from '../utils/clientInfo.js'
import { upgradeRequired } from './auth/errors.js'
import {
  parseCreditsSummary, parsePentest, parsePentestList,
  type CreditsSummary, type PentestList, type PentestView, type SupportTicketInput,
} from './contract.js'

interface ApiConfig {
  baseUrl: string
  token?: string
}

interface FindingsResult {
  findings: Finding[]
  total: number
  pageCount: number
}

interface ReposResult {
  repos: Repository[]
  total: number
}

type EnvelopeMode = 'jsonapi' | 'wrapped' | 'raw' | 'auto'

function isWrapped(v: unknown): v is { success: boolean; data: unknown } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'success' in v &&
    'data' in v &&
    typeof (v as { success: unknown }).success === 'boolean'
  )
}

function unwrapEnvelope(json: unknown, mode: EnvelopeMode): unknown {
  if (mode === 'raw' || mode === 'jsonapi') return json
  if (mode === 'wrapped') {
    if (isWrapped(json)) return (json as { data: unknown }).data
    throw new PlexicusApiError('expected wrapped envelope', 0, '')
  }
  if (isWrapped(json)) return (json as { data: unknown }).data
  return json
}

const MOCK_MODE = process.env.MOCK_PLEXICUS === '1'

async function loadFixture(name: string): Promise<unknown> {
  const { default: data } = await import(`../../tests/fixtures/plexicus/${name}.json`, {
    with: { type: 'json' },
  })
  return data
}

// The backend decodes cursors with base64.urlsafe_b64decode, which REQUIRES the '=' padding
// (fastapi/config/pagination.py:decode_cursor). Stripping it made every page after the first
// answer 400 "Invalid `cursor` value" (offsets 25, 50, 75, ...).
export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset })).replace(/\+/g, '-').replace(/\//g, '_')
}

// The backend stores severity Title-Cased ("Critical", "High", ...) and matches
// filters[severity] case-sensitively, but the client's internal Finding.severity is
// lowercased for display — convert back before sending.
function toBackendSeverity(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}

// The client aggregates several raw backend statuses into user-facing categories
// (see STATUS_MAP in apiSchemas.ts); filters[status] matches raw values only, so
// expand each selected category back to the raw values that map to it.
const STATUS_FILTER_RAW_VALUES: Record<string, string[]> = {
  open: ['pending_input', 'failed'],
  enriched: ['enriched', 'issued'],
  ready: ['ready'],
  mitigated: ['completed', 'pr_submitted', 'solved'],
}

// FilterModal's sort options map to raw MongoDB field names on the Finding document
// (see FindingAttributesSchema in apiSchemas.ts); the backend's `sort` query param
// follows the Zalando R137 convention (+/- prefix, single field only — see
// fastapi/config/pagination.py:parse_sort_to_db in the platform repo).
const SORT_FIELD_MAP: Record<string, string> = {
  priority: 'prioritization_value',
  severity: 'severity_numerical',
  cvss: 'cvssv3_score',
  date: 'date',
  epss: 'estimated_epss',
}

function buildFilterQuery(filter: FindingsFilter): URLSearchParams {
  const qs = new URLSearchParams()

  if (filter.severities?.length) {
    qs.set('filters[severity]', filter.severities.map(toBackendSeverity).join(','))
  }
  if (filter.repository_ids?.length) {
    qs.set('filters[repository]', filter.repository_ids.join(','))
  }
  if (filter.statuses?.length) {
    const rawStatuses = filter.statuses.flatMap(s => STATUS_FILTER_RAW_VALUES[s] ?? [s])
    qs.set('filters[status]', rawStatuses.join(','))
  }
  if (filter.types?.length) {
    qs.set('filters[type]', filter.types.join(','))
  }
  if (filter.cvss_gt !== undefined) {
    qs.set('filters[cvssv3_score_gt]', String(filter.cvss_gt))
  }
  if (filter.cvss_lt !== undefined) {
    qs.set('filters[cvssv3_score_lt]', String(filter.cvss_lt))
  }
  if (filter.priority_gt !== undefined) {
    qs.set('filters[priority_gt]', String(filter.priority_gt))
  }
  if (filter.priority_lt !== undefined) {
    qs.set('filters[priority_lt]', String(filter.priority_lt))
  }
  if (filter.cwe_ids?.length) {
    qs.set('filters[cwe]', filter.cwe_ids.join(','))
  }
  if (filter.policy_names?.length) {
    qs.set('filters[policy_name]', filter.policy_names.join(','))
  }
  // filters[language]/[category] are case-sensitive exact matches server-side
  // (fastapi/utils/finding.py), and unlike severity there's no fixed casing convention —
  // stored values are whatever each scanner tool emits, so no client-side transform is safe here.
  if (filter.languages?.length) {
    qs.set('filters[language]', filter.languages.join(','))
  }
  if (filter.categories?.length) {
    qs.set('filters[category]', filter.categories.join(','))
  }
  if (filter.is_false_positive) {
    qs.set('filters[is_false_positive]', '1')
  }
  if (filter.finding_type) {
    qs.set('finding_type', filter.finding_type)
  }
  if (filter.sort_by) {
    const field = SORT_FIELD_MAP[filter.sort_by] ?? filter.sort_by
    qs.set('sort', `${filter.sort_dir === 'asc' ? '+' : '-'}${field}`)
  }

  return qs
}

function parseFindings(raw: unknown, repoMap?: Map<string, string>): FindingsResult {
  const parsed = FindingsResponseSchema.parse(raw)
  const findings: Finding[] = parsed.items.map(item => ({
    id: item.id,
    repo_nickname: repoMap?.get(item.attributes.repo_id) ?? null,
    ...item.attributes,
  }))
  const total = parsed.total ?? findings.length
  return {
    findings,
    total,
    pageCount: Math.ceil(total / 25) || 1,
  }
}

function parseRepos(raw: unknown): ReposResult {
  const parsed = RepositoriesResponseSchema.parse(raw)
  const repos: Repository[] = parsed.items.map(item => ({
    id: item.id,
    nickname: item.attributes.nickname,
    uri: item.attributes.uri,
    html_url: item.attributes.data?.url ?? null,
    active: item.attributes.active,
    repo_type: item.attributes.repo_type,
    status: item.attributes.status,
    source_control: item.attributes.data?.source_control ?? item.attributes.repo_type,
    repository_branch: item.attributes.data?.branch ?? 'main',
    finding_counts: item.attributes.findings ?? {
      total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0,
    },
  }))
  return {
    repos,
    total: parsed.total ?? repos.length,
  }
}

export class PlexicusApi {
  private baseUrl: string
  private token: string | undefined

  constructor({ baseUrl, token }: ApiConfig) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = token
  }

  setToken(token: string) {
    this.token = token
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [CLIENT_HEADER]: clientHeaderValue(),
    }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    return headers
  }

  private async fetch<T>(
    method: string,
    path: string,
    body?: unknown,
    schema?: { parse: (v: unknown) => T },
    envelope: EnvelopeMode = 'auto',
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new PlexicusApiError(`${msg} (${url})`, 0, path)
    }
    // 410 (legacy exchange off) and 426 mean this client version is no longer supported.
    if (res.status === 410 || res.status === 426) throw upgradeRequired()
    if (res.status === 401) {
      const detail = await res.text()
        .then(t => JSON.parse(t).detail as unknown)
        .catch(() => undefined)
      throw new PlexicusAuthError(typeof detail === 'string' ? detail : undefined)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new PlexicusApiError(`${method} ${path} failed: ${text}`, res.status, path)
    }
    const text = await res.text()
    if (!text) return undefined as T
    const json = JSON.parse(text)
    const unwrapped = unwrapEnvelope(json, envelope)
    return schema ? schema.parse(unwrapped) : (unwrapped as T)
  }

  /**
   * Logout: revokes the calling API token (204). A 401 means it is already invalid. Any other
   * failure is surfaced so the caller can tell the user to revoke it in Settings -> API tokens.
   */
  async logout(): Promise<void> {
    if (MOCK_MODE) return
    await this.fetch<void>('DELETE', '/users/me/api-tokens/self', undefined, undefined, 'raw')
  }

  async getSession(): Promise<SessionUser> {
    if (MOCK_MODE) {
      const data = await loadFixture('session')
      return SessionUserSchema.parse(data)
    }
    return this.fetch<SessionUser>('GET', '/sessions/self', undefined, SessionUserSchema, 'raw')
  }

  async getFindings(
    filter: FindingsFilter = {},
    page = 0,
    repoMap?: Map<string, string>,
  ): Promise<FindingsResult> {
    if (MOCK_MODE) {
      const data = await loadFixture('findings')
      return parseFindings(data, repoMap)
    }
    const qs = buildFilterQuery(filter)
    qs.set('cursor', encodeCursor(page * 25))
    qs.set('limit', '25')
    const query = qs.toString() ? `?${qs}` : ''
    const raw = await this.fetch<unknown>('GET', `/findings${query}`, undefined, undefined, 'jsonapi')
    return parseFindings(raw, repoMap)
  }

  async getFinding(id: string): Promise<Finding> {
    if (MOCK_MODE) {
      const data = await loadFixture('finding-detail')
      const result = parseFindings(data)
      const found = result.findings.find(f => f.id === id)
      if (!found) throw new Error(`Finding ${id} not found in fixture`)
      return found
    }
    const raw = await this.fetch<unknown>('GET', `/findings/${id}`, undefined, undefined, 'jsonapi')
    const parsed = SingleFindingResponseSchema.parse(raw)
    return {
      id: parsed.data.id,
      repo_nickname: null,
      ...parsed.data.attributes,
    }
  }

  async markMitigated(id: string): Promise<void> {
    if (MOCK_MODE) return
    await this.fetch<void>('POST', `/findings/${id}/mark-as-mitigated`, undefined, undefined, 'raw')
  }

  async toggleFalsePositive(id: string): Promise<void> {
    if (MOCK_MODE) return
    await this.fetch<void>('PUT', `/findings/${id}/false-positive`, undefined, undefined, 'raw')
  }

  async createRemediation(findingId: string): Promise<void> {
    if (MOCK_MODE) return
    // POST returns 202; poll getRemediations or wait for WS event for actual state
    await this.fetch<void>('POST', '/remediations', { finding_id: findingId, auto_create: false }, undefined, 'raw')
  }

  async getRemediations(findingId?: string): Promise<Remediation[]> {
    if (MOCK_MODE) {
      const data = await loadFixture('remediation')
      return RemediationsCollectionSchema.parse({ items: [data] }).items
    }
    const query = findingId ? `?finding_id=${findingId}` : ''
    let raw: unknown
    try {
      raw = await this.fetch<unknown>('GET', `/remediations${query}`, undefined, undefined, 'raw')
    } catch (err) {
      // 404 = no remediation exists yet — expected when finding has never been remediated
      if (err instanceof PlexicusApiError && err.statusCode === 404) return []
      throw err
    }
    // Normalise the many shapes the API can return
    let toparse: unknown = raw
    if (Array.isArray(raw)) {
      toparse = { items: raw }
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      if ('code' in obj && obj.result && typeof obj.result === 'object') {
        // { code: 200, result: {...} } — single remediation wrapped in code/result envelope
        toparse = { items: [obj.result] }
      } else if (!('items' in obj) && Array.isArray(obj.data)) {
        toparse = { items: obj.data }
      } else if ('_id' in obj || ('id' in obj && ('finding_id' in obj || 'finding_ids' in obj))) {
        toparse = { items: [raw] }
      }
    }
    const result = RemediationsCollectionSchema.safeParse(toparse)
    if (result.success) return result.data.items
    return []
  }

  async createPR(remediationId: string): Promise<void> {
    if (MOCK_MODE) return
    if (!remediationId) throw new Error('Cannot create PR: remediation ID is missing')
    await this.fetch<void>('POST', '/pull-requests', { remediation_id: remediationId }, undefined, 'raw')
  }

  async getRepositories(page = 0, sourceControl?: string): Promise<ReposResult> {
    if (MOCK_MODE) {
      const data = await loadFixture('repos')
      return parseRepos(data)
    }
    const qs = new URLSearchParams({
      cursor: encodeCursor(page * 25),
      limit: '25',
    })
    if (sourceControl) qs.set('filters[source_control]', sourceControl)
    const raw = await this.fetch<unknown>('GET', `/repositories?${qs}`, undefined, undefined, 'jsonapi')
    return parseRepos(raw)
  }

  async getApiTokens(): Promise<ApiTokenListItem[]> {
    if (MOCK_MODE) return []
    const raw = await this.fetch<unknown>('GET', '/users/me/api-tokens')
    return ApiTokensListSchema.parse(raw)
  }

  async generateApiToken(name: string): Promise<ApiToken> {
    if (MOCK_MODE) {
      return { id: 'mock-token-id', name, token: 'sk-mock-token', created_at: new Date().toISOString() }
    }
    return this.fetch<ApiToken>('POST', '/users/me/api-tokens', { name }, ApiTokenCreatedSchema)
  }

  async getOAuthUrl(provider: string): Promise<string> {
    if (MOCK_MODE) return `https://github.com/login/oauth/authorize?mock=1`
    const data = await this.fetch<{ authorization_url: string }>('GET', `/vulnerability-tool/auth/${provider}`, undefined, undefined, 'raw')
    return data.authorization_url
  }

  async checkScmValidity(): Promise<Record<string, boolean>> {
    if (MOCK_MODE) return { github: false, gitlab: false, bitbucket: false, gitea: false, forgejo: false, azure_devops: false }
    // Response shape: { status: bool, message: str, data: { github: bool, ... } }
    const raw = await this.fetch<unknown>('GET', '/integrations/scm/validity', undefined, undefined, 'raw')
    if (raw && typeof raw === 'object' && 'data' in raw && raw.data && typeof raw.data === 'object') {
      return raw.data as Record<string, boolean>
    }
    return (raw ?? {}) as Record<string, boolean>
  }

  async getScmRepos(provider: string, baseUrl?: string): Promise<ScmRepo[]> {
    if (MOCK_MODE) {
      return [
        { id: '1', name: 'api-service', full_name: 'org/api-service', html_url: 'https://github.com/org/api-service' },
        { id: '2', name: 'frontend-app', full_name: 'org/frontend-app', html_url: 'https://github.com/org/frontend-app' },
      ]
    }
    const PER_PAGE = 100
    const allRepos: ScmRepo[] = []
    let page = 1
    while (true) {
      const qs = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) })
      if (baseUrl) qs.set('custom_domain', baseUrl)
      // fetch() auto-unwraps { success, data: {...} } → raw IS { repositories: [...], total_count, ... }
      const raw = await this.fetch<unknown>('GET', `/vulnerability-tool/repositories/${provider}?${qs}`)
      const envelope = raw as Record<string, any>
      const rawRepos: any[] = Array.isArray(envelope?.repositories)
        ? envelope.repositories
        : (Array.isArray(raw) ? raw : [])
      // Third-party SCM responses aren't Zod-validated here (shape varies per provider) —
      // guard against null/non-object entries so one bad row doesn't crash the whole page.
      const repos = rawRepos.filter((r): r is Record<string, any> => r != null && typeof r === 'object')
      allRepos.push(...repos.map(r => ({
        id: String(r.uuid ?? r.id ?? ''),
        name: String(r.slug ?? r.name ?? ''),
        full_name: String(r.full_name ?? r.name_with_namespace ?? r.name ?? ''),
        html_url: r.html_url ?? r.web_url ?? r.links?.html?.href ?? undefined,
        clone_url: r.clone_url ?? r.http_url_to_repo ?? undefined,
        private: r.private ?? r.is_private ?? r.visibility === 'private',
        // GitHub/GitLab/Gitea: default_branch; Bitbucket: mainbranch.name
        default_branch: r.default_branch ?? r.mainbranch?.name ?? undefined,
      } as ScmRepo)))
      if (rawRepos.length < PER_PAGE) break
      page++
    }
    return allRepos
  }

  async connectWithToken(provider: string, token: string, baseUrl?: string): Promise<void> {
    if (MOCK_MODE) return
    // PUT /clients/self/plugins/{plugin_name} per the documented Platform API
    if (provider === 'gitea') {
      const url = new URL(baseUrl ?? 'http://localhost:3000')
      const port = url.port || (url.protocol === 'https:' ? '443' : '80')
      await this.fetch<void>('PUT', '/clients/self/plugins/gitea', {
        protocol: url.protocol.replace(':', ''),
        oauth_token: token,
        hosted_domain: url.hostname,
        port,
      }, undefined, 'raw')
    } else if (provider === 'gitlab') {
      await this.fetch<void>('PUT', '/clients/self/plugins/gitlab', {
        oauth_token: token,
        hosted_url: baseUrl ?? 'https://gitlab.com',
      }, undefined, 'raw')
    } else if (provider === 'bitbucket') {
      await this.fetch<void>('PUT', '/clients/self/plugins/bitbucket_cloud', {
        oauth_token: token,
      }, undefined, 'raw')
    } else {
      await this.fetch<void>('PUT', `/clients/self/plugins/${provider}`, {
        oauth_token: token,
      }, undefined, 'raw')
    }
  }

  async testScmConnection(provider: string): Promise<boolean> {
    if (MOCK_MODE) return true
    const data = await this.fetch<{ success: boolean }>('POST', `/integrations/scm/connections/${provider}/tests`, undefined, undefined, 'raw')
    return data.success
  }

  async importRepositories(repos: ScmRepo[], sourceControl: string): Promise<void> {
    if (MOCK_MODE) return
    const data = repos.map(r => ({
      nickname: r.name,
      uri: r.html_url ?? r.clone_url ?? '',
      type: 'git_repository',
      source_control: sourceControl,
      data: {
        git_connection: {
          repo_branch: r.default_branch || 'main',
          repo_id: r.id,
          repo_url: r.html_url ?? r.clone_url ?? '',
        },
      },
    }))
    await this.fetch<void>('POST', '/repositories/bulk', { data, source_control: sourceControl }, undefined, 'raw')
  }

  /** GET /credits/summary (client contract v1): counters only, never tokens/model/provider/cost. */
  async getCreditsSummary(): Promise<CreditsSummary> {
    if (MOCK_MODE) {
      return parseCreditsSummary({
        active: true, enforced: false, plan: 'scale', period: '2026-10', resets_at: '2026-11-01T00:00:00Z',
        credits: { used: 300, remaining: 25190, limit: 25500, unlimited: false },
        pentest_units: { used: 0, remaining: 4, limit: 4, unlimited: false },
      })
    }
    const raw = await this.fetch<unknown>('GET', '/credits/summary', undefined, undefined, 'raw')
    return parseCreditsSummary(raw)
  }

  /** GET /pentests (API-token allowlist). Read-only: there is no launch or cancel in the TUI. */
  async listPentests(opts: { page?: number; pageSize?: number; status?: string } = {}): Promise<PentestList> {
    if (MOCK_MODE) return parsePentestList({ items: [], total: 0, page: 1, page_size: 10 })
    const qs = new URLSearchParams({ page: String(opts.page ?? 1), page_size: String(opts.pageSize ?? 25) })
    if (opts.status) qs.set('status', opts.status)
    const raw = await this.fetch<unknown>('GET', `/pentests?${qs}`, undefined, undefined, 'raw')
    return parsePentestList(raw)
  }

  async getPentest(id: string): Promise<PentestView | null> {
    if (MOCK_MODE) return null
    const raw = await this.fetch<unknown>('GET', `/pentests/${encodeURIComponent(id)}`, undefined, undefined, 'raw')
    return parsePentest(raw)
  }

  /** POST /support/tickets (docs/SUPPORT-CHANNEL.md). Returns the ticket id. */
  async createSupportTicket(t: SupportTicketInput): Promise<string | null> {
    if (MOCK_MODE) return 'mock-ticket'
    const raw = await this.fetch<unknown>(
      'POST',
      '/support/tickets',
      { subject: t.subject.trim(), message: t.message.trim(), category: t.category, source: 'tui' },
      undefined,
      'raw',
    )
    const id = (raw as { data?: { id?: unknown } } | undefined)?.data?.id
    return typeof id === 'string' ? id : null
  }

  async requestScan(repositoryId: string, scanType: string = 'app'): Promise<void> {
    if (MOCK_MODE) return
    await this.fetch<void>('POST', '/repository-scans', { repository_id: repositoryId, scan_type: scanType }, undefined, 'raw')
  }
}
