import { describe, it, expect, vi } from 'vitest'

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

vi.mock('@/services/audit-qa-navigation', async (importOriginal) => {
  const actual = await importOriginal()
  return actual
})

import { groupIssuesByLabel, filterIssuesBySeverity, formatQaLocationLabel, buildQaReportViewModel, buildPreviousRunEntries, buildPreviousRunLabels, isAiUnavailableIssue, splitAiUnavailableIssues, buildAuditQaGroups } from '@/services/qa-display'

describe('qa-display', () => {
  const issues = [
    { location: 'finding:A/description', severity: 'error', title: 'A' },
    { location: 'finding:A/observation', severity: 'warning', title: 'B' },
    { location: 'finding:B/description', severity: 'error', title: 'C' }
  ]

  it('groups issues by formatted location label', () => {
    const groups = groupIssuesByLabel(issues, (location) => location.split('/')[0])
    expect(groups).toHaveLength(2)
    expect(groups[0].issues).toHaveLength(2)
    expect(groups[1].issues).toHaveLength(1)
  })

  describe('buildAuditQaGroups', () => {
    const XSS_ID = '507f1f77bcf86cd799439001'
    const SQLI_ID = '507f1f77bcf86cd799439002'
    const IDOR_ID = '507f1f77bcf86cd799439003'
    const MISC_ID = '507f1f77bcf86cd799439004'

    const findings = [
      { _id: XSS_ID, title: 'XSS', category: 'Injection' },
      { _id: SQLI_ID, title: 'SQLi', category: 'Injection' },
      { _id: IDOR_ID, title: 'IDOR', category: 'Access Control' },
      { _id: MISC_ID, title: 'Misc finding' } // no category -> 'No Category'
    ]

    const sections = [
      { field: 'executiveSummary', name: 'Executive Summary' },
      { field: 'attackScenario', name: 'Attack Scenario' },
      { field: 'cleanup', name: 'Cleanup' }
    ]

    it('orders groups Report, General, Network, then categories in sidebar (findings-array) order', () => {
      const auditIssues = [
        { location: 'report', title: 'Report issue', severity: 'warning' },
        { location: 'general', title: 'General issue', severity: 'warning' },
        { location: 'network', title: 'Network issue', severity: 'warning' },
        { location: `finding:${IDOR_ID}::IDOR/description`, title: 'IDOR issue', severity: 'error' },
        { location: `finding:${XSS_ID}::XSS/description`, title: 'XSS issue', severity: 'error' },
        { location: 'section:Executive Summary', title: 'Section issue', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })

      expect(groups.map((g) => g.key)).toEqual([
        'report',
        'general',
        'network',
        'category:Injection',
        'category:Access Control',
        'section:Executive Summary'
      ])
    })

    it('collapses a finding\'s multiple field-level issues into one row instead of one per field', () => {
      const auditIssues = [
        { location: `finding:${XSS_ID}::XSS/description`, title: 'Missing detail', severity: 'error' },
        { location: `finding:${XSS_ID}::XSS/remediation`, title: 'Missing fix', severity: 'warning' },
        { location: `finding:${XSS_ID}::XSS/poc`, title: 'Missing proof', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })
      const injectionGroup = groups.find((g) => g.key === 'category:Injection')

      expect(injectionGroup.findingRows).toHaveLength(1)
      expect(injectionGroup.findingRows[0].title).toBe('XSS')
      expect(injectionGroup.findingRows[0].issues).toHaveLength(3)
    })

    it('prefixes category labels with "Findings > "', () => {
      const auditIssues = [
        { location: `finding:${XSS_ID}::XSS/description`, title: 'XSS issue', severity: 'error' },
        { location: `finding:${MISC_ID}::Misc finding/description`, title: 'Misc issue', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })

      expect(groups.find((g) => g.key === 'category:Injection').label).toBe('findings > Injection')
      expect(groups.find((g) => g.key === 'category:No Category').label).toBe('findings > No Category')
    })

    it('groups every issue on a finding into that finding\'s row regardless of which field it touches', () => {
      const auditIssues = [
        { location: `finding:${XSS_ID}::XSS`, title: 'Still needs redaction', severity: 'warning' },
        { location: `finding:${XSS_ID}::XSS/description`, title: 'Missing detail', severity: 'error' },
        { location: `finding:${XSS_ID}::XSS/Business Impact`, title: 'Custom field issue', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })
      const row = groups.find((g) => g.key === 'category:Injection').findingRows[0]

      expect(row.issues.map((issue) => issue.title)).toEqual([
        'Still needs redaction',
        'Missing detail',
        'Custom field issue'
      ])
    })

    it('keeps findings within a category in the same order they appear in the findings array', () => {
      const auditIssues = [
        { location: `finding:${SQLI_ID}::SQLi/description`, title: 'SQLi issue', severity: 'error' },
        { location: `finding:${XSS_ID}::XSS/description`, title: 'XSS issue', severity: 'error' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })
      const injectionGroup = groups.find((g) => g.key === 'category:Injection')

      // findings array order is [XSS, SQLi] within Injection, regardless of issue order
      expect(injectionGroup.findingRows.map((row) => row.title)).toEqual(['XSS', 'SQLi'])
    })

    it('orders sections like the audit type instead of the order issues arrive in', () => {
      const auditIssues = [
        { location: 'section:Cleanup', title: 'Cleanup issue', severity: 'warning' },
        { location: 'section:Attack Scenario', title: 'Attack issue', severity: 'warning' },
        { location: 'section:Executive Summary', title: 'Summary issue', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings, sections })

      expect(groups.map((group) => group.key)).toEqual([
        'section:Executive Summary',
        'section:Attack Scenario',
        'section:Cleanup'
      ])
    })

    it('matches section locations by field and uses the section display name', () => {
      const groups = buildAuditQaGroups([
        { location: 'section:attackScenario', title: 'Attack issue', severity: 'warning' }
      ], { findings, sections })

      expect(groups[0]).toMatchObject({
        key: 'section:attackScenario',
        label: 'Attack Scenario'
      })
    })

    it('keeps historical sections that are no longer present in the audit type', () => {
      const groups = buildAuditQaGroups([
        { location: 'section:Removed Section', title: 'Historical issue', severity: 'warning' },
        { location: 'section:Cleanup', title: 'Cleanup issue', severity: 'warning' }
      ], { findings, sections })

      expect(groups.map((group) => group.key)).toEqual([
        'section:Cleanup',
        'section:Removed Section'
      ])
    })

    it('buckets an uncategorized finding under No Category', () => {
      const auditIssues = [
        { location: `finding:${MISC_ID}::Misc finding/description`, title: 'Misc issue', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })
      expect(groups.map((g) => g.key)).toContain('category:No Category')
    })

    it('falls back to No Category when the finding no longer exists (deleted since the QA run)', () => {
      const auditIssues = [
        { location: 'finding:Deleted finding/description', title: 'Orphaned issue', severity: 'warning' }
      ]

      const groups = buildAuditQaGroups(auditIssues, { findings })
      const noCategoryGroup = groups.find((g) => g.key === 'category:No Category')

      expect(noCategoryGroup.findingRows).toHaveLength(1)
      expect(noCategoryGroup.findingRows[0].title).toBe('Deleted finding')
      expect(noCategoryGroup.findingRows[0].findingId).toBe(null)
    })

    it('omits empty buckets entirely', () => {
      const groups = buildAuditQaGroups([{ location: 'general', title: 'x', severity: 'warning' }], { findings })
      expect(groups.map((g) => g.key)).toEqual(['general'])
    })
  })

  it('filters issues by severity', () => {
    expect(filterIssuesBySeverity(issues, 'all')).toHaveLength(3)
    expect(filterIssuesBySeverity(issues, 'error')).toHaveLength(2)
    expect(filterIssuesBySeverity(issues, 'warning')).toHaveLength(1)
  })

  it('identifies AI-unavailable issues by their skipped title', () => {
    expect(isAiUnavailableIssue({ title: 'AI review skipped' })).toBe(true)
    expect(isAiUnavailableIssue({ title: 'AI duplicate review skipped' })).toBe(true)
    expect(isAiUnavailableIssue({ title: 'AI translation link review skipped' })).toBe(true)
    expect(isAiUnavailableIssue({ title: 'Reference link check skipped' })).toBe(false)
    expect(isAiUnavailableIssue({ title: 'Missing audit name' })).toBe(false)
  })

  it('splits AI-unavailable issues out from the remaining issues', () => {
    const withSkipped = [
      ...issues,
      { location: 'report', severity: 'info', title: 'AI review skipped', message: 'Automated content review could not run: provider not configured' }
    ]

    const { aiUnavailableIssues, remainingIssues } = splitAiUnavailableIssues(withSkipped)

    expect(aiUnavailableIssues).toHaveLength(1)
    expect(aiUnavailableIssues[0].message).toContain('provider not configured')
    expect(remainingIssues).toHaveLength(3)
    expect(remainingIssues).toEqual(issues)
  })

  it('formats canonical vulnerability locations with field labels', () => {
    expect(formatQaLocationLabel('vulnerability:Missing HSTS/references', {
      defaultEntityTitle: 'Missing HSTS'
    })).toBe('Missing HSTS · references')
  })

  it('formats AI field path locations using the current entity title', () => {
    expect(formatQaLocationLabel('field path: finding.cvssv3', {
      defaultEntityTitle: 'Missing HSTS'
    })).toBe('Missing HSTS · CVSS v3')
  })

  it('formats field-only locations without a title', () => {
    expect(formatQaLocationLabel('field:category')).toBe('category')
  })

  it('strips the embedded finding id when formatting finding locations', () => {
    expect(formatQaLocationLabel('finding:507f1f77bcf86cd799439011::SQL Injection/description'))
      .toBe('SQL Injection · description')
  })

  it('builds a QA report view model with derived counts', () => {
    const view = buildQaReportViewModel({
      issues: [{ severity: 'error' }, { severity: 'warning' }]
    })

    expect(view.hasReport).toBe(true)
    expect(view.counts.total).toBe(2)
    expect(view.counts.error).toBe(1)
    expect(view.summary).toBeUndefined()
  })

  it('builds separate previous-run labels for programmatic and AI timestamps', () => {
    const labels = buildPreviousRunLabels({
      programmaticRanAt: '2026-07-03T20:18:17.000Z',
      aiRanAt: '2026-07-03T21:00:00.000Z'
    })

    expect(labels).toHaveLength(2)
    expect(labels[0]).toBe('auditQa.previousProgrammaticRunAt')
    expect(labels[1]).toBe('auditQa.previousAiRunAt')
  })

  it('builds compact previous-run entries', () => {
    const entries = buildPreviousRunEntries({
      programmaticRanAt: '2026-07-03T20:18:17.000Z',
      aiRanAt: '2026-07-03T21:00:00.000Z'
    })

    expect(entries).toHaveLength(2)
    expect(entries[0].kind).toBe('programmatic')
    expect(entries[1].kind).toBe('ai')
    expect(entries[0].date).toBeTruthy()
  })
})
