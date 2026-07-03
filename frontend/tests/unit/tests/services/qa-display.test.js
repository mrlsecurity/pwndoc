import { describe, it, expect, vi } from 'vitest'

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

vi.mock('@/services/audit-qa-navigation', async (importOriginal) => {
  const actual = await importOriginal()
  return actual
})

import { groupIssuesByLabel, filterIssuesBySeverity, formatQaLocationLabel, buildQaReportViewModel, buildPreviousRunEntries, buildPreviousRunLabels } from '@/services/qa-display'

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

  it('filters issues by severity', () => {
    expect(filterIssuesBySeverity(issues, 'all')).toHaveLength(3)
    expect(filterIssuesBySeverity(issues, 'error')).toHaveLength(2)
    expect(filterIssuesBySeverity(issues, 'warning')).toHaveLength(1)
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

  it('builds a QA report view model with derived counts', () => {
    const view = buildQaReportViewModel({
      issues: [{ severity: 'error' }, { severity: 'warning' }],
      summary: 'Done'
    })

    expect(view.hasReport).toBe(true)
    expect(view.counts.total).toBe(2)
    expect(view.counts.error).toBe(1)
    expect(view.summary).toBe('Done')
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
