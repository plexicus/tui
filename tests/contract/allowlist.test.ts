import { describe, it, expect } from 'bun:test'
import {
  formatCreditsLine, formatPentestRow, formatSeverityCounts, parseCreditsSummary, parsePentestList, stripUserinfo,
} from '../../src/services/contract.js'
import { creditsFixture, FORBIDDEN_KEYS, LEAK_MARKERS, pentestsFixture } from './fixtures.js'

function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach(x => allKeys(x, out))
  else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      out.push(k)
      allKeys(val, out)
    }
  }
  return out
}

describe('credits rendering allowlist', () => {
  const summary = parseCreditsSummary(creditsFixture)
  const line = formatCreditsLine(summary)!

  it('renders remaining / limit and the reset date, flagged as pilot when not enforced', () => {
    expect(line).toBe('25,190 / 25,500 AI credits · 4 / 4 Pentest Units · resets 2026-11-01 (pilot: not enforced yet)')
  })

  it('keeps only used/remaining/limit/unlimited: no token, model, provider or cost key survives', () => {
    const keys = allKeys(summary)
    for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k)
    expect(keys.some(k => /token|model|provider|cost|usd|llm|prompt/i.test(k))).toBe(false)
    const dump = JSON.stringify(summary) + line
    for (const m of LEAK_MARKERS) expect(dump).not.toContain(m)
  })

  it('shows "unlimited" for unlimited counters and hides an inactive engine', () => {
    const unlimited = parseCreditsSummary({ active: true, enforced: true, credits: { used: 5, remaining: null, limit: null, unlimited: true } })
    expect(formatCreditsLine(unlimited)).toBe('unlimited AI credits')
    expect(formatCreditsLine(parseCreditsSummary({ ...creditsFixture, active: false }))).toBeNull()
    expect(formatCreditsLine(null)).toBeNull()
  })

  it('survives garbage without throwing', () => {
    expect(formatCreditsLine(parseCreditsSummary('nope'))).toBeNull()
    expect(formatCreditsLine(parseCreditsSummary({ active: true, credits: { remaining: 'x' } }))).toBeNull()
  })
})

describe('pentests rendering allowlist', () => {
  const list = parsePentestList(pentestsFixture)

  it('keeps the contract fields only and drops rows without an id', () => {
    expect(list.items.map(i => i.id)).toEqual(['3f0c2a9e-0000-4000-8000-000000000001', 'p2'])
    expect(Object.keys(list.items[0]!).sort()).toEqual([
      'completed_at', 'created_at', 'findings_total', 'id', 'name', 'report_available',
      'scan_mode', 'severity_counts', 'started_at', 'status', 'target',
    ])
  })

  it('never carries engine, pod, storage, workflow, log, model, provider, cost or credential data', () => {
    const keys = allKeys(list)
    for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k)
    const rendered = list.items.map(formatPentestRow).join('\n') + JSON.stringify(list)
    for (const m of LEAK_MARKERS) expect(rendered).not.toContain(m)
  })

  it('strips user:password@ from target URLs even if the server did not', () => {
    expect(list.items[0]!.target).toBe('https://shop.example.test/app')
    expect(stripUserinfo('http://a:b@host:8080/x')).toBe('http://host:8080/x')
    expect(stripUserinfo('https://host/x?u=a@b')).toBe('https://host/x?u=a@b')
  })

  it('formats a row with status, name, severity counts and date', () => {
    const row = formatPentestRow(list.items[0]!)
    expect(row).toContain('completed')
    expect(row).toContain('Juice Shop')
    expect(row).toContain(formatSeverityCounts({ critical: 0, high: 2, medium: 0, low: 0, informational: 1 }))
    expect(row).toContain('2026-10-13')
  })
})
