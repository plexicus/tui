import { z } from 'zod'

const SEVERITY_MAP: Record<string, string> = {
  critical: 'critical', high: 'high', medium: 'medium', low: 'low',
  informational: 'informational', info: 'informational',
}

const STATUS_MAP: Record<string, string> = {
  open: 'open',
  pending_input: 'open',
  enriched: 'enriched',
  issued: 'enriched',
  ready: 'ready',
  completed: 'mitigated',
  pr_submitted: 'mitigated',
  solved: 'mitigated',
  mitigated: 'mitigated',
}

const FindingAttributesSchema = z.object({
  title: z.string(),
  severity: z.string().transform(s => (SEVERITY_MAP[s.toLowerCase()] ?? 'low') as 'critical' | 'high' | 'medium' | 'low' | 'informational'),
  severity_numerical: z.number().nullable().default(null),
  status: z.string().transform(s => (STATUS_MAP[s.toLowerCase()] ?? 'open') as 'open' | 'mitigated' | 'enriched' | 'ready'),
  type: z.string().nullable().optional().transform(v => v ?? null),
  category: z.string().nullable().default(null),
  tool: z.string().nullable().default(null),
  language: z.string().nullable().default(null),
  file_path: z.string().nullable().default(null),
  line: z.number().nullable().default(null),
  cwe: z.number().nullable().default(null),
  extra_cwe: z.array(z.number()).default([]),
  cvssv3_score: z.number().nullable().default(null),
  cvssv4_score: z.number().nullable().default(null),
  prioritization_value: z.number().nullable().default(null),
  effort_for_fixing: z.number().nullable().default(null),
  exploitability: z.number().nullable().default(null),
  impact: z.number().nullable().default(null),
  confidence: z.number().nullable().default(null),
  estimated_epss: z.number().nullable().default(null),
  repo_id: z.string(),
  date: z.string(),
  is_false_positive: z.boolean().default(false),
  duplicate: z.boolean().optional(),
  is_duplicate: z.boolean().optional(),
  is_sandbox: z.boolean().default(false),
  owasps: z.array(
    z.union([
      z.string(),
      z.object({ owasp_id: z.string(), title: z.string().optional() })
        .transform(o => o.owasp_id),
    ])
  ).default([]),
  policy_rules: z.array(z.unknown()).default([]),
  tags: z.array(z.string()).default([]),
  cve: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  mitigation: z.string().nullable().default(null),
  single_line_code: z.string().nullable().default(null),
  scanner_report_code: z.string().nullable().default(null),
  policy_name: z.string().nullable().default(null),
}).transform(a => ({
  ...a,
  is_duplicate: a.is_duplicate ?? a.duplicate ?? false,
}))

export const FindingItemSchema = z.object({
  id: z.string(),
  attributes: FindingAttributesSchema,
})

export const FindingsResponseSchema = z.object({
  items: z.array(FindingItemSchema),
  next: z.string().nullable().optional(),
  prev: z.string().nullable().optional(),
  total: z.number().default(0),
})

export const SingleFindingResponseSchema = z.object({
  data: FindingItemSchema,
  meta: z.unknown().optional(),
})

const RepoAttributesSchema = z.object({
  nickname: z.string(),
  uri: z.string(),
  active: z.boolean().nullish().transform(v => v ?? true),
  repo_type: z.string().nullish().transform(v => v ?? 'github'),
  status: z.string().nullish().transform(v => v ?? 'active'),
  data: z.object({
    branch: z.string().nullish(),
    source_control: z.string().nullish(),
    url: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
  }).nullish(),
  findings: z.object({
    total: z.number().default(0),
    critical: z.number().default(0),
    high: z.number().default(0),
    medium: z.number().default(0),
    low: z.number().default(0),
    info: z.number().default(0),
  }).nullable().optional(),
})

export const RepoItemSchema = z.object({
  id: z.string(),
  attributes: RepoAttributesSchema,
})

