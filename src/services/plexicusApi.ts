import type { Finding, Repository, Remediation, ApiToken, ApiTokenListItem, SessionUser, ScmRepo } from '../types.js'
import {
  FindingsResponseSchema, SingleFindingResponseSchema,
  RepositoriesResponseSchema,
  RemediationSchema, RemediationsCollectionSchema,
  ApiTokensListSchema, ApiTokenCreatedSchema,
  SessionUserSchema, LoginResponseUnion, LoginResponseFlatSchema,
  Verify2FAResponseSchema,
} from './apiSchemas.js'
import type { FindingsFilter } from '../state/actions.js'
import { PlexicusApiError, PlexicusAuthError } from '../utils/errors.js'

interface ApiConfig {
  baseUrl: string
  token?: string
}

export type LoginResult =
  | { kind: 'ok'; access_token: string; token_type: string }
  | { kind: '2fa'; secret: string }

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

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function buildFilterQuery(filter: FindingsFilter): URLSearchParams {
  const qs = new URLSearchParams()

  if (filter.severities?.length) {
    qs.set('filters[severity]', filter.severities.join(','))
  }
  if (filter.repository_ids?.length) {
    qs.set('filters[repository]', filter.repository_ids.join(','))
  }
  if (filter.statuses?.length) {
    qs.set('filters[status]', filter.statuses.join(','))
  }
  if (filter.types?.length) {
    qs.set('filters[type]', filter.types.join(','))
  }
  if (filter.cvss_gt !== undefined) {
    qs.set('filters[cvssv3_score_gt]', String(Math.floor(filter.cvss_gt)))
  }
  if (filter.cvss_lt !== undefined) {
    qs.set('filters[cvssv3_score_lt]', String(Math.floor(filter.cvss_lt)))
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
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

  async login(email: string, password: string): Promise<LoginResult> {
    if (MOCK_MODE) {
      const data = await loadFixture('login')
      const parsed = LoginResponseFlatSchema.parse(data)
      return { kind: 'ok', access_token: parsed.access_token, token_type: parsed.token_type }
    }
    const raw = await this.fetch<unknown>('POST', '/sessions', { email, password }, undefined, 'raw')
    const parsed = LoginResponseUnion.parse(raw)
    if ('requires_2fa' in parsed && parsed.requires_2fa) {
      return { kind: '2fa', secret: parsed.otp_data.secret }
    }
    const flat = parsed as { access_token: string; token_type: string }
    return { kind: 'ok', access_token: flat.access_token, token_type: flat.token_type }
  }

  async logout(): Promise<void> {
    if (MOCK_MODE) return
    await this.fetch<void>('DELETE', '/sessions/self')
  }

  async getSession(): Promise<SessionUser> {
    if (MOCK_MODE) {
      const data = await loadFixture('session')
      return SessionUserSchema.parse(data)
    }
    return this.fetch<SessionUser>('GET', '/sessions/self', undefined, SessionUserSchema, 'raw')
  }

  async verify2FA(email: string, otp_code: string): Promise<string> {
    if (MOCK_MODE) {
      const data = await loadFixture('login')
      const parsed = LoginResponseFlatSchema.parse(data)
      return parsed.access_token
    }
    // email identifies the user: at login-time 2FA there is no Bearer token yet
    const raw = await this.fetch<unknown>('POST', '/sessions/self/2fa-verifications', { otp_code, email }, undefined, 'raw')
    const parsed = Verify2FAResponseSchema.parse(raw)
    if (!parsed.verify_otp || !parsed.access_token) {
      throw new PlexicusAuthError()
    }
    return parsed.access_token!
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

  // FIXME-11: GitLab and Bitbucket OAuth endpoints don't exist in backend yet.
  // Only 'github' is valid until the backend exposes equivalent routes.
  async getOAuthUrl(provider: 'github'): Promise<string> {
    if (MOCK_MODE) return `https://github.com/login/oauth/authorize?mock=1`
    const data = await this.fetch<{ oauth_url: string }>('GET', '/oauth/github/authorization', undefined, undefined, 'raw')
    return data.oauth_url
  }

  async checkScmValidity(): Promise<Record<string, boolean>> {
    if (MOCK_MODE) return { github: false, gitlab: false, bitbucket: false, gitea: false }
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
      const repos: any[] = Array.isArray(envelope?.repositories)
        ? envelope.repositories
        : (Array.isArray(raw) ? raw : [])
      allRepos.push(...repos.map(r => ({
        id: String(r.uuid ?? r.id ?? ''),
        name: String(r.slug ?? r.name ?? ''),
        full_name: String(r.full_name ?? r.name_with_namespace ?? r.name ?? ''),
        html_url: r.html_url ?? r.web_url ?? r.links?.html?.href ?? undefined,
        clone_url: r.clone_url ?? r.http_url_to_repo ?? undefined,
        private: r.private ?? r.is_private ?? r.visibility === 'private',
      } as ScmRepo)))
      if (repos.length < PER_PAGE) break
      page++
    }
    return allRepos
  }

  async connectWithToken(provider: string, token: string, baseUrl?: string): Promise<void> {
    if (MOCK_MODE) return
    // Use PUT /client/plugin/{provider} — same path the web frontend uses
    if (provider === 'gitea') {
      const url = new URL(baseUrl ?? 'http://localhost:3000')
      const port = url.port || (url.protocol === 'https:' ? '443' : '80')
      await this.fetch<void>('PUT', '/client/plugin/gitea', {
        protocol: url.protocol.replace(':', ''),
        oauth_token: token,
        hosted_domain: url.hostname,
        port,
      }, undefined, 'raw')
      // save_token registers the encoded token in the auth system
      await this.fetch<void>('POST', '/scm-tokens', {
        token: `${url.protocol.replace(':', '')}:${token}:${url.hostname}:${port}`,
        source_control: 'gitea',
      }, undefined, 'raw')
    } else if (provider === 'gitlab') {
      await this.fetch<void>('PUT', '/client/plugin/gitlab', {
        oauth_token: token,
        hosted_url: baseUrl ?? 'https://gitlab.com',
      }, undefined, 'raw')
    } else if (provider === 'bitbucket') {
      await this.fetch<void>('PUT', '/client/plugin/bitbucket_cloud', {
        oauth_token: token,
      }, undefined, 'raw')
    } else {
      await this.fetch<void>('PUT', `/client/plugin/${provider}`, {
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
    // FIXME-16: body shape changed -- backend expects {data: [...], source_control}
    const data = repos.map(r => ({
      nickname: r.name,
      uri: r.html_url ?? r.clone_url ?? '',
      type: 'git_repository',
      source_control: sourceControl,
      data: {
        git_connection: {
          repo_branch: 'main',
          repo_id: r.id,
          repo_url: r.html_url ?? r.clone_url ?? '',
        },
      },
    }))
    await this.fetch<void>('POST', '/repositories/bulk', { data, source_control: sourceControl }, undefined, 'raw')
  }

  async requestScan(repositoryId: string, scanType: string = 'app'): Promise<void> {
    if (MOCK_MODE) return
    await this.fetch<void>('POST', '/repository-scans', { repository_id: repositoryId, scan_type: scanType }, undefined, 'raw')
  }
}
