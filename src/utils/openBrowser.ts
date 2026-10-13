import { spawn } from 'node:child_process'

// Opens `url` in the default browser. Arguments are passed as an array (no shell), so the URL
// cannot be interpreted by a shell. Resolves false when no opener could be started.
export function openBrowser(url: string, platform: string = process.platform): Promise<boolean> {
  const [cmd, args] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]]
  return new Promise(resolve => {
    try {
      const child = spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true })
      child.once('error', () => resolve(false))
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    } catch {
      resolve(false)
    }
  })
}
