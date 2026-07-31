import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'

function ProgressBar({ percent, width = 30 }: { percent: number; width?: number }) {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * width)
  const empty = width - filled
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text> {String(Math.round(percent)).padStart(3)}%</Text>
    </Text>
  )
}

export function StatusModal() {
  const { state, dispatch } = useAppState()
  const ac = accent(state.theme)
  const job = state.activeStatusJob

  useInput((_, key) => {
    if (key.escape) {
      dispatch({ type: 'status/close' })
    }
  }, { isActive: !!job && state.inputMode === 'navigation' })

  if (!job) return null

  const title = job.type === 'repo' ? `Scanning: ${job.name}` : `Remediating: ${job.name}`
  const isDone = job.status === 'done' || job.status === 'ready' || job.progress >= 100
  const visibleLogs = job.logs.slice(-8)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={ac}
      paddingX={1}
      marginTop={1}
    >
      <Box>
        <Text bold color={ac}>{title}</Text>
        {isDone && <Text color="green"> ✓ Done</Text>}
      </Box>

      <Box marginTop={1}>
        <ProgressBar percent={job.progress} width={36} />
        {job.status && !isDone && (
          <Text dimColor>  {job.status}</Text>
        )}
      </Box>

      {visibleLogs.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {visibleLogs.map((line, i) => (
            <Text key={i} dimColor wrap="truncate">{line}</Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc=dismiss (continues in background)</Text>
      </Box>
    </Box>
  )
}
