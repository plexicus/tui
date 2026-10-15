import { describe, it, expect } from 'bun:test'
import { creditsText, pentestsText } from '../../src/commands/clientViews.js'
import { isFeatureUnavailable } from '../../src/services/contract.js'
import { filterCommands } from '../../src/utils/replCommands.js'
import { PlexicusApiError, PlexicusAuthError } from '../../src/utils/errors.js'
import { parseCreditsSummary, parsePentestList } from '../../src/services/contract.js'
import { creditsFixture, pentestsFixture } from './fixtures.js'

const apiErr = (status: number) => new PlexicusApiError('GET /x failed', status, '/x')

describe('views are gated on the endpoint existing', () => {
  it.each([403, 404, 405, 501])('HTTP %i hides the view', status => {
    expect(isFeatureUnavailable(apiErr(status))).toBe(true)
  })

  it('other failures are not "feature unavailable"', () => {
    expect(isFeatureUnavailable(apiErr(500))).toBe(false)
    expect(isFeatureUnavailable(new PlexicusAuthError())).toBe(false)
    expect(isFeatureUnavailable(new Error('x'))).toBe(false)
  })

  it('credits command degrades to a message on an older server', async () => {
    const text = await creditsText({ getCreditsSummary: async () => { throw apiErr(404) } })
    expect(text).toContain('does not expose')
  })

  it('credits command prints the allowlisted line', async () => {
    const text = await creditsText({ getCreditsSummary: async () => parseCreditsSummary(creditsFixture) })
    expect(text).toContain('25,190 / 25,500 AI credits')
    expect(text).not.toContain('LEAK')
  })

  it('pentests command degrades on 403 and lists on success', async () => {
    expect((await pentestsText({ listPentests: async () => { throw apiErr(403) } }))[0]).toContain('does not expose')
    const lines = await pentestsText({ listPentests: async () => parsePentestList(pentestsFixture) })
    expect(lines).toHaveLength(2)
    expect(lines.join('\n')).not.toContain('LEAK')
  })

  it('REPL offers :pentests and :credits only when the server answered for them', () => {
    const names = (g: { pentests?: boolean; credits?: boolean }) => filterCommands('', g).map(c => c.name)
    expect(names({})).not.toContain('pentests')
    expect(names({})).not.toContain('credits')
    expect(names({ pentests: true })).toContain('pentests')
    expect(names({ credits: true })).toContain('credits')
    expect(filterCommands('pen', { pentests: true }).map(c => c.name)).toEqual(['pentests'])
    expect(filterCommands('pen', {}).map(c => c.name)).toEqual([])
  })
})
