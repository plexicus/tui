import { describe, it, expect } from 'bun:test'
import { FINDING_TYPES } from '../../src/utils/findingTypes.js'

describe('FINDING_TYPES', () => {
  it('offers the repository-scan finding types and not legacy DAST', () => {
    expect(FINDING_TYPES).toContain('SAST')
    expect(FINDING_TYPES).toContain('SCA')
    expect(FINDING_TYPES).toContain('IaC')
    expect(FINDING_TYPES).not.toContain('DAST' as never)
    expect(FINDING_TYPES).not.toContain('Pentest' as never)
  })
})
