import React, { useState, useCallback, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { SmartTextInput as TextInput } from './design-system/SmartTextInput.js'
import { useAppState } from '../state/AppState.js'
import { accent } from '../utils/theme.js'
import { createApiClient } from '../services/apiClient.js'
import { loadConfig } from '../services/config.js'
import { friendlyError } from '../utils/errors.js'
import { Spinner } from './design-system/Spinner.js'
import type { ScmProvider, ScmRepo } from '../types.js'
import { guessProvider } from '../utils/scm.js'

type FlowStep =
  | 'pick-provider'
  | 'loading-repos'
  | 'manual-url'
  | 'pick-repos'
  | 'importing'
  | 'done'
  | 'error'

const PROVIDERS: { id: ScmProvider; label: string }[] = [
  { id: 'github',    label: 'GitHub' },
  { id: 'gitlab',    label: 'GitLab' },
  { id: 'bitbucket', label: 'Bitbucket Cloud' },
  { id: 'gitea',     label: 'Gitea' },
  { id: 'forgejo',   label: 'Forgejo' },
  { id: 'azure_devops', label: 'Azure DevOps' },
]

export function SCMConnectFlow({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAppState()
  const ac = accent(state.theme)

  const [step, setStep] = useState<FlowStep>('pick-provider')
  const [cursor, setCursor] = useState(0)
  const [provider, setProvider] = useState<ScmProvider>('github')
  const [errorMsg, setErrorMsg] = useState('')

  const [validity, setValidity] = useState<Record<string, boolean>>({})
  const [validityLoading, setValidityLoading] = useState(true)
  const [webUrl, setWebUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const config = await loadConfig()
        setWebUrl(config.webUrl ?? null)
        const api = await createApiClient(state.token)
        const v = await api.checkScmValidity()
        if (!cancelled) setValidity(v)
      } catch {
        // show providers as unconnected
      } finally {
        if (!cancelled) setValidityLoading(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [state.token])

  // repo picker
  const [repos, setRepos] = useState<ScmRepo[]>([])
  const [repoQuery, setRepoQuery] = useState('')
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set())
  const [importedCount, setImportedCount] = useState(0)

  // manual url form
  const [manualRepoUrl, setManualRepoUrl] = useState('')
  const [manualNickname, setManualNickname] = useState('')
  const [manualField, setManualField] = useState<'url' | 'nickname'>('url')

  const goBack = useCallback(() => {
    setStep('pick-provider')
    setRepos([])
    setSelectedRepoIds(new Set())
  }, [])

  const fetchRepos = useCallback(async (prov: ScmProvider) => {
    setStep('loading-repos')
    try {
      const api = await createApiClient(state.token)
      const scmRepos = await api.getScmRepos(prov)
      setRepos(scmRepos)
      setCursor(0)
      setStep('pick-repos')
    } catch (err) {
      setErrorMsg(friendlyError(err, 'Failed to load repositories'))
      setStep('error')
    }
  }, [state.token])

  const connectManual = useCallback(async () => {
    const url = manualRepoUrl.trim()
    if (!url) return
    const nickname = manualNickname.trim() || url.split('/').filter(Boolean).pop() || url
    setStep('importing')
    try {
      const api = await createApiClient(state.token)
      const repo = { id: nickname, name: nickname, full_name: nickname, html_url: url }
      await api.importRepositories([repo], guessProvider(url))
      setImportedCount(1)
      setStep('done')
    } catch (err) {
      setErrorMsg(friendlyError(err, 'Import failed'))
      setStep('error')
    }
  }, [manualRepoUrl, manualNickname, state.token])

  const importSelected = useCallback(async () => {
    const toImport = repos.filter(r => selectedRepoIds.has(r.id))
    if (toImport.length === 0) return
    setStep('importing')
    try {
      const api = await createApiClient(state.token)
      await api.importRepositories(toImport, provider)
      setImportedCount(toImport.length)
      setStep('done')
    } catch (err) {
      setErrorMsg(friendlyError(err, 'Import failed'))
      setStep('error')
    }
  }, [repos, selectedRepoIds, provider, state.token])

  const filteredRepos = repoQuery
    ? repos.filter(r => r.full_name.toLowerCase().includes(repoQuery.toLowerCase()))
    : repos
  const REPO_VISIBLE = 12
  const repoWindowStart = Math.max(0, cursor - Math.floor(REPO_VISIBLE / 2))
  const visibleRepos = filteredRepos.slice(repoWindowStart, repoWindowStart + REPO_VISIBLE)

  const selectedProvider = PROVIDERS[cursor]
  const selectedConnected = selectedProvider ? !!validity[selectedProvider.id] : false
  const configureUrl = webUrl
    ? `${webUrl}/connector`
    : 'the Plexicus web app → Integrations'

  useInput((input, key) => {
    if (state.inputMode !== 'scm') return

    if (key.escape) {
      if (step === 'pick-provider') {
        dispatch({ type: 'scm/close' })
        onClose()
      } else {
        goBack()
      }
      return
    }

    if (step === 'pick-provider' && !validityLoading) {
      if (input === 'm') {
        setStep('manual-url'); setManualRepoUrl(''); setManualNickname(''); setManualField('url')
        return
      }
      if (input === 'j' || key.downArrow) { setCursor(c => Math.min(c + 1, PROVIDERS.length - 1)); return }
      if (input === 'k' || key.upArrow) { setCursor(c => Math.max(c - 1, 0)); return }
      if (key.return) {
        const prov = PROVIDERS[cursor]!
        if (!validity[prov.id]) return  // not connected — block selection
        setProvider(prov.id)
        fetchRepos(prov.id)
        return
      }
    }

    if (step === 'pick-repos') {
      if (key.backspace || key.delete) {
        setRepoQuery(q => q.slice(0, -1))
        setCursor(0)
        return
      }
      if (input === 'j' || key.downArrow) { setCursor(c => Math.min(c + 1, filteredRepos.length - 1)); return }
      if (input === 'k' || key.upArrow) { setCursor(c => Math.max(c - 1, 0)); return }
      if (input === ' ') {
        const repo = filteredRepos[cursor]
        if (repo) {
          setSelectedRepoIds(prev => {
            const next = new Set(prev)
            next.has(repo.id) ? next.delete(repo.id) : next.add(repo.id)
            return next
          })
        }
        return
      }
      if (key.return) { importSelected(); return }
      if (!key.ctrl && !key.meta && input && input.length === 1) {
        setRepoQuery(q => q + input)
        setCursor(0)
        return
      }
    }

    if (step === 'error') {
      if (input === 'm') {
        setStep('manual-url'); setManualRepoUrl(''); setManualNickname(''); setManualField('url')
        return
      }
      if (key.return || key.escape) { dispatch({ type: 'scm/close' }); onClose() }
      return
    }

    if (step === 'done') {
      if (key.return || key.escape) { dispatch({ type: 'scm/close' }); onClose() }
      return
    }
  })

  return (
    <Box flexDirection="column" borderStyle="bold" borderColor={ac} paddingX={1} marginTop={1}>
      <Text bold color={ac}>Add Repositories</Text>

      {step === 'pick-provider' && (
        <Box flexDirection="column" marginTop={1}>
          {validityLoading ? (
            <Box><Spinner interval={100} /><Text dimColor> Checking connections...</Text></Box>
          ) : (
            <>
              <Text dimColor>Select a connected provider:</Text>
              {PROVIDERS.map((p, i) => {
                const connected = !!validity[p.id]
                return (
                  <Text key={p.id} dimColor={!connected} inverse={i === cursor && connected}>
                    {i === cursor ? '▶ ' : '  '}
                    {p.label}
                    {connected
                      ? <Text color="green">  ✓ connected</Text>
                      : <Text dimColor>  — not connected</Text>
                    }
                  </Text>
                )
              })}

              {!selectedConnected && selectedProvider && (
                <Box marginTop={1} flexDirection="column">
                  <Text color="yellow">
                    {selectedProvider.label} is not connected.
                  </Text>
                  <Text dimColor>Enable it at: <Text color="cyan">{configureUrl}</Text></Text>
                </Box>
              )}

              <Box marginTop={1}>
                <Text dimColor>↑↓=navigate  Enter=select (connected only)  m=manual URL  Esc=cancel</Text>
              </Box>
            </>
          )}
        </Box>
      )}

      {step === 'loading-repos' && (
        <Box marginTop={1}>
          <Spinner label="Loading repositories..." interval={120} />
        </Box>
      )}

      {step === 'pick-repos' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Select repositories to import ({selectedRepoIds.size} selected):</Text>
          <Box>
            <Text dimColor>/ </Text>
            <Text>{repoQuery}<Text inverse> </Text>{!repoQuery && <Text dimColor>filter repos...</Text>}</Text>
          </Box>
          {visibleRepos.map((repo, i) => {
            const absIdx = repoWindowStart + i
            const selected = selectedRepoIds.has(repo.id)
            return (
              <Text key={repo.id} inverse={absIdx === cursor}>
                {absIdx === cursor ? '▶ ' : '  '}
                <Text color={selected ? 'green' : undefined}>{selected ? '✓ ' : '  '}</Text>
                {repo.full_name}
                {repo.private && <Text dimColor> (private)</Text>}
              </Text>
            )
          })}
          <Text dimColor>{filteredRepos.length}/{repos.length} repos</Text>
          <Box marginTop={1}><Text dimColor>↑↓=navigate  Space=toggle  Enter=import selected  Esc=back</Text></Box>
        </Box>
      )}

      {step === 'importing' && (
        <Box marginTop={1}>
          <Spinner label={`Importing ${selectedRepoIds.size} repositories...`} interval={120} />
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green">✓ {importedCount} repositories imported successfully</Text>
          <Text dimColor>Press Enter or Esc to close</Text>
        </Box>
      )}

      {step === 'manual-url' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Enter the repository URL and a nickname:</Text>
          <Box marginTop={1}>
            <Text dimColor>URL:  </Text>
            <TextInput
              value={manualRepoUrl}
              onChange={setManualRepoUrl}
              onSubmit={() => setManualField('nickname')}
              placeholder="https://github.com/org/repo"
              focus={manualField === 'url'}
            />
          </Box>
          <Box>
            <Text dimColor>Name: </Text>
            <TextInput
              value={manualNickname}
              onChange={setManualNickname}
              onSubmit={connectManual}
              placeholder="my-repo (optional)"
              focus={manualField === 'nickname'}
            />
          </Box>
          <Box marginTop={1}><Text dimColor>Enter to advance  Enter on name to import  Esc=back</Text></Box>
        </Box>
      )}

      {step === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">✗ {errorMsg}</Text>
          <Box marginTop={1}>
            <Text dimColor>m=add repo manually  Esc=close</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
