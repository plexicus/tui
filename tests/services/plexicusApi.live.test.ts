import { describe, it, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test'
import type { PlexicusApi as PlexicusApiType } from '../../src/services/plexicusApi.js'

// Ensure the module's MOCK_MODE constant (captured at import time) is false, so
// these tests exercise the real fetch()/buildFilterQuery()/getRemediations() code
// paths instead of the fixture short-circuits covered by plexicusApi.test.ts.
delete process.env.MOCK_PLEXICUS

let PlexicusApi: typeof PlexicusApiType
let PlexicusApiError: new (...args: any[]) => Error & { statusCode: number; endpoint: string }
let PlexicusAuthError: new (...args: any[]) => Error

beforeAll(async () => {
  // Cache-busting query string: plexicusApi.test.ts also imports this module (with
  // MOCK_PLEXICUS='1') in the same test run, and dynamic import() caches by resolved
  // specifier — without this we'd get that file's already-evaluated MOCK_MODE=true instance.
  // @ts-expect-error — query string is a runtime-only cache-busting trick; tsc can't resolve it
  ;({ PlexicusApi } = await import('../../src/services/plexicusApi.js?live-fetch-test'))
  ;({ PlexicusApiError, PlexicusAuthError } = await import('../../src/utils/errors.js'))
})

describe('PlexicusApi (live fetch path)', () => {
  let originalFetch: typeof fetch
  let calls: { url: string }[]
  let api: PlexicusApiType

  beforeEach(() => {
    originalFetch = globalThis.fetch
    calls = []
    api = new PlexicusApi({ baseUrl: 'https://api.example.com', token: 'tok' })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetchOnce(response: Response) {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      calls.push({ url: String(url) })
      return response
    }) as unknown as typeof fetch
  }

  describe('buildFilterQuery via getFindings', () => {
    it('title-cases severities to match the backend', async () => {
      mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
      await api.getFindings({ severities: ['critical', 'high'] })
      const url = new URL(calls[0]!.url)
      expect(url.searchParams.get('filters[severity]')).toBe('Critical,High')
    })

    it('expands aggregated statuses to raw backend values', async () => {
      mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
      await api.getFindings({ statuses: ['open', 'mitigated'] })
      const url = new URL(calls[0]!.url)
      expect(url.searchParams.get('filters[status]')).toBe('pending_input,completed,pr_submitted,solved')
    })

    it('preserves CVSS decimal precision instead of flooring', async () => {
      mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
      await api.getFindings({ cvss_gt: 7.5, cvss_lt: 9.2 })
      const url = new URL(calls[0]!.url)
      expect(url.searchParams.get('filters[cvssv3_score_gt]')).toBe('7.5')
      expect(url.searchParams.get('filters[cvssv3_score_lt]')).toBe('9.2')
    })

    it('maps sort_by to the backend field name with a direction prefix', async () => {
      mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
      await api.getFindings({ sort_by: 'cvss', sort_dir: 'asc' })
      const url = new URL(calls[0]!.url)
      expect(url.searchParams.get('sort')).toBe('+cvssv3_score')
    })

    it('defaults sort direction to descending', async () => {
      mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
      await api.getFindings({ sort_by: 'priority' })
      const url = new URL(calls[0]!.url)
      expect(url.searchParams.get('sort')).toBe('-prioritization_value')
    })

    it('omits the sort param entirely when no sort_by is given', async () => {
      mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
      await api.getFindings({})
      const url = new URL(calls[0]!.url)
      expect(url.searchParams.has('sort')).toBe(false)
    })
  })

  describe('fetch() error handling', () => {
    it('throws PlexicusAuthError on a 401 response', async () => {
      mockFetchOnce(new Response(JSON.stringify({ detail: 'Token expired' }), { status: 401 }))
      await expect(api.getFinding('f-1')).rejects.toBeInstanceOf(PlexicusAuthError)
    })

    it('throws PlexicusApiError with the status code on a non-ok response', async () => {
      mockFetchOnce(new Response('Internal error', { status: 500 }))
      await expect(api.getFinding('f-1')).rejects.toMatchObject({ statusCode: 500 })
    })

    it('wraps network-level fetch failures in PlexicusApiError', async () => {
      globalThis.fetch = mock(async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
      await expect(api.getFinding('f-1')).rejects.toBeInstanceOf(PlexicusApiError)
    })

    it('returns undefined for empty response bodies', async () => {
      mockFetchOnce(new Response('', { status: 204 }))
      const result = await api.markMitigated('f-1')
      expect(result).toBeUndefined()
    })
  })

  describe('getRemediations response-shape normalization', () => {
    it('returns [] on 404 (no remediation created yet)', async () => {
      mockFetchOnce(new Response('Not found', { status: 404 }))
      const result = await api.getRemediations('f-1')
      expect(result).toEqual([])
    })

    it('normalizes a bare array response', async () => {
      mockFetchOnce(new Response(JSON.stringify([{ _id: 'r1', finding_id: 'f-1', status: 'ready' }]), { status: 200 }))
      const result = await api.getRemediations('f-1')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('r1')
    })

    it('normalizes a {code, result} envelope', async () => {
      mockFetchOnce(new Response(JSON.stringify({ code: 200, result: { _id: 'r2', finding_id: 'f-1', status: 'pending' } }), { status: 200 }))
      const result = await api.getRemediations('f-1')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('r2')
    })

    it('normalizes a {data: [...]} envelope', async () => {
      mockFetchOnce(new Response(JSON.stringify({ data: [{ _id: 'r3', finding_id: 'f-1' }] }), { status: 200 }))
      const result = await api.getRemediations('f-1')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('r3')
    })

    it('normalizes a single object keyed by _id', async () => {
      mockFetchOnce(new Response(JSON.stringify({ _id: 'r4', finding_id: 'f-1', status: 'error' }), { status: 200 }))
      const result = await api.getRemediations('f-1')
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('r4')
    })

    it('returns [] when the response shape cannot be normalized', async () => {
      mockFetchOnce(new Response(JSON.stringify({ totally: 'unrecognized' }), { status: 200 }))
      const result = await api.getRemediations('f-1')
      expect(result).toEqual([])
    })
  })

  describe('login() / verify2FA() 2FA flow', () => {
    it('returns kind=ok for a flat access_token response', async () => {
      mockFetchOnce(new Response(JSON.stringify({ access_token: 'tok-1', token_type: 'Bearer' }), { status: 200 }))
      const result = await api.login('a@b.com', 'pw')
      expect(result).toEqual({ kind: 'ok', access_token: 'tok-1', token_type: 'Bearer' })
    })

    it('returns kind=2fa with the pending_token and never surfaces the OTP secret', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        requires_2fa: true,
        message: 'OTP required',
        otp_data: { secret: 'JBSWY3DPEHPK3PXP' },
        pending_token: 'pending.jwt.value',
      }), { status: 200 }))
      const result = await api.login('a@b.com', 'pw')
      expect(result).toEqual({ kind: '2fa', pendingToken: 'pending.jwt.value' })
    })

    it('accepts a 2FA challenge without otp_data (backend stopped returning the secret)', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        requires_2fa: true, message: 'OTP required', pending_token: 'p.t',
      }), { status: 200 }))
      const result = await api.login('a@b.com', 'pw')
      expect(result).toEqual({ kind: '2fa', pendingToken: 'p.t' })
    })

    it('verify2FA sends pending_token with the OTP code', async () => {
      let sent: Record<string, string> = {}
      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ verify_otp: true, access_token: 'tok-3' }), { status: 200 })
      }) as unknown as typeof fetch
      const token = await api.verify2FA('a@b.com', '123456', 'p.t')
      expect(token).toBe('tok-3')
      expect(sent).toEqual({ otp_code: '123456', email: 'a@b.com', pending_token: 'p.t' })
    })

    it('verify2FA returns the access token on success', async () => {
      mockFetchOnce(new Response(JSON.stringify({ verify_otp: true, access_token: 'tok-2' }), { status: 200 }))
      const token = await api.verify2FA('a@b.com', '123456')
      expect(token).toBe('tok-2')
    })

    it('verify2FA throws PlexicusAuthError when the OTP is rejected', async () => {
      mockFetchOnce(new Response(JSON.stringify({ verify_otp: false }), { status: 200 }))
      await expect(api.verify2FA('a@b.com', '000000')).rejects.toBeInstanceOf(PlexicusAuthError)
    })

    it('verify2FA throws PlexicusAuthError when verified but no token is returned', async () => {
      mockFetchOnce(new Response(JSON.stringify({ verify_otp: true }), { status: 200 }))
      await expect(api.verify2FA('a@b.com', '123456')).rejects.toBeInstanceOf(PlexicusAuthError)
    })
  })

  describe('cursor pagination', () => {
    // Python's base64.urlsafe_b64decode (the backend) rejects unpadded input, so every cursor
    // we send must keep its '=' padding; the offsets below all need padding.
    it('keeps base64 padding so the backend can decode pages after the first', async () => {
      for (const page of [1, 2, 3, 4]) {
        mockFetchOnce(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
        calls.length = 0
        await api.getFindings({}, page)
        const cursor = new URL(calls[0]!.url).searchParams.get('cursor')!
        expect(cursor.length % 4).toBe(0)
        const json = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))
        expect(JSON.parse(json)).toEqual({ offset: page * 25 })
      }
    })
  })

  describe('getScmRepos()', () => {
    it('maps a GitHub-shaped repo (id/full_name/html_url/clone_url/private)', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        repositories: [{ id: 42, full_name: 'org/repo', html_url: 'https://github.com/org/repo', clone_url: 'https://github.com/org/repo.git', private: true }],
      }), { status: 200 }))
      const repos = await api.getScmRepos('github')
      expect(repos).toEqual([{
        id: '42', name: '', full_name: 'org/repo',
        html_url: 'https://github.com/org/repo', clone_url: 'https://github.com/org/repo.git', private: true,
      }])
    })

    it('maps a GitLab-shaped repo (web_url/http_url_to_repo/name_with_namespace/is_private)', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        repositories: [{ id: 7, name: 'repo', name_with_namespace: 'group/repo', web_url: 'https://gitlab.com/group/repo', http_url_to_repo: 'https://gitlab.com/group/repo.git', is_private: true }],
      }), { status: 200 }))
      const repos = await api.getScmRepos('gitlab')
      expect(repos).toEqual([{
        id: '7', name: 'repo', full_name: 'group/repo',
        html_url: 'https://gitlab.com/group/repo', clone_url: 'https://gitlab.com/group/repo.git', private: true,
      }])
    })

    it('filters out null/non-object entries without crashing', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        repositories: [null, { id: 1, name: 'ok-repo' }, undefined],
      }), { status: 200 }))
      const repos = await api.getScmRepos('gitea')
      expect(repos).toHaveLength(1)
      expect(repos[0]!.name).toBe('ok-repo')
    })

    it('paginates using the raw page size, not the null-filtered count', async () => {
      let requestCount = 0
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        requestCount++
        const page = new URL(String(url)).searchParams.get('page')
        if (page === '1') {
          // 100 raw items (including a null), matching PER_PAGE — must trigger page 2
          const items = Array.from({ length: 99 }, (_, i) => ({ id: i, name: `repo-${i}` }))
          return new Response(JSON.stringify({ repositories: [null, ...items] }), { status: 200 })
        }
        return new Response(JSON.stringify({ repositories: [{ id: 100, name: 'repo-100' }] }), { status: 200 })
      }) as unknown as typeof fetch

      const repos = await api.getScmRepos('github')
      expect(requestCount).toBe(2)
      expect(repos).toHaveLength(100)
      expect(repos.at(-1)!.name).toBe('repo-100')
    })
  })

  describe('schema-fallback defaults for null/missing fields', () => {
    it('getRepositories falls back nickname/uri/active/repo_type/status when null', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        items: [{ id: 'r1', attributes: { nickname: null, uri: null, active: null, repo_type: null, status: null } }],
        total: 1,
      }), { status: 200 }))
      const { repos } = await api.getRepositories()
      expect(repos[0]).toMatchObject({
        id: 'r1', nickname: 'unknown-repo', uri: '', active: true, repo_type: 'github', status: 'active',
      })
    })

    it('getFindings falls back title/date/repo_id when null', async () => {
      mockFetchOnce(new Response(JSON.stringify({
        items: [{ id: 'f1', attributes: {
          title: null, severity: 'high', status: 'open', repo_id: null, date: null,
        } }],
        total: 1,
      }), { status: 200 }))
      const { findings } = await api.getFindings()
      expect(findings[0]).toMatchObject({ id: 'f1', title: 'Untitled finding', date: '', repo_id: '' })
    })
  })
})
