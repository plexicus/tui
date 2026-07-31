import React from 'react'
import { Box, Text } from 'ink'
import { Dialog } from './Dialog.js'

const KEYBINDINGS = [
  ['j / k', 'Navigate down / up'],
  ['gg / G', 'Jump to top / bottom'],
  ['Enter', 'Select / open detail'],
  ['Esc', 'Close / go back'],
  ['r', 'Request AI remediation'],
  ['p', 'Create pull request'],
  ['s', 'Mark as mitigated'],
  ['f', 'Toggle false positive'],
  ['F', 'Open filter modal'],
  ['] / [', 'Next / prev page'],
  ['/', 'Fuzzy search (findings only)'],
  [':', 'Open command REPL'],
  ['?', 'Show this help'],
  ['── REPL ──', ''],
  [':filter', 'Open filter modal'],
  [':scan', 'Trigger a repository scan'],
  [':theme dark|light|plexicus', 'Switch UI theme'],
  [':config set <key> <value>', 'Set a config value'],
  [':help / :?', 'Show keybindings help'],
]

interface KeybindingsHelpProps {
  accentColor?: string
}

export function KeybindingsHelp({ accentColor = '#9241ff' }: KeybindingsHelpProps) {
  return (
    <Dialog title="Keybindings" accentColor={accentColor}>
      {KEYBINDINGS.map(([key, desc]) =>
        desc === '' ? (
          <Box key={key} marginTop={1}>
            <Text dimColor>{key}</Text>
          </Box>
        ) : (
          <Box key={key}>
            <Box width={22}>
              <Text color={accentColor} bold>{key}</Text>
            </Box>
            <Text>{desc}</Text>
          </Box>
        )
      )}
    </Dialog>
  )
}
