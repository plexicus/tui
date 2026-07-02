import type { Finding, FindingSeverity, FindingStatus, FindingType, Repository, Remediation, Panel, InputMode, SessionUser, StatusJob, Screen } from '../types.js'

export interface FindingsFilter {
  severities?: FindingSeverity[]
  repository_ids?: string[]
  statuses?: FindingStatus[]
  types?: FindingType[]
  cvss_gt?: number
  cvss_lt?: number
  priority_gt?: number
  priority_lt?: number
  cwe_ids?: number[]
  policy_names?: string[]
  languages?: string[]
  categories?: string[]
  is_false_positive?: boolean
  finding_type?: 'app' | 'scm' | 'cloud' | 'registry'
  sort_by?: 'priority' | 'severity' | 'cvss' | 'date' | 'epss'
  sort_dir?: 'desc' | 'asc'
}

export type Action =
  | { type: 'auth/set'; payload: { user: SessionUser; token: string } }
  | { type: 'auth/clear' }
  | { type: 'findings/set'; payload: Finding[] }
  | { type: 'findings/loading'; payload: boolean }
  | { type: 'findings/select'; payload: string | null }
  | { type: 'findings/filter'; payload: FindingsFilter }
  | { type: 'findings/update'; payload: Finding }
  | { type: 'findings/setPage'; payload: number }
  | { type: 'findings/setPagination'; payload: { total: number; pageCount: number } }
  | { type: 'repos/set'; payload: Repository[] }
  | { type: 'repos/loading'; payload: boolean }
  | { type: 'remediation/set'; payload: Remediation }
  | { type: 'ui/setPanel'; payload: Panel }
  | { type: 'ui/setTheme'; payload: 'dark' | 'light' | 'plexicus' }
  | { type: 'ui/setError'; payload: string | null }
  | { type: 'ui/setNotification'; payload: string | null }
  | { type: 'ui/setInputMode'; payload: InputMode }
  | { type: 'ui/setFuzzyOpen'; payload: boolean }
  | { type: 'filter/open' }
  | { type: 'filter/close' }
  | { type: 'scm/open' }
  | { type: 'scm/close' }
  | { type: 'status/open'; payload: StatusJob }
  | { type: 'status/update'; payload: Partial<StatusJob> & { id: string } }
  | { type: 'status/close' }
  | { type: 'ws/setConnected'; payload: boolean }
  | { type: 'nav/pushScreen'; payload: Screen }
  | { type: 'nav/popScreen' }
  | { type: 'repo/select'; payload: string | null }
