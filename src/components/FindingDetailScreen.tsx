import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'
import { severityBadge, severityColor, cvssColor } from '../utils/severity.js'
import { scmLabel, scmUrl, openScmLink } from '../utils/scm.js'
import { DiffModal } from './DiffModal.js'
import { expandTabs } from '../utils/text.js'
import { useFindingActions } from '../hooks/useFindingActions.js'
import type { Finding } from '../types.js'

function statusLabel(finding: Finding): string {
  if (finding.is_false_positive) return '⊘ false positive'
  switch (finding.status) {
    case 'open': return 'open'
    case 'mitigated': return '✓ mitigated'
    case 'enriched': return '⊕ enriched'
    case 'ready': return '⚡ ready'
    default: return finding.status
  }
}

function statusColor(finding: Finding): string {
  if (finding.is_false_positive) return 'gray'
  switch (finding.status) {
    case 'open': return 'yellow'
    case 'mitigated': return 'green'
    case 'enriched': return 'cyan'
    case 'ready': return 'magenta'
    default: return 'white'
  }
}

function scoreBar(value: number | null, max = 100): string {
  if (value === null) return '—'
  const filled = Math.round((value / max) * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${value}`
}

const CODE_VISIBLE = 12

// scanner_report_code lines are prefixed with a 6-digit line number: "000020    code..."
function parseLineNum(line: string): number | null {
  const m = line.match(/^(\d{6})\s/)
  return m ? parseInt(m[1], 10) : null
}

function CodeBlock({ code, scrollOffset, highlightLine }: { code: string; scrollOffset: number; highlightLine?: number | null }) {
  const lines = code.split('\n')
  const start = Math.max(0, Math.min(scrollOffset, Math.max(0, lines.length - CODE_VISIBLE)))
  const visible = lines.slice(start, start + CODE_VISIBLE)
  const above = start
  const below = lines.length - start - visible.length
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {above > 0 && <Text dimColor>↑ {above} line{above > 1 ? 's' : ''} above</Text>}
      {visible.map((line, i) => {
        const lineNum = parseLineNum(line)
        const isHot = highlightLine !== null && highlightLine !== undefined && lineNum === highlightLine
        return (
          <Text key={start + i} backgroundColor={isHot ? 'yellow' : undefined} color={isHot ? 'black' : 'white'}>
            {expandTabs(line)}
          </Text>
        )
      })}
      {below > 0 && <Text dimColor>↓ {below} line{below > 1 ? 's' : ''} below</Text>}
    </Box>
  )
}

export function FindingDetailScreen() {
  const { state, dispatch } = useAppState()
  const ac = accent(state.theme)
  const [showDiff, setShowDiff] = useState(false)
  const [scmStatus, setScmStatus] = useState<string | null>(null)
  const [codeScroll, setCodeScroll] = useState(0)

  const finding = state.selectedFindingId
    ? state.findings.find(f => f.id === state.selectedFindingId) ?? null
    : null

  const repo = finding
    ? state.repos.find(r => r.id === finding.repo_id) ?? null
    : null

  const { suppress, toggleFalsePositive } = useFindingActions()

  const handleSuppress = useCallback(() => {
    if (finding) suppress(finding)
  }, [finding, suppress])

  const handleFalsePositive = useCallback(() => {
    if (finding) toggleFalsePositive(finding)
  }, [finding, toggleFalsePositive])

  const handleOpenLink = useCallback(async () => {
    if (!finding || !repo) return
    const url = scmUrl(repo, finding)
    if (!url) return
    const result = await openScmLink(url)
    if (result.opened && result.copied) setScmStatus(`Opened + copied: ${result.url}`)
    else if (result.opened) setScmStatus(`Opened: ${result.url}`)
    else if (result.copied) setScmStatus(`Copied: ${result.url}`)
    else setScmStatus(`URL: ${result.url}`)
  }, [finding, repo])

  const codeSource = finding?.scanner_report_code ?? finding?.single_line_code ?? null
  const codeLineCount = codeSource?.split('\n').length ?? 0

  useEffect(() => {
    if (!codeSource || !finding?.line) return
    const lines = codeSource.split('\n')
    const idx = lines.findIndex(l => parseLineNum(l) === finding.line)
    if (idx >= 0) setCodeScroll(Math.max(0, idx - Math.floor(CODE_VISIBLE / 2)))
  }, [finding?.id])

  useInput((input, key) => {
    if (!finding) return
    if (key.escape) { dispatch({ type: 'nav/popScreen' }); return }
    if (input === 'r') { setShowDiff(true); return }
    if (input === 's') { handleSuppress(); return }
    if (input === 'f') { handleFalsePositive(); return }
    if (input === 'o' && repo) { handleOpenLink(); return }
    if (key.upArrow && codeLineCount > CODE_VISIBLE) {
      setCodeScroll(s => Math.max(0, s - 1))
      return
    }
    if (key.downArrow && codeLineCount > CODE_VISIBLE) {
      setCodeScroll(s => Math.min(s + 1, Math.max(0, codeLineCount - CODE_VISIBLE)))
      return
    }
  }, { isActive: !showDiff && state.inputMode === 'navigation' })

  if (!finding) return null
  if (showDiff) return <DiffModal finding={finding} onClose={() => setShowDiff(false)} />

  const sevColor = severityColor(finding.severity)
  const cvssScore = finding.cvssv3_score
  const linkUrl = repo ? scmUrl(repo, finding) : null
  const linkLabel = repo ? scmLabel(repo.source_control) : null

  const fpLabel = finding.is_false_positive ? 'f=un-fp' : 'f=fp'
  const suppressLabel = finding.status === 'mitigated' ? 's=re-open' : 's=suppress'
  const hasRemediation = finding.status === 'mitigated' || finding.status === 'ready'
  const fixLabel = hasRemediation ? 'r=view remediation' : 'r=fix'

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>

      {/* ── Title + badges ── */}
      <Box marginBottom={1}>
        <Text color={sevColor} bold>{severityBadge(finding.severity)}</Text>
        <Text> </Text>
        <Text bold>{finding.title}</Text>
        {finding.is_false_positive && <Text color="gray">  [FP]</Text>}
        {finding.is_duplicate && <Text color="gray">  [DUP]</Text>}
        {finding.is_sandbox && <Text dimColor>  [SANDBOX]</Text>}
      </Box>

      {/* ── Identifiers ── */}
      <Box flexWrap="wrap">
        {finding.cve && (
          <Box marginRight={3}>
            <Text dimColor>CVE </Text>
            <Text color={ac} bold>{finding.cve}</Text>
          </Box>
        )}
        <Box marginRight={3}>
          <Text dimColor>CVSS </Text>
          {cvssScore !== null
            ? <Text color={cvssColor(cvssScore)} bold>{cvssScore.toFixed(1)}</Text>
            : <Text dimColor>N/A</Text>}
        </Box>
        {finding.cvssv4_score !== null && finding.cvssv4_score > 0 && (
          <Box marginRight={3}>
            <Text dimColor>CVSSv4 </Text>
            <Text bold>{finding.cvssv4_score.toFixed(1)}</Text>
          </Box>
        )}
        <Box marginRight={3}>
          <Text dimColor>Status </Text>
          <Text color={statusColor(finding)}>{statusLabel(finding)}</Text>
        </Box>
        {finding.prioritization_value !== null && (
          <Box marginRight={3}>
            <Text dimColor>Priority </Text>
            <Text color={finding.prioritization_value >= 80 ? 'red' : finding.prioritization_value >= 50 ? 'yellow' : undefined} bold>
              {finding.prioritization_value}
            </Text>
          </Box>
        )}
        {finding.estimated_epss !== null && (
          <Box>
            <Text dimColor>EPSS </Text>
            <Text>{(finding.estimated_epss * 100).toFixed(2)}%</Text>
          </Box>
        )}
      </Box>

      {/* ── Context ── */}
      <Box flexWrap="wrap">
        <Box marginRight={3}>
          <Text dimColor>Repo </Text>
          <Text>{finding.repo_nickname ?? finding.repo_id}</Text>
        </Box>
        {finding.type && (
          <Box marginRight={3}>
            <Text dimColor>Type </Text>
            <Text>{finding.type}</Text>
          </Box>
        )}
        {finding.language && (
          <Box marginRight={3}>
            <Text dimColor>Lang </Text>
            <Text>{finding.language}</Text>
          </Box>
        )}
        {finding.tool && (
          <Box marginRight={3}>
            <Text dimColor>Tool </Text>
            <Text>{finding.tool}</Text>
          </Box>
        )}
        {finding.category && (
          <Box>
            <Text dimColor>Cat </Text>
            <Text>{finding.category}</Text>
          </Box>
        )}
      </Box>

      {/* ── CWE / Policy ── */}
      {(finding.cwe !== null || finding.extra_cwe.length > 0 || finding.policy_name) && (
        <Box flexWrap="wrap">
          {finding.cwe !== null && (
            <Box marginRight={3}>
              <Text dimColor>CWE </Text>
              <Text>CWE-{finding.cwe}</Text>
            </Box>
          )}
          {finding.extra_cwe.length > 0 && (
            <Box marginRight={3}>
              <Text dimColor>Also </Text>
              <Text dimColor>{finding.extra_cwe.map(c => `CWE-${c}`).join(', ')}</Text>
            </Box>
          )}
          {finding.policy_name && (
            <Box>
              <Text dimColor>Policy </Text>
              <Text color={ac}>{finding.policy_name}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* ── OWASP / Tags ── */}
      {(finding.owasps.length > 0 || finding.tags.length > 0) && (
        <Box flexWrap="wrap">
          {finding.owasps.length > 0 && (
            <Box marginRight={3}>
              <Text dimColor>OWASP </Text>
              <Text color="cyan">{finding.owasps.join(', ')}</Text>
            </Box>
          )}
          {finding.tags.length > 0 && (
            <Box>
              <Text dimColor>Tags </Text>
              <Text dimColor>{finding.tags.join(', ')}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* ── File + line + SCM ── */}
      {finding.file_path && (
        <Box marginTop={1}>
          <Text dimColor>File </Text>
          <Text color="blue">{finding.file_path}</Text>
          {finding.line !== null && <Text color="blue">:{finding.line}</Text>}
          {linkUrl && <Text color={ac}>  [o] {linkLabel}</Text>}
        </Box>
      )}

      {/* ── Code snippet ── */}
      {codeSource && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Code</Text>
          <CodeBlock code={codeSource} scrollOffset={codeScroll} highlightLine={finding.line} />
        </Box>
      )}

      {/* ── Security metrics ── */}
      {(finding.exploitability !== null || finding.impact !== null || finding.confidence !== null || finding.effort_for_fixing !== null) && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Security Metrics</Text>
          <Box flexDirection="row" flexWrap="wrap" paddingLeft={1}>
            {finding.exploitability !== null && (
              <Box marginRight={3} flexDirection="column">
                <Text dimColor>Exploitability</Text>
                <Text color="red">{scoreBar(finding.exploitability)}</Text>
              </Box>
            )}
            {finding.impact !== null && (
              <Box marginRight={3} flexDirection="column">
                <Text dimColor>Impact</Text>
                <Text color="yellow">{scoreBar(finding.impact)}</Text>
              </Box>
            )}
            {finding.confidence !== null && (
              <Box marginRight={3} flexDirection="column">
                <Text dimColor>Confidence</Text>
                <Text color="cyan">{scoreBar(finding.confidence)}</Text>
              </Box>
            )}
            {finding.effort_for_fixing !== null && (
              <Box flexDirection="column">
                <Text dimColor>Effort to fix</Text>
                <Text>{scoreBar(finding.effort_for_fixing)}</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ── Description ── */}
      {finding.description && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Description</Text>
          <Text wrap="wrap">{finding.description}</Text>
        </Box>
      )}

      {/* ── Mitigation ── */}
      {finding.mitigation && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Mitigation</Text>
          <Text wrap="wrap" color="green">{finding.mitigation}</Text>
        </Box>
      )}

      {/* ── SCM URL feedback ── */}
      {scmStatus && (
        <Box marginTop={1}>
          <Text color="cyan">{scmStatus}</Text>
        </Box>
      )}

      {/* ── Actions ── */}
      <Box marginTop={1}>
        <Text dimColor>{fixLabel}  {suppressLabel}  {fpLabel}</Text>
        {linkUrl && <Text dimColor>  o={linkLabel}</Text>}
        {codeLineCount > CODE_VISIBLE && <Text dimColor>  ↑↓=scroll code</Text>}
        <Text dimColor>  Esc=back</Text>
      </Box>
    </Box>
  )
}
