import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { SmartTextInput as TextInput } from './design-system/SmartTextInput.js'
import { useAppState } from '../state/AppState.js'
import { PlexicusApi } from '../services/plexicusApi.js'
import { loadConfig, saveConfig } from '../services/config.js'

type LoginStep = 'email' | 'password' | 'otp' | 'loading' | 'done'

interface LoginFormProps {
  prefilledToken?: string  // from --token flag
  onDone?: (email: string) => void  // login subcommand: print + exit
}

export function LoginForm({ prefilledToken, onDone }: LoginFormProps) {
  const { dispatch } = useAppState()
  const [step, setStep] = useState<LoginStep>(prefilledToken ? 'loading' : 'email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [registerUrl, setRegisterUrl] = useState<string | null>(null)

  const openRegistration = useCallback(async () => {
    try {
      const config = await loadConfig()
      const webUrl = config.webUrl ?? config.serverUrl.replace(/^(https?:\/\/)api\./, '$1')
      const url = `${webUrl}/register`
      setRegisterUrl(url)
      try {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
        await Bun.$`${cmd} ${url}`.quiet()
      } catch {
        // URL is already shown — user can click it
      }
    } catch {
      // ignore
    }
  }, [])

  useInput((input) => {
    if (step === 'email' && input === 'r') {
      openRegistration()
    }
  })

  React.useEffect(() => {
    if (!prefilledToken) return
    async function storeToken() {
      try {
        const config = await loadConfig()
        const api = new PlexicusApi({ baseUrl: config.serverUrl, token: prefilledToken })
        const user = await api.getSession()
        await saveConfig({ ...config, token: prefilledToken! })
        dispatch({ type: 'auth/set', payload: { user, token: prefilledToken! } })
        setStep('done')
        onDone?.(user.email)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid token')
        setStep('email')
      }
    }
    storeToken()
  }, [prefilledToken])

  const handleEmailSubmit = useCallback((value: string) => {
    if (!value.trim()) return
    setEmail(value.trim())
    setStep('password')
    setError(null)
  }, [])

  const handlePasswordSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return
    setPassword(value.trim())
    setStep('loading')
    setError(null)

    try {
      const config = await loadConfig()
      const api = new PlexicusApi({ baseUrl: config.serverUrl })
      const response = await api.login(email, value.trim())

      if (response.kind === '2fa') {
        setStep('otp')
        return
      }

      const sessionUser = await new PlexicusApi({ baseUrl: config.serverUrl, token: response.access_token }).getSession()
      await saveConfig({ ...config, token: response.access_token })
      dispatch({ type: 'auth/set', payload: { user: sessionUser, token: response.access_token } })
      setStep('done')
      onDone?.(sessionUser.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setStep('password')
    }
  }, [email, dispatch])

  const handleOtpSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return
    setOtp(value.trim())
    setStep('loading')
    setError(null)

    try {
      const config = await loadConfig()
      const api = new PlexicusApi({ baseUrl: config.serverUrl })
      const accessToken = await api.verify2FA(email, value.trim())
      const sessionUser = await new PlexicusApi({ baseUrl: config.serverUrl, token: accessToken }).getSession()
      await saveConfig({ ...config, token: accessToken })
      dispatch({ type: 'auth/set', payload: { user: sessionUser, token: accessToken } })
      setStep('done')
      onDone?.(sessionUser.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : '2FA verification failed')
      setStep('otp')
    }
  }, [email, dispatch])

  if (step === 'done') return null

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="cyan">Plexicus Login</Text>
      <Box marginTop={1} />

      {step === 'loading' && (
        <Text color="yellow">Authenticating...</Text>
      )}

      {step === 'email' && (
        <Box flexDirection="column">
          <Text>Email: </Text>
          <TextInput
            value={email}
            onChange={setEmail}
            onSubmit={handleEmailSubmit}
            placeholder="you@example.com"
          />
        </Box>
      )}

      {step === 'password' && (
        <Box flexDirection="column">
          <Text dimColor>Email: {email}</Text>
          <Text>Password: </Text>
          <TextInput
            value={password}
            onChange={setPassword}
            onSubmit={handlePasswordSubmit}
            placeholder="••••••••"
            mask="•"
          />
        </Box>
      )}

      {step === 'otp' && (
        <Box flexDirection="column">
          <Text dimColor>Email: {email}</Text>
          <Text color="yellow">Two-factor authentication required</Text>
          <Text>OTP Code: </Text>
          <TextInput
            value={otp}
            onChange={setOtp}
            onSubmit={handleOtpSubmit}
            placeholder="123456"
          />
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {step === 'email' && !registerUrl && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Tip: use --token &lt;key&gt; or PLEXICUS_TOKEN=&lt;key&gt; to skip login</Text>
          <Text dimColor>r=create account in browser</Text>
        </Box>
      )}

      {registerUrl && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Registration page opened in browser.</Text>
          <Text dimColor>If it didn't open, visit:</Text>
          <Text color="cyan">{registerUrl}</Text>
          <Text dimColor>Complete registration then log in here.</Text>
        </Box>
      )}
    </Box>
  )
}
