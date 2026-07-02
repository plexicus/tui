import React, { useEffect, useRef, useState } from 'react'
import { Text, useInput } from 'ink'

interface SmartTextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  mask?: string
  focus?: boolean
}

export function SmartTextInput({
  value,
  onChange,
  onSubmit,
  placeholder = '',
  mask,
  focus = true,
}: SmartTextInputProps) {
  const [cursor, setCursor] = useState(value.length)

  // Latest value, updated synchronously on edits: a paste followed immediately
  // by Enter would otherwise submit the pre-paste value from a stale closure
  const latestValue = useRef(value)
  useEffect(() => {
    latestValue.current = value
  }, [value])

  useEffect(() => {
    setCursor(c => Math.min(c, value.length))
  }, [value.length])

  useInput((input, key) => {
    if (!focus) return

    if (key.leftArrow) { setCursor(c => Math.max(0, c - 1)); return }
    if (key.rightArrow) { setCursor(c => Math.min(value.length, c + 1)); return }

    // readline shortcuts
    if (key.ctrl && input === 'a') { setCursor(0); return }
    if (key.ctrl && input === 'e') { setCursor(value.length); return }
    if (key.ctrl && (input === 'u' || input === 'k')) {
      // Ctrl+U: clear to beginning from cursor; Ctrl+K: clear to end
      // Without true cursor-aware editing we treat both as clear-all for simplicity
      latestValue.current = ''
      onChange('')
      setCursor(0)
      return
    }
    if (key.ctrl && input === 'w') {
      const base = latestValue.current
      const at = Math.min(cursor, base.length)
      const before = base.slice(0, at)
      const trimmed = before.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      const newBefore = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : ''
      const next = newBefore + base.slice(at)
      latestValue.current = next
      onChange(next)
      setCursor(newBefore.length)
      return
    }

    if (key.backspace || key.delete) {
      const base = latestValue.current
      const at = Math.min(cursor, base.length)
      if (at > 0) {
        const next = base.slice(0, at - 1) + base.slice(at)
        latestValue.current = next
        onChange(next)
        setCursor(at - 1)
      }
      return
    }
    if (key.return) {
      onSubmit?.(latestValue.current)
      return
    }
    if (!key.ctrl && !key.meta && input) {
      // Pasted text arrives as one multi-char chunk — strip control chars and insert whole.
      // A newline inside the chunk (paste of a full line) means insert-then-submit.
      const hasNewline = input.includes('\r') || input.includes('\n')
      const clean = [...input].filter(ch => {
        const code = ch.charCodeAt(0)
        return code >= 32 && code !== 127
      }).join('')
      if (clean) {
        const base = latestValue.current
        const at = Math.min(cursor, base.length)
        const next = base.slice(0, at) + clean + base.slice(at)
        latestValue.current = next
        onChange(next)
        setCursor(c => c + clean.length)
      }
      if (hasNewline) onSubmit?.(latestValue.current)
    }
  })

  const display = mask ? mask.repeat(value.length) : value

  if (!focus && !value) {
    return <Text dimColor>{placeholder}</Text>
  }

  if (!value) {
    return (
      <Text>
        <Text inverse> </Text>
        {placeholder && <Text dimColor>{placeholder}</Text>}
      </Text>
    )
  }

  const before = display.slice(0, cursor)
  const atChar = display[cursor]
  const after = display.slice(cursor + 1)

  return (
    <Text>
      {before}
      {atChar !== undefined
        ? <Text inverse>{atChar}</Text>
        : <Text inverse> </Text>}
      {after}
    </Text>
  )
}
