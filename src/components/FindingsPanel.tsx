import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text } from 'ink'
import { useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'
import { useKeymap } from '../hooks/useKeymap.js'
import { useFindings } from '../hooks/useFindings.js'
import { Spinner } from './design-system/Spinner.js'
import { FuzzyPicker } from './design-system/FuzzyPicker.js'
import { severityColor } from '../utils/severity.js'
import { useFindingActions } from '../hooks/useFindingActions.js'
import type { Finding } from '../types.js'
import type { FindingsFilter } from '../state/actions.js'

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function isFilterActive(filter: FindingsFilter): boolean {
  const { sort_by, sort_dir, ...rest } = filter
  return Object.values(rest as Record<string, unknown>).some(v => {
    if (Array.isArray(v)) return v.length > 0
    return v !== undefined && v !== null && v !== false
  })
}

interface FindingsPanelProps {
  repo?: string
  cve?: string
}

export function FindingsPanel({ repo, cve }: FindingsPanelProps) {
  const { state, dispatch } = useAppState()
  const ac = accent(state.theme)
  const { findings, loading } = useFindings({ cve })
  const [cursorIndex, setCursorIndex] = useState(0)

  const hasFilter = isFilterActive(state.findingsFilter)

  useEffect(() => {
    setCursorIndex(0)
  }, [state.findingsPage, state.findingsFilter])

  const handleDown = useCallback(() => {
    setCursorIndex(i => Math.min(i + 1, findings.length - 1))
  }, [findings.length])

  const handleUp = useCallback(() => {
    setCursorIndex(i => Math.max(i - 1, 0))
  }, [])

  const handleGG = useCallback(() => {
    setCursorIndex(0)
  }, [])

  const handleShiftG = useCallback(() => {
    setCursorIndex(Math.max(0, findings.length - 1))
  }, [findings.length])

  const handleSelect = useCallback(() => {
    const finding = findings[cursorIndex]
    if (!finding) return
    dispatch({ type: 'findings/select', payload: finding.id })
    dispatch({ type: 'nav/pushScreen', payload: 'detail' })
  }, [findings, cursorIndex, dispatch])

  const handleEscape = useCallback(() => {
    dispatch({ type: 'nav/popScreen' })
  }, [dispatch])

  const { suppress, toggleFalsePositive } = useFindingActions()

  const handleSuppress = useCallback(() => {
    const finding = findings[cursorIndex]
    if (finding) suppress(finding)
  }, [findings, cursorIndex, suppress])

  const handleFalsePositive = useCallback(() => {
    const finding = findings[cursorIndex]
    if (finding) toggleFalsePositive(finding)
  }, [findings, cursorIndex, toggleFalsePositive])

  useKeymap(
    {
      onDown: handleDown,
      onUp: handleUp,
      onGG: handleGG,
      onShiftG: handleShiftG,
      onSelect: handleSelect,
      onEscape: handleEscape,
      onSuppress: handleSuppress,
      onFalsePositive: handleFalsePositive,
      onNextPage: () => {
        if (state.findingsPage < state.findingsPageCount - 1) {
          dispatch({ type: 'findings/setPage', payload: state.findingsPage + 1 })
        }
      },
      onPrevPage: () => {
        if (state.findingsPage > 0) {
          dispatch({ type: 'findings/setPage', payload: state.findingsPage - 1 })
        }
      },
    },
    { inputMode: state.inputMode, isActive: state.screen === 'findings' },
  )

  if (state.fuzzyOpen && state.screen === 'findings') {
    return (
      <FuzzyPicker
        items={findings}
        getLabel={(f: Finding) => `${f.title} (${f.repo_nickname ?? f.repo_id})`}
        onSelect={f => {
          dispatch({ type: 'findings/select', payload: f.id })
          dispatch({ type: 'ui/setFuzzyOpen', payload: false })
          dispatch({ type: 'nav/pushScreen', payload: 'detail' })
        }}
        onCancel={() => dispatch({ type: 'ui/setFuzzyOpen', payload: false })}
        placeholder="Search findings..."
        accentColor={ac}
      />
    )
  }

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Spinner label="Loading findings..." />
      </Box>
    )
  }

  if (findings.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No findings matching current filter</Text>
        <Text dimColor>
          Filter: {state.findingsFilter.severities?.join(', ') ?? 'all'}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Column headers */}
      <Box paddingX={1}>
        <Box flexGrow={1}>
          <Text bold dimColor>Title</Text>
          {hasFilter && <Text color={ac}> ●</Text>}
        </Box>
        <Box width={6}><Text bold dimColor>Prio</Text></Box>
        <Box width={4}><Text bold dimColor>Sev</Text></Box>
        <Box width={14}><Text bold dimColor>Repo</Text></Box>
        <Box width={11}><Text bold dimColor>Date</Text></Box>
      </Box>

      {findings.map((finding, i) => {
        const isSelected = i === cursorIndex
        const color = severityColor(finding.severity)
        const repoDisplay = finding.repo_nickname ?? finding.repo_id
        const prio = finding.prioritization_value
        const sevLetter = finding.severity[0].toUpperCase()

        return (
          <Box key={finding.id} paddingX={1}>
            <Box flexGrow={1}>
              <Text inverse={isSelected}>
                {truncate(finding.cve ? `${finding.cve} ${finding.title}` : finding.title, 45)}
              </Text>
            </Box>
            <Box width={6}>
              {prio !== null ? (
                <Text
                  color={prio >= 80 ? 'red' : prio >= 50 ? 'yellow' : undefined}
                  inverse={isSelected}
                  bold={isSelected}
                >
                  {String(prio).padStart(3) + ' '}
                </Text>
              ) : (
                <Text dimColor inverse={isSelected}>{'  — '}</Text>
              )}
            </Box>
            <Box width={4}>
              <Text color={color} bold> {sevLetter} </Text>
            </Box>
            <Box width={14}>
              <Text dimColor={!isSelected} inverse={isSelected}>{truncate(repoDisplay, 13)}</Text>
            </Box>
            <Box width={11}>
              <Text dimColor={!isSelected} inverse={isSelected}>{finding.date.slice(0, 10)}</Text>
            </Box>
          </Box>
        )
      })}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>Enter=detail  s=suppress  f=fp  F=filter  /=search  ?=help  Esc=back</Text>
        {state.findingsPageCount > 1 && (
          <Text dimColor>  ]=next  [=prev</Text>
        )}
      </Box>
    </Box>
  )
}