export const RepositoriesResponseSchema = z.object({
  items: z.array(RepoItemSchema),
  next: z.string().nullable().optional(),
  prev: z.string().nullable().optional(),
  total: z.number().default(0),
})

const REMEDIATION_STATUS_MAP: Record<string, 'pending' | 'ready' | 'applied' | 'error'> = {
  pending: 'pending', processing: 'pending', running: 'pending', in_progress: 'pending',
  enriched: 'pending', pending_input: 'pending',
  ready: 'ready', done: 'ready', completed: 'ready',
  pr_submitted: 'applied', applied: 'applied',
  error: 'error', failed: 'error', quota_exceeded: 'error',
}

// The API returns diff as a structured object: { "filepath": [{ original, changes }] }
// Each hunk has line-numbered content ("000074    line content").
// Convert to a unified-diff-like string for the existing parseDiff utility.
function structuredDiffToString(diff: unknown): string | null {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return null
  const lines: string[] = []
  const stripNums = (s: string) => s.split('\n').map(l => l.replace(/^\d{6}\s{4}/, ''))
  for (const [filePath, hunks] of Object.entries(diff as Record<string, unknown>)) {
    if (!Array.isArray(hunks)) continue
    lines.push(`--- a/${filePath}`, `+++ b/${filePath}`)
    for (const hunk of hunks) {
      lines.push('@@ hunk @@')
      if (hunk?.original) for (const l of stripNums(String(hunk.original))) lines.push(`-${l}`)
      if (hunk?.changes)  for (const l of stripNums(String(hunk.changes)))  lines.push(`+${l}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : null
}

export const RemediationSchema = z.object({
  // Real API uses _id / finding_ids / processing_status / structured diff object
  _id:               z.string().optional(),
  id:                z.string().optional(),
  finding_ids:       z.array(z.string()).optional(),
  finding_id:        z.string().optional(),
  diff:              z.unknown().optional(),
  code_diff:         z.string().nullable().optional(),
  processing_status: z.string().optional(),
  status:            z.string().optional(),
  auto_create:       z.boolean().optional().default(false),
  error_message:     z.string().nullable().optional(),
}).transform(r => ({
  id:           r._id ?? r.id ?? '',
  finding_id:   r.finding_id ?? r.finding_ids?.[0] ?? '',
  diff:         structuredDiffToString(r.diff) ?? r.code_diff ?? null,
  status:       REMEDIATION_STATUS_MAP[(r.processing_status ?? r.status ?? '').toLowerCase()] ?? 'pending' as const,
  auto_create:  r.auto_create ?? false,
  error_message: r.error_message ?? null,
}))

export const RemediationsCollectionSchema = z.object({
  items: z.array(RemediationSchema).optional().default([]),
  next: z.string().nullable().optional(),
  prev: z.string().nullable().optional(),
})

export const PRSchema = z.object({
  remediation_id: z.string(),
  url: z.string(),
  status: z.string(),
})

export const ApiTokenListItemSchema = z.object({
  name: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable().optional(),
  token_type: z.string().default('api'),
})

export const ApiTokenCreatedSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default('bearer'),
  name: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable().optional(),
}).transform(t => ({
  id: t.name,
  name: t.name,
  token: t.access_token,
  created_at: t.created_at,
}))

export const ApiTokensListSchema = z.array(ApiTokenListItemSchema)
export const RemediationsListSchema = z.array(RemediationSchema)

export const SessionUserSchema = z.object({
  user_id: z.string(),
  client_id: z.string(),
  email: z.string(),
}).transform(u => ({ id: u.user_id, client_id: u.client_id, email: u.email }))

export const LoginResponseFlatSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default('Bearer'),
})

export const LoginResponse2FASchema = z.object({
  otp_data: z.object({ secret: z.string() }),
  requires_2fa: z.literal(true),
  message: z.string(),
})

export const LoginResponseUnion = z.union([LoginResponseFlatSchema, LoginResponse2FASchema])

export const Verify2FAResponseSchema = z.object({
  verify_otp: z.boolean(),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
})

export const LoginResponseSchema = LoginResponseFlatSchema
