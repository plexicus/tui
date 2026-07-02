import React, { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { Finding, Repository, Remediation, Panel, InputMode, SessionUser, StatusJob, Screen } from '../types.js'
import type { Action, FindingsFilter } from './actions.js'

export interface AppState {
  isAuthenticated: boolean
  user: SessionUser | null
  token: string | null
  findings: Finding[]
  selectedFindingId: string | null
  findingsLoading: boolean
  findingsFilter: FindingsFilter
  findingsPage: number
  findingsTotal: number
  findingsPageCount: number
  repos: Repository[]
  reposLoading: boolean
  remediations: Record<string, Remediation>
  activePanel: Panel
  inputMode: InputMode
  fuzzyOpen: boolean
  filterOpen: boolean
  scmFlowOpen: boolean
  activeStatusJob: StatusJob | null
  wsConnected: boolean
  theme: 'dark' | 'light' | 'plexicus'
  error: string | null
  notification: string | null
  screen: Screen
  screenStack: Screen[]
  selectedRepoId: string | null
}

const initialState: AppState = {
  isAuthenticated: false,
  user: null,
  token: null,
  findings: [],
  selectedFindingId: null,
  findingsLoading: false,
  findingsFilter: {},
  findingsPage: 0,
  findingsTotal: 0,
  findingsPageCount: 1,
  repos: [],
  reposLoading: false,
  remediations: {},
  activePanel: 'repos',
  inputMode: 'navigation',
  fuzzyOpen: false,
  filterOpen: false,
  scmFlowOpen: false,
  activeStatusJob: null,
  wsConnected: false,
  theme: 'plexicus',
  error: null,
  notification: null,
  screen: 'repos',
  screenStack: ['repos'],
  selectedRepoId: null,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'auth/set':
      return { ...state, isAuthenticated: true, user: action.payload.user, token: action.payload.token, error: null }

    case 'auth/clear':
      return { ...state, isAuthenticated: false, user: null, token: null }

    case 'findings/set':
      return { ...state, findings: action.payload, findingsLoading: false }

    case 'findings/loading':
      return { ...state, findingsLoading: action.payload }

    case 'findings/select':
      return { ...state, selectedFindingId: action.payload }

    case 'findings/filter':
      return { ...state, findingsFilter: action.payload, findingsPage: 0 }

    case 'findings/update': {
      const updated = state.findings.map(f => f.id === action.payload.id ? action.payload : f)
      return { ...state, findings: updated }
    }

    case 'findings/setPage':
      return { ...state, findingsPage: action.payload }

    case 'findings/setPagination':
      return { ...state, findingsTotal: action.payload.total, findingsPageCount: action.payload.pageCount }

    case 'repos/set':
      return { ...state, repos: action.payload, reposLoading: false }

    case 'repos/loading':
      return { ...state, reposLoading: action.payload }

    case 'remediation/set':
      return {
        ...state,
        remediations: { ...state.remediations, [action.payload.finding_id]: action.payload },
      }

    case 'ui/setPanel':
      return { ...state, activePanel: action.payload }

    case 'ui/setTheme':
      return { ...state, theme: action.payload }

    case 'ui/setError':
      return { ...state, error: action.payload }

    case 'ui/setNotification':
      return { ...state, notification: action.payload }

    case 'ui/setInputMode':
      return { ...state, inputMode: action.payload }

    case 'ui/setFuzzyOpen':
      return { ...state, fuzzyOpen: action.payload, inputMode: action.payload ? 'repl' : 'navigation' }

    case 'filter/open':
      return { ...state, filterOpen: true, inputMode: 'filter' }

    case 'filter/close':
      return { ...state, filterOpen: false, inputMode: 'navigation' }

    case 'scm/open':
      return { ...state, scmFlowOpen: true, inputMode: 'scm' }

    case 'scm/close':
      return { ...state, scmFlowOpen: false, inputMode: 'navigation' }

    case 'status/open':
      return { ...state, activeStatusJob: action.payload }

    case 'status/update': {
      if (!state.activeStatusJob || state.activeStatusJob.id !== action.payload.id) return state
      const { logs: newLogs, ...rest } = action.payload
      const mergedLogs = newLogs?.length
        ? [...state.activeStatusJob.logs, ...newLogs].slice(-200)
        : state.activeStatusJob.logs
      return { ...state, activeStatusJob: { ...state.activeStatusJob, ...rest, logs: mergedLogs } }
    }

    case 'status/close':
      return { ...state, activeStatusJob: null }

    case 'ws/setConnected':
      return { ...state, wsConnected: action.payload }

    case 'nav/pushScreen': {
      const newStack = [...state.screenStack, action.payload]
      const panel: Panel = action.payload === 'repos' ? 'repos' : 'findings'
      return { ...state, screen: action.payload, screenStack: newStack, activePanel: panel }
    }

    case 'nav/popScreen': {
      if (state.screenStack.length <= 1) return state
      const newStack = state.screenStack.slice(0, -1)
      const prev = newStack[newStack.length - 1]
      const panel: Panel = prev === 'repos' ? 'repos' : 'findings'
      return { ...state, screen: prev, screenStack: newStack, activePanel: panel }
    }

    case 'repo/select':
      return { ...state, selectedRepoId: action.payload }

    default:
      return state
  }
}

interface AppStateContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const AppStateContext = createContext<AppStateContextValue | null>(null)

interface AppStateProviderProps {
  children: ReactNode
  initialTheme?: 'dark' | 'light' | 'plexicus'
}

export function AppStateProvider({ children, initialTheme = 'plexicus' }: AppStateProviderProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    theme: initialTheme,
  })

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
