const TAB_WIDTH = 4

// Ink measures text width per-character and doesn't special-case '\t', so a raw tab
// desyncs Ink's wrap/border layout from how terminals actually render tab stops.
// Expand tabs to spaces before handing code/diff lines to <Text> so measured width
// matches rendered width.
export function expandTabs(line: string, tabWidth = TAB_WIDTH): string {
  let result = ''
  for (const ch of line) {
    if (ch === '\t') {
      const pad = tabWidth - (result.length % tabWidth)
      result += ' '.repeat(pad)
    } else {
      result += ch
    }
  }
  return result
}
