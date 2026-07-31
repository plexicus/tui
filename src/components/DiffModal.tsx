import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'
import { useRemediation } from '../hooks/useRemediation.js'
import { parseDiff } from '../utils/diff.js'
import { expandTabs } from '../utils/text.js'
import { Spinner } from './design-system/Spinner.js'
import type { Finding } from '../types.js'

const VISIBLE_LINES = 12

interface DiffModalProps {
  finding: Finding
  onClose: () => void
}

export function DiffModal({ finding, onClose }: DiffModalProps) {
  const { state } = useAppState()
  const ac = accent(state.theme)
  const { remediation, trigger, applyPR, prUrl, error: remediationError } = useRemediation(finding.id)
  const [scrollOffset, setScrollOffset] = useState(0)

  React.useEffect(() => {
    if (!remediation) {
      trigger()
    }
  }, [finding.id])

  React.useEffect(() => {
    const job = state.activeStatusJob
    if (
      job?.type === 'remediation' &&
      (job.status === 'ready' || job.status === 'done') &&
      (job.id === finding.id || job.id === remediation?.id)
    ) {
      trigger()
    }
  }, [state.activeStatusJob?.status])

  React.useEffect(() => {
    if (!prUrl) return
    const t = setTimeout(onClose, 1500)
    return () => clearTimeout(t)
  }, [prUrl])

  const isError = !!remediationError || remediation?.status === 'error'
  const isPending = !isError && (!remediation || remediation.status === 'pending')
  const isReady = !isError && remediation?.status === 'ready'
  const diffLines = isReady && remediation.diff ? parseDiff(remediation.diff) : []
  const maxOffset = Math.max(0, diffLines.length - VISIBLE_LINES)
  const visibleLines = diffLines.slice(scrollOffset, scrollOffset + VISIBLE_LINES)

  useInput((input, key) => {
    if (key.escape) { onClose(); return }

    if (isReady && diffLines.length > 0) {
      if (input === 'j' || key.downArrow) {
        setScrollOffset(o => Math.min(o + 1, maxOffset))
        return
      }
      if (input === 'k' || key.upArrow) {
        setScrollOffset(o => Math.max(o - 1, 0))
        return
      }
    }

    if (input === 'p' && remediation?.status === 'ready') {
      applyPR()
      return
    }
  }, { isActive: state.inputMode === 'navigation' })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={ac} paddingX={1} flexGrow={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text bold color={ac}>AI Remediation</Text>
          <Text dimColor> — {finding.title}</Text>
        </Box>
        {isReady && diffLines.length > 0 && (
          <Text dimColor>{scrollOffset + 1}–{Math.min(scrollOffset + VISIBLE_LINES, diffLines.length)}/{diffLines.length}</Text>
        )}
      </Box>

      {isPending && (
        <Box marginTop={1}>
          <Spinner label="Generating remediation..." interval={120} />
        </Box>
      )}

      {isError && (
        <Box marginTop={1} flexDirection="column">
          <Text color="red">✗ {remediationError ?? remediation?.error_message ?? 'Remediation failed'}</Text>
          <Text dimColor>This may be a quota limit — check your Plexicus plan.</Text>
        </Box>
      )}

      {isReady && diffLines.length === 0 && (
        <Box marginTop={1}>
          <Text color="yellow">No diff available for this remediation</Text>
        </Box>
      )}

      {isReady && diffLines.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {visibleLines.map((line, i) => {
            const content = expandTabs(line.content)
            switch (line.type) {
              case 'add':
                return <Text key={i} color="green">+{content}</Text>
              case 'remove':
                return <Text key={i} color="red">-{content}</Text>
              case 'header':
                return <Text key={i} color="cyan">{content}</Text>
              case 'context':
                return <Text key={i} dimColor> {content}</Text>
            }
          })}
        </Box>
      )}

      <Box marginTop={1} paddingX={1}>
        {isReady
          ? <Text dimColor>{diffLines.length > VISIBLE_LINES ? '↑↓/jk=scroll  ' : ''}p=create PR  Esc=close</Text>
          : isError
            ? <Text dimColor>Esc=close</Text>
            : <Text dimColor>Esc=cancel</Text>
        }
      </Box>
    </Box>
  )
}
