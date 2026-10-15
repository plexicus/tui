import { PlexicusApiError } from '../utils/errors.js'

// Client API contract v1 (runbook docs/CLIENT-API-CONTRACT.md). Everything shown to the user passes
// through the explicit allowlists below: unknown keys are dropped, so a server that starts returning
// tokens, models, providers or costs cannot leak them into the UI. Product rule: customers see
// actions, AI credits and Pentest Units, never LLM tokens, models, providers or money costs.

export interface CreditCounter {
  used: number | null
  remaining: number | null
  limit: number | null
  unlimited: boolean
}

export interface CreditsSummary {
  active: boolean
  enforced: boolean
  plan: string | null
  period: string | null
  resets_at: string | null
  credits: CreditCounter | null
  pentest_units: CreditCounter | null
}

export type SeverityCounts = { critical: number; high: number; medium: number; low: number; informational: number }

export interface PentestView {
  id: string
  name: string
  target: string
  scan_mode: string | null
  status: string
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  severity_counts: SeverityCounts
  findings_total: number
  report_available: boolean
}

export interface PentestList {
  items: PentestView[]
  total: number
  page: number
  page_size: number
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

function counter(v: unknown): CreditCounter | null {
  if (!v || typeof v !== 'object') return null
  const o = rec(v)
  return {
    used: num(o.used),
    remaining: num(o.remaining),
    limit: num(o.limit),
    unlimited: o.unlimited === true,
  }
}

export function parseCreditsSummary(raw: unknown): CreditsSummary {
  const o = rec(raw)
  return {
    active: o.active === true,
    enforced: o.enforced === true,
    plan: str(o.plan),
    period: str(o.period),
    resets_at: str(o.resets_at),
    credits: counter(o.credits),
    pentest_units: counter(o.pentest_units),
  }
}

const fmt = (n: number) => n.toLocaleString('en-US')

function counterText(c: CreditCounter, label: string): string | null {
  if (c.unlimited) return `unlimited ${label}`
  if (c.remaining === null) return null
  return c.limit !== null ? `${fmt(c.remaining)} / ${fmt(c.limit)} ${label}` : `${fmt(c.remaining)} ${label}`
}

/** "25,190 / 25,500 AI credits · 4 / 4 Pentest Units · resets 2026-11-01 (pilot: not enforced yet)" or null (hide). */
export function formatCreditsLine(s: CreditsSummary | null): string | null {
  if (!s || !s.active) return null
  const parts: string[] = []
  if (s.credits) {
    const t = counterText(s.credits, 'AI credits')
    if (t) parts.push(t)
  }
  if (s.pentest_units) {
    const t = counterText(s.pentest_units, 'Pentest Units')
    if (t) parts.push(t)
  }
  if (parts.length === 0) return null
  let line = parts.join(' · ')
  if (s.resets_at) line += ` · resets ${s.resets_at.slice(0, 10)}`
  if (!s.enforced) line += ' (pilot: not enforced yet)'
  return line
}

/** The server already strips `user:password@`; do it again so a credential in a URL is never displayed. */
export function stripUserinfo(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1')
}

function severityCounts(v: unknown): SeverityCounts {
  const o = rec(v)
  return {
    critical: num(o.critical) ?? 0,
    high: num(o.high) ?? 0,
    medium: num(o.medium) ?? 0,
    low: num(o.low) ?? 0,
    informational: num(o.informational) ?? 0,
  }
}

export function parsePentest(raw: unknown): PentestView | null {
  const o = rec(raw)
  const id = str(o.id)
  if (!id) return null
  return {
    id,
    name: str(o.name) ?? id,
    target: stripUserinfo(str(o.target_url) ?? ''),
    scan_mode: str(o.scan_mode),
    status: str(o.status) ?? 'unknown',
    created_at: str(o.created_at),
    started_at: str(o.started_at),
    completed_at: str(o.completed_at),
    severity_counts: severityCounts(o.severity_counts),
    findings_total: num(o.findings_total) ?? 0,
    report_available: o.report_available === true,
  }
}

export function parsePentestList(raw: unknown): PentestList {
  const o = rec(raw)
  const items = (Array.isArray(o.items) ? o.items : []).map(parsePentest).filter((p): p is PentestView => p !== null)
  return {
    items,
    total: num(o.total) ?? items.length,
    page: num(o.page) ?? 1,
    page_size: num(o.page_size) ?? items.length,
  }
}

export function formatSeverityCounts(c: SeverityCounts): string {
  return `C${c.critical} H${c.high} M${c.medium} L${c.low} I${c.informational}`
}

export function formatPentestRow(p: PentestView): string {
  const when = (p.completed_at ?? p.started_at ?? p.created_at ?? '').slice(0, 10)
  return [p.status.padEnd(10), p.name.slice(0, 32).padEnd(32), formatSeverityCounts(p.severity_counts).padEnd(22), when].join(' ')
}

/** 404/403 (and 405/501) mean the server does not offer, or does not grant, this view: hide it. */
export function isFeatureUnavailable(err: unknown): boolean {
  return err instanceof PlexicusApiError && [403, 404, 405, 501].includes(err.statusCode)
}

// ---- support tickets (docs/SUPPORT-CHANNEL.md) ----
export const SUPPORT_CATEGORIES = ['question', 'bug', 'feature_request', 'billing', 'security', 'other'] as const
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]
export const SUBJECT_MAX = 200
export const MESSAGE_MAX = 5000

export interface SupportTicketInput {
  subject: string
  message: string
  category: SupportCategory
}

export function validateSupportTicket(t: SupportTicketInput, suffix = ''): string | null {
  if (!SUPPORT_CATEGORIES.includes(t.category)) return `category must be one of: ${SUPPORT_CATEGORIES.join(', ')}`
  const subject = t.subject.trim()
  if (!subject) return 'subject is required'
  if (subject.length > SUBJECT_MAX) return `subject must be at most ${SUBJECT_MAX} characters`
  const message = t.message.trim()
  if (!message) return 'message is required'
  if (message.length + suffix.length > MESSAGE_MAX) {
    return `message must be at most ${MESSAGE_MAX - suffix.length} characters`
  }
  return null
}

const SECRET_SHAPES = [/Bearer\s+[A-Za-z0-9._~+\/=-]{12,}/i, /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/, /\bplx[cd]_[A-Za-z0-9_-]+/]
export function looksLikeSecret(text: string): boolean {
  return SECRET_SHAPES.some(re => re.test(text))
}
