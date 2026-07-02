export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational'
export type FindingStatus = 'open' | 'mitigated' | 'enriched' | 'ready'
export type FindingType = string

export interface Finding {
  id: string
  title: string
  severity: FindingSeverity
  severity_numerical: number | null
  status: FindingStatus
  type: FindingType | null
  category: string | null
  tool: string | null
  language: string | null
  file_path: string | null
  line: number | null
  cwe: number | null
  extra_cwe: number[]
  cvssv3_score: number | null
  cvssv4_score: number | null
  prioritization_value: number | null
  effort_for_fixing: number | null
  exploitability: number | null
  impact: number | null
  confidence: number | null
  estimated_epss: number | null
  repo_id: string
  repo_nickname: string | null
  date: string
  is_false_positive: boolean
  is_duplicate: boolean
  is_sandbox: boolean
  owasps: string[]
  policy_rules: unknown[]
  tags: string[]
  cve: string | null
  description: string | null
  mitigation: string | null
  single_line_code: string | null
  scanner_report_code: string | null
  policy_name: string | null
}

export type Screen = 'repos' | 'findings' | 'detail'

export interface Repository {
  id: string
  nickname: string
  uri: string
  html_url: string | null
  repository_branch: string
  active: boolean
  repo_type: string
  status: string
  source_control: string
  finding_counts: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
}

export interface Remediation {
  id: string
  finding_id: string
  diff: string | null
  status: 'pending' | 'ready' | 'applied' | 'error'
  auto_create: boolean
  error_message?: string | null
}

export interface PR {
  remediation_id: string
  url: string
  status: string
}

export interface ApiToken {
  id: string
  name: string
  token: string
  created_at: string
}

export interface ApiTokenListItem {
  name: string
  created_at: string
  expires_at?: string | null
  token_type: string
}

export interface SessionUser {
  id: string
  client_id: string
  email: string
}

export type Panel = 'findings' | 'repos'

export type InputMode = 'navigation' | 'repl' | 'login' | 'filter' | 'scm'

export type ScmProvider = 'github' | 'gitlab' | 'bitbucket' | 'gitea'

export interface ScmRepo {
  id: string
  name: string
  full_name: string
  html_url?: string
  clone_url?: string
  private?: boolean
}

export interface StatusJob {
  type: 'repo' | 'remediation'
  id: string
  name: string
  status: string
  progress: number
  logs: string[]
}
