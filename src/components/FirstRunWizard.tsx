import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { SmartTextInput as TextInput } from './design-system/SmartTextInput.js'
import { saveConfig, loadConfig } from '../services/config.js'
import { friendlyError } from '../utils/errors.js'

interface FirstRunWizardProps {
  onComplete: () => void
}

export function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [serverUrl, setServerUrl] = useState('https://api.app.plexicus.ai')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (value: string) => {
    const url = value.trim() || 'https://api.app.plexicus.ai'
    setSaving(true)
    setError(null)
    try {
      const config = await loadConfig()
      await saveConfig({ ...config, serverUrl: url })
      onComplete()
    } catch (err) {
      setError(friendlyError(err, 'Failed to save config'))
      setSaving(false)
    }
  }

  return (
    <Box flexDirection="column" padding={2}>
      <Text bold color="cyan">Welcome to Plexicus TUI</Text>
      <Text dimColor>First-time setup — configure your server</Text>
      <Box marginTop={1} />

      <Box>
        <Text>Server URL </Text>
        <Text dimColor>[https://api.app.plexicus.ai]: </Text>
      </Box>
      {!saving ? (
        <TextInput
          value={serverUrl}
          onChange={setServerUrl}
          onSubmit={handleSubmit}
          placeholder="https://api.app.plexicus.ai"
        />
      ) : (
        <Text color="green">Saving...</Text>
      )}

      {error && <Text color="red">{error}</Text>}

      <Box marginTop={1}>
        <Text dimColor>Press Enter to confirm (leave blank for default)</Text>
      </Box>
    </Box>
  )
}
