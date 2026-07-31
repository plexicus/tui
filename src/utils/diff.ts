type DiffLineType = 'add' | 'remove' | 'context' | 'header'

export interface DiffLine {
  type: DiffLineType
  content: string
}

export function parseDiff(diffStr: string): DiffLine[] {
  if (!diffStr || !diffStr.trim()) return []

  return diffStr.split('\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return { type: 'add' as const, content: line.slice(1) }
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return { type: 'remove' as const, content: line.slice(1) }
    }
    if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      return { type: 'header' as const, content: line }
    }
    return { type: 'context' as const, content: line.startsWith(' ') ? line.slice(1) : line }
  })
}
