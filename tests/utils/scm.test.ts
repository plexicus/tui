import { describe, it, expect } from 'bun:test'
import { scmLabel, scmUrl, guessProvider, normalizeProvider } from '../../src/utils/scm.js'
import type { Repository, Finding } from '../../src/types.js'

const repo = (source_control: string, html_url: string): Repository => ({
  id: 'r', nickname: 'r', uri: html_url, html_url, repository_branch: 'main', active: true,
  repo_type: source_control, status: 'active', source_control,
  finding_counts: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
})
const finding = { file_path: 'src/app.py', line: 12 } as Finding

describe('scm helpers', () => {
  it('labels every supported provider', () => {
    expect(scmLabel('forgejo')).toBe('View on Forgejo')
    expect(scmLabel('azure_devops')).toBe('View on Azure DevOps')
    expect(scmLabel('azure-devops')).toBe('View on Azure DevOps')
    expect(scmLabel('bitbucket_cloud')).toBe('View on Bitbucket')
    expect(scmLabel('unknown')).toBe('View Source')
  })

  it('normalizes plugin ids to repository source_control values', () => {
    expect(normalizeProvider('azure-devops')).toBe('azure_devops')
    expect(normalizeProvider('GitHub')).toBe('github')
  })

  it('guesses the provider of a manually added URL', () => {
    expect(guessProvider('https://dev.azure.com/org/proj/_git/repo')).toBe('azure_devops')
    expect(guessProvider('https://codeberg.org/o/r')).toBe('forgejo')
    expect(guessProvider('https://git.example.com/o/r')).toBe('gitea')
    expect(guessProvider('https://github.com/o/r')).toBe('github')
  })

  it('builds the per-forge source link', () => {
    expect(scmUrl(repo('github', 'https://github.com/o/r'), finding)).toBe('https://github.com/o/r/blob/main/src/app.py#L12')
    expect(scmUrl(repo('gitea', 'https://g.example.com/o/r'), finding)).toBe('https://g.example.com/o/r/src/branch/main/src/app.py#L12')
    expect(scmUrl(repo('forgejo', 'https://f.example.com/o/r'), finding)).toBe('https://f.example.com/o/r/src/branch/main/src/app.py#L12')
    expect(scmUrl(repo('bitbucket', 'https://bitbucket.org/o/r'), finding)).toBe('https://bitbucket.org/o/r/src/main/src/app.py#lines-12')
    expect(scmUrl(repo('azure_devops', 'https://dev.azure.com/o/p/_git/r'), finding)).toContain('?path=/src/app.py&version=GBmain&line=12')
  })
})
