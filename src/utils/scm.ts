import type { Repository, Finding } from '../types.js'

// Provider ids are the platform's own: GET /integrations/scm/validity keys and the
// source_control stored on repositories (fastapi/config/scm.py PROVIDER_DEFAULTS). The Azure
// DevOps plugin is stored as `azure-devops` but repositories carry `azure_devops`.
export function normalizeProvider(sourceControl: string): string {
  const s = sourceControl.toLowerCase()
  if (s === 'azure-devops' || s === 'azure_devops' || s === 'tfvc') return 'azure_devops'
  if (s === 'bitbucket_cloud') return 'bitbucket'
  return s
}

export function scmLabel(sourceControl: string): string {
  switch (normalizeProvider(sourceControl)) {
    case 'github': return 'View on GitHub'
    case 'gitlab': return 'View on GitLab'
    case 'bitbucket': return 'View on Bitbucket'
    case 'gitea': return 'View on Gitea'
    case 'forgejo': return 'View on Forgejo'
    case 'azure_devops': return 'View on Azure DevOps'
    default: return 'View Source'
  }
}

// Provider for a repository imported by URL (the manual-add form).
export function guessProvider(url: string): string {
  if (url.includes('github.com')) return 'github'
  if (url.includes('gitlab.com')) return 'gitlab'
  if (url.includes('bitbucket.org')) return 'bitbucket'
  if (url.includes('dev.azure.com') || url.includes('visualstudio.com')) return 'azure_devops'
  if (url.includes('codeberg.org') || /forgejo/i.test(url)) return 'forgejo'
  return 'gitea'
}

export function scmUrl(repo: Repository, finding: Finding): string | null {
  if (!finding.file_path) return null
  const base = (repo.html_url ?? repo.uri).replace(/\/$/, '')
  if (!base.startsWith('http')) return null
  const branch = repo.repository_branch || 'main'
  const file = finding.file_path.replace(/^\//, '')
  const line = finding.line
  // Each forge spells "file at branch, line N" differently; /blob/ only works on GitHub/GitLab.
  switch (normalizeProvider(repo.source_control)) {
    case 'gitea':
    case 'forgejo':
      return `${base}/src/branch/${branch}/${file}${line ? `#L${line}` : ''}`
    case 'bitbucket':
      return `${base}/src/${branch}/${file}${line ? `#lines-${line}` : ''}`
    case 'azure_devops':
      return `${base}?path=/${file}&version=GB${branch}${line ? `&line=${line}&lineEnd=${line + 1}&lineStartColumn=1&lineEndColumn=1` : ''}`
    default:
      return `${base}/blob/${branch}/${file}${line ? `#L${line}` : ''}`
  }
}

export async function openScmLink(url: string): Promise<{ opened: boolean; copied: boolean; url: string }> {
  let opened = false
  let copied = false
  try {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
    await Bun.$`${cmd} ${url}`.quiet()
    opened = true
  } catch {
    try {
      const clipCmd = process.platform === 'darwin' ? 'pbcopy' : 'xclip'
      await Bun.$`echo ${url} | ${clipCmd}`.quiet()
      copied = true
    } catch {
      // show URL in UI as fallback
    }
  }
  return { opened, copied, url }
}
