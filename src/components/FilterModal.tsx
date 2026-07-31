import React, { useState, useCallback, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'
import type { FindingSeverity, FindingStatus, FindingType } from '../types.js'
import type { FindingsFilter } from '../state/actions.js'

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'informational']
const STATUSES: FindingStatus[] = ['open', 'enriched', 'ready', 'mitigated']
const TYPES: FindingType[] = ['SAST', 'SCA', 'DAST']

// Section indices
const S_SORT = 0
const S_SEVERITY = 1
const S_REPO = 2
const S_STATUS = 3
const S_TYPE = 4
const S_CVSS_GT = 5
const S_CVSS_LT = 6
const S_PRIORITY_GT = 7
const S_PRIORITY_LT = 8
const S_LANGUAGE = 9
const S_CATEGORY = 10
const S_CWE = 11
const S_FP = 12
const SECTION_COUNT = 13

const SORT_OPTIONS = ['priority', 'severity', 'cvss', 'date', 'epss'] as const

interface Draft {
  sortBy: 'priority' | 'severity' | 'cvss' | 'date' | 'epss'
  sortDir: 'desc' | 'asc'
  severities: FindingSeverity[]
  repository_ids: string[]
  statuses: FindingStatus[]
  types: FindingType[]
  cvssGt: string
  cvssLt: string
  priorityGt: string
  priorityLt: string
  language: string
  category: string
  cweIds: number[]
  cweInput: string
  repoQuery: string
  isFalsePositive: boolean
}

function initDraft(filter: FindingsFilter): Draft {
  return {
    sortBy: filter.sort_by ?? 'priority',
    sortDir: filter.sort_dir ?? 'desc',
    severities: filter.severities ? [...filter.severities] : [],
    repository_ids: filter.repository_ids ? [...filter.repository_ids] : [],
    statuses: filter.statuses ? [...filter.statuses] : [],
    types: filter.types ? [...filter.types] : [],
    cvssGt: filter.cvss_gt !== undefined ? String(filter.cvss_gt) : '',
    cvssLt: filter.cvss_lt !== undefined ? String(filter.cvss_lt) : '',
    priorityGt: filter.priority_gt !== undefined ? String(filter.priority_gt) : '',
    priorityLt: filter.priority_lt !== undefined ? String(filter.priority_lt) : '',
    language: filter.languages?.[0] ?? '',
    category: filter.categories?.[0] ?? '',
    cweIds: filter.cwe_ids ? [...filter.cwe_ids] : [],
    cweInput: '',
    repoQuery: '',
    isFalsePositive: filter.is_false_positive ?? false,
  }
}

function draftToFilter(draft: Draft): FindingsFilter {
  const filter: FindingsFilter = {}
  filter.sort_by = draft.sortBy
  filter.sort_dir = draft.sortDir
  if (draft.severities.length) filter.severities = draft.severities
  if (draft.repository_ids.length) filter.repository_ids = draft.repository_ids
  if (draft.statuses.length) filter.statuses = draft.statuses
  if (draft.types.length) filter.types = draft.types
  const cvssGt = parseFloat(draft.cvssGt)
  if (!isNaN(cvssGt)) filter.cvss_gt = cvssGt
  const cvssLt = parseFloat(draft.cvssLt)
  if (!isNaN(cvssLt)) filter.cvss_lt = cvssLt
  const priorityGt = parseInt(draft.priorityGt, 10)
  if (!isNaN(priorityGt)) filter.priority_gt = priorityGt
  const priorityLt = parseInt(draft.priorityLt, 10)
  if (!isNaN(priorityLt)) filter.priority_lt = priorityLt
  if (draft.language) filter.languages = [draft.language]
  if (draft.category) filter.categories = [draft.category]
  if (draft.cweIds.length) filter.cwe_ids = draft.cweIds
  if (draft.isFalsePositive) filter.is_false_positive = true
  return filter
}

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}

function isTextSection(s: number): boolean {
  return s === S_LANGUAGE || s === S_CATEGORY || s === S_CWE ||
    s === S_CVSS_GT || s === S_CVSS_LT || s === S_PRIORITY_GT || s === S_PRIORITY_LT
}
// S_LANGUAGE=9, S_CATEGORY=10, S_CWE=11, S_CVSS_GT=5, S_CVSS_LT=6, S_PRIORITY_GT=7, S_PRIORITY_LT=8

