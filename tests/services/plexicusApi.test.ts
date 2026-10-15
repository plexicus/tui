import { describe, it, expect, beforeAll } from 'bun:test'
import type { PlexicusApi as PlexicusApiType } from '../../src/services/plexicusApi.js'

// Set before dynamic import so the module-level MOCK_MODE flag is captured
process.env.MOCK_PLEXICUS = '1'

let api: PlexicusApiType

beforeAll(async () => {
  // Cache-busting query: other test files import this module with MOCK_MODE=false first.
  // @ts-expect-error — query string is a runtime-only cache-busting trick; tsc can't resolve it
  const { PlexicusApi } = await import('../../src/services/plexicusApi.js?mock-mode-test')
  api = new PlexicusApi({ baseUrl: 'https://api.app.plexicus.ai' })
})

describe('PlexicusApi (mock mode)', () => {
  it('getFindings returns array of findings', async () => {
    const { findings } = await api.getFindings()
    expect(Array.isArray(findings)).toBe(true)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0]).toHaveProperty('id')
    expect(findings[0]).toHaveProperty('severity')
    expect(findings[0]).toHaveProperty('title')
  })

  it('getFindings returns pagination metadata', async () => {
    const { total, pageCount } = await api.getFindings()
    expect(typeof total).toBe('number')
    expect(typeof pageCount).toBe('number')
    expect(total).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThan(0)
  })

  it('getFinding returns a single finding', async () => {
    const finding = await api.getFinding('f-001')
    expect(finding.id).toBeDefined()
    expect(finding.severity).toBeDefined()
    expect(finding.cve).toBeDefined()
  })

  it('getRepositories returns array of repos', async () => {
    const { repos } = await api.getRepositories()
    expect(Array.isArray(repos)).toBe(true)
    expect(repos.length).toBeGreaterThan(0)
    expect(repos[0]).toHaveProperty('id')
    expect(repos[0]).toHaveProperty('nickname')
    expect(repos[0]).toHaveProperty('finding_counts')
  })

  it('createRemediation fires and returns void', async () => {
    const result = await api.createRemediation('f-001')
    expect(result).toBeUndefined()
  })

  it('getApiTokens returns array', async () => {
    const tokens = await api.getApiTokens()
    expect(Array.isArray(tokens)).toBe(true)
  })

  it('finding has new JSON:API field names', async () => {
    const { findings } = await api.getFindings()
    const f = findings[0]!
    expect(f).toHaveProperty('title')
    expect(f).toHaveProperty('file_path')
    expect(f).toHaveProperty('cvssv3_score')
    expect(f).toHaveProperty('date')
    expect(f).toHaveProperty('is_false_positive')
    expect(f).toHaveProperty('repo_id')
  })

  it('repo has new JSON:API field names', async () => {
    const { repos } = await api.getRepositories()
    const r = repos[0]!
    expect(r).toHaveProperty('id')
    expect(r).toHaveProperty('nickname')
    expect(r).toHaveProperty('source_control')
    expect(r).toHaveProperty('finding_counts')
    expect(r.finding_counts).toHaveProperty('total')
  })
})
