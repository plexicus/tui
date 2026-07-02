import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { AppStateProvider, useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'
import { KeybindingsHelp } from './design-system/KeybindingsHelp.js'
import { FindingsPanel } from './FindingsPanel.js'
import { ReposPanel } from './ReposPanel.js'
import { FindingDetailScreen } from './FindingDetailScreen.js'
import { FilterModal } from './FilterModal.js'
import { StatusModal } from './StatusModal.js'
import { LoginForm } from './LoginForm.js'
import { FirstRunWizard } from './FirstRunWizard.js'
import { findCommand } from '../commands.js'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { filterCommands } from '../utils/replCommands.js'
import type { Config } from '../services/config.js'

interface AppProps {
  repo?: string
  cve?: string
  token?: string
  config?: Config
}

function AuthGate({
  token,
  config,
  children,
}: {
  token?: string
  config?: Config
  children: React.ReactNode
}) {
  const { state } = useAppState()
  const [needsFirstRun, setNeedsFirstRun] = useState(
    !config?.serverUrl || config.serverUrl === '',
  )

  if (needsFirstRun) {
    return <FirstRunWizard onComplete={() => setNeedsFirstRun(false)} />
  }

  if (!state.isAuthenticated) {
    return <LoginForm prefilledToken={token ?? process.env.PLEXICUS_TOKEN} />
  }

  return <>{children}</>
}

function AppShell(props: AppProps) {
  const { state, dispatch } = useAppState()
  useWebSocket(props.config ?? { serverUrl: 'https://api.app.plexicus.ai', theme: 'plexicus' })
  const { exit } = useApp()
  const [replInput, setReplInput] = useState('')
  const [replOutput, setReplOutput] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const commandHistory = useRef<string[]>([])
  const historyIndex = useRef(-1)
  const replInputRef = useRef('')
  replInputRef.current = replInput
  const stateRef = useRef(state)
  stateRef.current = state

  const [replDropdownIndex, setReplDropdownIndex] = useState(0)
  const replDropdownIndexRef = useRef(0)
  replDropdownIndexRef.current = replDropdownIndex

  useEffect(() => { setReplDropdownIndex(0) }, [replInput])

  useEffect(() => {
    if (!state.notification) return
    const t = setTimeout(() => dispatch({ type: 'ui/setNotification', payload: null }), 5000)
    return () => clearTimeout(t)
  }, [state.notification])

  const dropdownItems = (state.inputMode === 'repl' && !state.fuzzyOpen && !replInput.includes(' '))
    ? filterCommands(replInput)
    : []
  const dropdownVisible = dropdownItems.length > 0

  // Breadcrumb
  const selectedRepo = state.selectedRepoId
    ? state.repos.find(r => r.id === state.selectedRepoId)
    : null
  const selectedFinding = state.selectedFindingId
    ? state.findings.find(f => f.id === state.selectedFindingId)
    : null

  const ac = accent(state.theme)

  useInput((input, key) => {
    if (showHelp) {
      setShowHelp(false)
      return
    }

    if (state.inputMode === 'filter') return
    if (state.inputMode === 'scm') return

    if (input === '?' && state.inputMode === 'navigation') {
      setShowHelp(true)
      return
    }

    if (state.inputMode === 'navigation') {
      if (input === 'F' && state.screen === 'findings') {
        dispatch({ type: 'filter/open' })
        return
      }
      if (input === '/') {
        if (state.screen === 'findings') {
          dispatch({ type: 'ui/setFuzzyOpen', payload: true })
        } else if (state.screen === 'repos') {
          dispatch({ type: 'ui/setFuzzyOpen', payload: true })
        }
        return
      }
      if (input === ':') {
        setReplInput('')
        dispatch({ type: 'ui/setInputMode', payload: 'repl' })
        return
      }
      if (key.ctrl && input === 'c') {
        exit()
        return
      }
    }

    if (state.inputMode === 'repl' && !state.fuzzyOpen) {
      if (key.escape) {
        setReplInput('')
        setReplOutput(null)
        dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
        return
      }
      if (key.upArrow) {
        const items = filterCommands(replInputRef.current)
        if (!replInputRef.current.includes(' ') && items.length > 0) {
          setReplDropdownIndex(prev => (prev <= 0 ? items.length - 1 : prev - 1))
        } else {
          const h = commandHistory.current
          if (h.length > 0) {
            const newIdx = Math.min(historyIndex.current + 1, h.length - 1)
            historyIndex.current = newIdx
            setReplInput(h[h.length - 1 - newIdx])
          }
        }
        return
      }
      if (key.downArrow) {
        const items = filterCommands(replInputRef.current)
        if (!replInputRef.current.includes(' ') && items.length > 0) {
          setReplDropdownIndex(prev => (prev >= items.length - 1 ? 0 : prev + 1))
        } else {
          const newIdx = Math.max(historyIndex.current - 1, -1)
          historyIndex.current = newIdx
          setReplInput(
            newIdx === -1
              ? ''
              : commandHistory.current[commandHistory.current.length - 1 - newIdx],
          )
        }
        return
      }
      if (key.tab) {
        const items = filterCommands(replInputRef.current)
        if (!replInputRef.current.includes(' ') && items.length > 0) {
          const idx = replDropdownIndexRef.current
          const selected = items[Math.min(idx, items.length - 1)]
          setReplInput(selected.name + ' ')
        }
        return
      }
      if (key.ctrl && input === 'u') {
        setReplInput('')
        return
      }
      if (key.ctrl && input === 'w') {
        setReplInput(prev => {
          const trimmed = prev.trimEnd()
          const lastSpace = trimmed.lastIndexOf(' ')
          return lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : ''
        })
        return
      }
      if (key.ctrl && input === 'k') {
        setReplInput('')
        return
      }
      if (key.backspace || key.delete) {
        setReplInput(prev => prev.slice(0, -1))
        return
      }
      if (key.return) {
        const current = replInputRef.current
        setReplInput('')
        handleReplSubmit(current)
        return
      }
      if (!key.ctrl && !key.meta && input) {
        // Accept pasted multi-char chunks, not just single keystrokes
        const clean = [...input].filter(ch => {
          const code = ch.charCodeAt(0)
          return code >= 32 && code !== 127
        }).join('')
        if (clean) setReplInput(prev => prev + clean)
        return
      }
    }
  })

  const handleReplSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
        return
      }

      commandHistory.current = [...commandHistory.current.slice(-19), trimmed]
      historyIndex.current = -1
      setReplInput('')

      const parts = trimmed.startsWith('/')
        ? trimmed.slice(1).split(/\s+/)
        : trimmed.split(/\s+/)
      const cmdName = parts[0]
      const args = parts.slice(1)

      try {
        if (cmdName === 'theme') {
          const theme = args[0] as 'dark' | 'light' | 'plexicus'
          if (theme === 'dark' || theme === 'light' || theme === 'plexicus') {
            dispatch({ type: 'ui/setTheme', payload: theme })
            setReplOutput(`Theme set to ${theme}`)
          } else {
            setReplOutput('Usage: :theme <dark|light|plexicus>')
          }
          dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
          return
        }

        if (cmdName === 'filter') {
          dispatch({ type: 'filter/open' })
          return
        }

        if (cmdName === 'scan') {
          const repoId = stateRef.current.selectedRepoId
          if (!repoId) {
            setReplOutput('No repo selected — navigate into a repo first')
            dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
            return
          }
          try {
            const { loadConfig } = await import('../services/config.js')
            const { PlexicusApi } = await import('../services/plexicusApi.js')
            const config = await loadConfig()
            const api = new PlexicusApi({ baseUrl: config.serverUrl, token: stateRef.current.token ?? config.token })
            const repo = stateRef.current.repos.find(r => r.id === repoId)
            await api.requestScan(repoId)
            dispatch({
              type: 'status/open',
              payload: { type: 'repo', id: repoId, name: repo?.nickname ?? repoId, status: 'pending', progress: 0, logs: [] },
            })
          } catch (err) {
            setReplOutput(err instanceof Error ? err.message : 'Scan request failed')
          }
          dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
          return
        }

        if (cmdName === '?' || cmdName === 'help') {
          dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
          setShowHelp(true)
          return
        }

        // Try registered commands
        const cmd = await findCommand(cmdName)
        if (cmd && cmd.type === 'local') {
          const result = await cmd.call(args, { state: stateRef.current, dispatch })
          if (result) setReplOutput(result)
          dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
          return
        }

        setReplOutput(`Unknown command: ${cmdName} — type :help for available commands`)
        dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
      } catch (err) {
        setReplOutput(err instanceof Error ? err.message : 'Command failed')
        dispatch({ type: 'ui/setInputMode', payload: 'navigation' })
      }
    },
    [dispatch, setShowHelp],
  )

  const { sort_by: _sb, sort_dir: _sd, ...filterRest } = state.findingsFilter
  const hasFilter = Object.values(filterRest as Record<string, unknown>).some(v => {
    if (Array.isArray(v)) return v.length > 0
    return v !== undefined && v !== null && v !== false
  })

  return (
    <Box flexDirection="column" height="100%">
      {/* Breadcrumb header */}
      <Box borderStyle="bold" borderColor={ac} paddingX={1}>
        <Text color={ac} bold>Plexicus</Text>
        {state.screen !== 'repos' && (
          <>
            <Text dimColor> › </Text>
            <Text color={state.screen === 'findings' ? ac : undefined} bold={state.screen === 'findings'}>
              {selectedRepo ? selectedRepo.nickname : 'All Repos'}
            </Text>
          </>
        )}
        {state.screen === 'detail' && (
          <>
            <Text dimColor> › </Text>
            <Text color={ac} bold>
              {selectedFinding ? selectedFinding.title.slice(0, 50) : 'Finding'}
            </Text>
          </>
        )}
        {hasFilter && state.screen === 'findings' && <Text color={ac}>  ● filter</Text>}
        {state.findingsTotal > 0 && state.screen === 'findings' && (
          <Text dimColor>  {state.findingsTotal} findings · pg {state.findingsPage + 1}/{state.findingsPageCount}</Text>
        )}
        {state.error && <Text color="red">  ✗ {state.error}</Text>}
      </Box>

      {/* Main content: current screen (or modal overlay) */}
      <Box flexGrow={1} flexDirection="column">
        {state.filterOpen
          ? <FilterModal />
          : <>
              {state.screen === 'repos' && <ReposPanel />}
              {state.screen === 'findings' && <FindingsPanel repo={props.repo} cve={props.cve} />}
              {state.screen === 'detail' && <FindingDetailScreen />}
            </>
        }
      </Box>

      {/* Modals rendered outside flex-grow (status uses its own layout) */}
      {state.activeStatusJob && <StatusModal />}

      {/* REPL output */}
      {replOutput && (
        <Box paddingX={1}>
          <Text color="yellow">{replOutput}</Text>
        </Box>
      )}

      {/* Autocomplete dropdown */}
      {dropdownVisible && (
        <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
          {dropdownItems.map((cmd, i) => {
            const selected = i === replDropdownIndex
            return (
              <Box key={cmd.name} marginRight={2}>
                <Text color={selected ? ac : undefined} bold={selected} inverse={selected}>
                  {selected ? `:${cmd.template}` : `:${cmd.name}`}
                </Text>
                {selected && <Text dimColor>  {cmd.description}</Text>}
              </Box>
            )
          })}
        </Box>
      )}

      {/* Notification bar (PR created, etc.) */}
      {state.notification && (
        <Box paddingX={1} borderStyle="single" borderColor="green">
          <Text color="green">✓ </Text>
          <Text>{state.notification}</Text>
        </Box>
      )}

      {/* REPL bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color={ac}>&gt; </Text>
        {state.inputMode === 'repl' && !state.fuzzyOpen ? (
          replInput
            ? <Text>{replInput}<Text inverse> </Text></Text>
            : dropdownVisible
              ? <Text><Text inverse> </Text></Text>
              : <Text dimColor>:command or ask AI…<Text inverse> </Text></Text>
        ) : (
          <Text dimColor>{replInput || (
            state.screen === 'findings'
              ? 'Press : for commands, / to search, F to filter'
              : state.screen === 'detail'
                ? 'Press : for commands'
                : 'Press : for commands, / to search'
          )}</Text>
        )}
      </Box>

      {showHelp && <KeybindingsHelp onDismiss={() => setShowHelp(false)} accentColor={ac} />}
    </Box>
  )
}

export default function App(props: AppProps) {
  const initialTheme = props.config?.theme ?? 'plexicus'
  return (
    <AppStateProvider initialTheme={initialTheme}>
      <AuthGate token={props.token} config={props.config}>
        <AppShell {...props} />
      </AuthGate>
    </AppStateProvider>
  )
}