function Checkbox({ checked, label, active }: { checked: boolean; label: string; active?: boolean }) {
  return (
    <Box marginRight={2}>
      <Text color={active ? 'cyan' : undefined} inverse={active}>
        {checked ? '[x]' : '[ ]'} {label}
      </Text>
    </Box>
  )
}

function Chips({ ids, labels, accentColor }: { ids: string[]; labels: Map<string, string>; accentColor: string }) {
  if (!ids.length) return null
  return (
    <Box flexWrap="wrap" marginBottom={0}>
      {ids.map(id => (
        <Box key={id} marginRight={1}>
          <Text color={accentColor}>[{labels.get(id) ?? id}]</Text>
        </Box>
      ))}
    </Box>
  )
}

export function FilterModal() {
  const { state, dispatch } = useAppState()
  const ac = accent(state.theme)

  const [draft, setDraft] = useState<Draft>(() => initDraft(state.findingsFilter))
  const [section, setSection] = useState(0)
  // innerCursor is used for checkbox sections (which item within the group is highlighted)
  const [innerCursor, setInnerCursor] = useState(0)
  // repoCursor is used for navigating filtered repo results
  const [repoCursor, setRepoCursor] = useState(0)

  const repoNicknames = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of state.repos) m.set(r.id, r.nickname)
    return m
  }, [state.repos])

  const filteredRepos = useMemo(() => {
    const q = draft.repoQuery.toLowerCase()
    return q
      ? state.repos.filter(r => r.nickname.toLowerCase().includes(q) || r.uri.toLowerCase().includes(q))
      : state.repos
  }, [state.repos, draft.repoQuery])

  const apply = useCallback(() => {
    dispatch({ type: 'findings/filter', payload: draftToFilter(draft) })
    dispatch({ type: 'filter/close' })
  }, [draft, dispatch])

  const reset = useCallback(() => {
    setDraft(initDraft({}))
    setInnerCursor(0)
    setRepoCursor(0)
  }, [])

  const getTextFieldForSection = (s: number, d: Draft): string => {
    switch (s) {
      case S_CVSS_GT: return d.cvssGt
      case S_CVSS_LT: return d.cvssLt
      case S_PRIORITY_GT: return d.priorityGt
      case S_PRIORITY_LT: return d.priorityLt
      case S_LANGUAGE: return d.language
      case S_CATEGORY: return d.category
      case S_CWE: return d.cweInput
      default: return ''
    }
  }

  useInput((input, key) => {
    if (state.inputMode !== 'filter') return

    // Always: Esc cancels
    if (key.escape) {
      dispatch({ type: 'filter/close' })
      return
    }

    // ↑/↓ arrows always navigate sections
    if (key.upArrow) {
      setSection(s => Math.max(0, s - 1))
      setInnerCursor(0)
      return
    }
    if (key.downArrow) {
      setSection(s => Math.min(SECTION_COUNT - 1, s + 1))
      setInnerCursor(0)
      return
    }

    // Section-specific handling
    switch (section) {
      case S_SORT: {
        if (input === 'j') { setSection(s => Math.min(SECTION_COUNT - 1, s + 1)); setInnerCursor(0); return }
        if (input === 'k') { setSection(s => Math.max(0, s - 1)); setInnerCursor(0); return }
        if (key.leftArrow || input === 'h') { setInnerCursor(c => Math.max(0, c - 1)); return }
        if (key.rightArrow || input === 'l') { setInnerCursor(c => Math.min(SORT_OPTIONS.length - 1, c + 1)); return }
        if (input === ' ') {
          const opt = SORT_OPTIONS[innerCursor]
          if (opt) setDraft(d => ({ ...d, sortBy: opt }))
          return
        }
        if (input === 'd') {
          setDraft(d => ({ ...d, sortDir: d.sortDir === 'desc' ? 'asc' : 'desc' }))
          return
        }
        if (input === 'r') { reset(); return }
        if (key.return) { apply(); return }
        break
      }

      case S_SEVERITY: {
        if (input === 'j') { setSection(s => Math.min(SECTION_COUNT - 1, s + 1)); setInnerCursor(0); return }
        if (input === 'k') { setSection(s => Math.max(0, s - 1)); setInnerCursor(0); return }
        if (key.leftArrow || input === 'h') { setInnerCursor(c => Math.max(0, c - 1)); return }
        if (key.rightArrow || input === 'l') { setInnerCursor(c => Math.min(SEVERITIES.length - 1, c + 1)); return }
        if (input === ' ') {
          const sev = SEVERITIES[innerCursor]
          if (sev) setDraft(d => ({ ...d, severities: toggleItem(d.severities, sev) }))
          return
        }
        if (input === 'r') { reset(); return }
        if (key.return) { apply(); return }
        break
      }

      case S_REPO: {
        if (key.backspace || key.delete) {
          setDraft(d => ({ ...d, repoQuery: d.repoQuery.slice(0, -1) }))
          setRepoCursor(0)
          return
        }
        if (input === 'j') { setRepoCursor(c => Math.min(filteredRepos.length - 1, c + 1)); return }
        if (input === 'k') { setRepoCursor(c => Math.max(0, c - 1)); return }
        if (input === ' ' || key.return) {
          const repo = filteredRepos[repoCursor]
          if (repo) {
            setDraft(d => ({ ...d, repository_ids: toggleItem(d.repository_ids, repo.id) }))
          } else if (key.return) {
            apply()
          }
          return
        }
        if (input === 'r' && !draft.repoQuery) { reset(); return }
        if (!key.ctrl && !key.meta && input && input.length === 1) {
          setDraft(d => ({ ...d, repoQuery: d.repoQuery + input }))
          setRepoCursor(0)
          return
        }
        break
      }

      case S_STATUS: {
        if (input === 'j') { setSection(s => Math.min(SECTION_COUNT - 1, s + 1)); setInnerCursor(0); return }
        if (input === 'k') { setSection(s => Math.max(0, s - 1)); setInnerCursor(0); return }
        if (key.leftArrow || input === 'h') { setInnerCursor(c => Math.max(0, c - 1)); return }
        if (key.rightArrow || input === 'l') { setInnerCursor(c => Math.min(STATUSES.length - 1, c + 1)); return }
        if (input === ' ') {
          const st = STATUSES[innerCursor]
          if (st) setDraft(d => ({ ...d, statuses: toggleItem(d.statuses, st) }))
          return
        }
        if (input === 'r') { reset(); return }
        if (key.return) { apply(); return }
        break
      }

      case S_TYPE: {
        if (input === 'j') { setSection(s => Math.min(SECTION_COUNT - 1, s + 1)); setInnerCursor(0); return }
        if (input === 'k') { setSection(s => Math.max(0, s - 1)); setInnerCursor(0); return }
        if (key.leftArrow || input === 'h') { setInnerCursor(c => Math.max(0, c - 1)); return }
        if (key.rightArrow || input === 'l') { setInnerCursor(c => Math.min(TYPES.length - 1, c + 1)); return }
        if (input === ' ') {
          const tp = TYPES[innerCursor]
          if (tp) setDraft(d => ({ ...d, types: toggleItem(d.types, tp) }))
          return
        }
        if (input === 'r') { reset(); return }
        if (key.return) { apply(); return }
        break
      }

      case S_FP: {
        if (input === 'j') { setSection(s => Math.min(SECTION_COUNT - 1, s + 1)); return }
        if (input === 'k') { setSection(s => Math.max(0, s - 1)); return }
        if (input === ' ') { setDraft(d => ({ ...d, isFalsePositive: !d.isFalsePositive })); return }
        if (input === 'r') { reset(); return }
        if (key.return) { apply(); return }
        break
      }

      case S_CWE: {
        if (key.backspace || key.delete) {
          if (draft.cweInput) {
            setDraft(d => ({ ...d, cweInput: d.cweInput.slice(0, -1) }))
          } else {
            setDraft(d => ({ ...d, cweIds: d.cweIds.slice(0, -1) }))
          }
          return
        }
        if (key.return) {
          if (draft.cweInput) {
            const n = parseInt(draft.cweInput, 10)
            if (!isNaN(n) && n > 0) {
              setDraft(d => ({ ...d, cweIds: d.cweIds.includes(n) ? d.cweIds : [...d.cweIds, n], cweInput: '' }))
            }
          } else {
            apply()
          }
          return
        }
        if (/\d/.test(input)) { setDraft(d => ({ ...d, cweInput: d.cweInput + input })); return }
        // j/k navigate sections when input field is empty
        if (input === 'j' && !draft.cweInput) { setSection(s => Math.min(SECTION_COUNT - 1, s + 1)); return }
        if (input === 'k' && !draft.cweInput) { setSection(s => Math.max(0, s - 1)); return }
        break
      }

      default: {
        // Number and text sections (S_CVSS_GT, S_CVSS_LT, S_PRIORITY_GT, S_PRIORITY_LT, S_LANGUAGE, S_CATEGORY)
        if (isTextSection(section)) {
          if (key.backspace || key.delete) {
            setDraft(d => {
              switch (section) {
                case S_CVSS_GT: return { ...d, cvssGt: d.cvssGt.slice(0, -1) }
                case S_CVSS_LT: return { ...d, cvssLt: d.cvssLt.slice(0, -1) }
                case S_PRIORITY_GT: return { ...d, priorityGt: d.priorityGt.slice(0, -1) }
                case S_PRIORITY_LT: return { ...d, priorityLt: d.priorityLt.slice(0, -1) }
                case S_LANGUAGE: return { ...d, language: d.language.slice(0, -1) }
                case S_CATEGORY: return { ...d, category: d.category.slice(0, -1) }
                default: return d
              }
            })
            return
          }
          if (key.return) { apply(); return }
          const isNumber = section >= S_CVSS_GT && section <= S_PRIORITY_LT
          if (!key.ctrl && !key.meta && input && input.length === 1) {
            if (isNumber && !/[\d.]/.test(input)) return
            setDraft(d => {
              switch (section) {
                case S_CVSS_GT: return { ...d, cvssGt: d.cvssGt + input }
                case S_CVSS_LT: return { ...d, cvssLt: d.cvssLt + input }
                case S_PRIORITY_GT: return { ...d, priorityGt: d.priorityGt + input }
                case S_PRIORITY_LT: return { ...d, priorityLt: d.priorityLt + input }
                case S_LANGUAGE: return { ...d, language: d.language + input }
                case S_CATEGORY: return { ...d, category: d.category + input }
                default: return d
              }
            })
            return
          }
        }
        break
      }
    }
  })

  const sectionLabel = (idx: number, label: string) => (
    <Text bold color={section === idx ? 'cyan' : 'white'}>{label}</Text>
  )

  const textField = (idx: number, value: string) => (
    <Box>
      {section === idx
        ? <Text>{value || ''}<Text inverse> </Text></Text>
        : <Text dimColor={!value}>{value || '(empty)'}</Text>
      }
    </Box>
  )

  const REPO_VISIBLE = 6

  const repoWindowStart = Math.max(0, repoCursor - Math.floor(REPO_VISIBLE / 2))
  const visibleRepos = filteredRepos.slice(repoWindowStart, repoWindowStart + REPO_VISIBLE)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={ac}
      paddingX={1}
      marginTop={1}
    >
      <Text bold color={ac}>Filter Findings  <Text dimColor>[↑↓]section [Space]toggle [Enter]apply [r]reset [Esc]cancel</Text></Text>

      {/* Sort */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_SORT, 'Sort by')}
        <Box>
          {SORT_OPTIONS.map((opt, i) => {
            const isActive = section === S_SORT && innerCursor === i
            const isSelected = draft.sortBy === opt
            return (
              <Box key={opt} marginRight={2}>
                <Text color={isActive ? 'cyan' : undefined} inverse={isActive}>
                  {isSelected ? '[•]' : '[ ]'} {opt}
                </Text>
              </Box>
            )
          })}
          <Text dimColor>  {draft.sortDir === 'desc' ? '↓ desc' : '↑ asc'} [d]toggle</Text>
        </Box>
        {section === S_SORT && <Text dimColor>[←/→] move  [Space] select  [d] direction</Text>}
      </Box>

      {/* Severity */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_SEVERITY, 'Severity')}
        <Box>
          {SEVERITIES.map((sev, i) => (
            <Checkbox
              key={sev}
              checked={draft.severities.includes(sev)}
              label={sev}
              active={section === S_SEVERITY && innerCursor === i}
            />
          ))}
        </Box>
        {section === S_SEVERITY && <Text dimColor>[←/→ or h/l] move  [Space] toggle</Text>}
      </Box>

      {/* Repository */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_REPO, 'Repository')}
        {draft.repository_ids.length > 0 && (
          <Chips ids={draft.repository_ids} labels={repoNicknames} accentColor={ac} />
        )}
        <Box>
          <Text dimColor>Search: </Text>
          {section === S_REPO
            ? <Text>{draft.repoQuery}<Text inverse> </Text></Text>
            : <Text dimColor={!draft.repoQuery}>{draft.repoQuery || '(type to filter)'}</Text>
          }
        </Box>
        {section === S_REPO && filteredRepos.length > 0 && (
          <Box flexDirection="column">
            {visibleRepos.map((repo, i) => {
              const absIdx = repoWindowStart + i
              const isActive = absIdx === repoCursor
              const isSelected = draft.repository_ids.includes(repo.id)
              return (
                <Box key={repo.id}>
                  <Text inverse={isActive}>
                    {isSelected ? '[x]' : '[ ]'} {repo.nickname}
                    <Text dimColor> ({repo.finding_counts.total})</Text>
                  </Text>
                </Box>
              )
            })}
            <Text dimColor>[j/k]navigate [Space]select</Text>
          </Box>
        )}
      </Box>

      {/* Status */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_STATUS, 'Status')}
        <Box>
          {STATUSES.map((st, i) => (
            <Checkbox
              key={st}
              checked={draft.statuses.includes(st)}
              label={st}
              active={section === S_STATUS && innerCursor === i}
            />
          ))}
        </Box>
      </Box>

      {/* Type */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_TYPE, 'Type')}
        <Box>
          {TYPES.map((tp, i) => (
            <Checkbox
              key={tp}
              checked={draft.types.includes(tp)}
              label={tp}
              active={section === S_TYPE && innerCursor === i}
            />
          ))}
        </Box>
      </Box>

      {/* CVSS Range */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color={section === S_CVSS_GT || section === S_CVSS_LT ? 'cyan' : 'white'}>CVSS Score</Text>
        <Box>
          <Text dimColor>Min: </Text>
          {textField(S_CVSS_GT, draft.cvssGt)}
          <Text dimColor>  Max: </Text>
          {textField(S_CVSS_LT, draft.cvssLt)}
        </Box>
      </Box>

      {/* Priority Range */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color={section === S_PRIORITY_GT || section === S_PRIORITY_LT ? 'cyan' : 'white'}>Priority</Text>
        <Box>
          <Text dimColor>Min: </Text>
          {textField(S_PRIORITY_GT, draft.priorityGt)}
          <Text dimColor>  Max: </Text>
          {textField(S_PRIORITY_LT, draft.priorityLt)}
        </Box>
      </Box>

      {/* Language */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_LANGUAGE, 'Language')}
        {textField(S_LANGUAGE, draft.language)}
        {section === S_LANGUAGE && <Text dimColor>case-sensitive exact match — use the casing shown on a finding</Text>}
      </Box>

      {/* Category */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_CATEGORY, 'Category')}
        {textField(S_CATEGORY, draft.category)}
        {section === S_CATEGORY && <Text dimColor>case-sensitive exact match — use the casing shown on a finding</Text>}
      </Box>

      {/* CWE IDs */}
      <Box marginTop={1} flexDirection="column">
        {sectionLabel(S_CWE, 'CWE IDs')}
        {draft.cweIds.length > 0 && (
          <Box>
            {draft.cweIds.map(id => (
              <Box key={id} marginRight={1}>
                <Text color={ac}>[{id}]</Text>
              </Box>
            ))}
          </Box>
        )}
        <Box>
          <Text dimColor>Add CWE: </Text>
          {section === S_CWE
            ? <Text>{draft.cweInput}<Text inverse> </Text></Text>
            : <Text dimColor>{draft.cweInput || '(type number + Enter)'}</Text>
          }
        </Box>
        {section === S_CWE && <Text dimColor>[Enter] add  [Backspace] delete last chip</Text>}
      </Box>

      {/* False positives */}
      <Box marginTop={1}>
        {sectionLabel(S_FP, '')}
        <Checkbox
          checked={draft.isFalsePositive}
          label="Include false positives"
          active={section === S_FP}
        />
      </Box>
    </Box>
  )
}
