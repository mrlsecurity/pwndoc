import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import QaResultsPanel from '@/components/qa-results-panel.vue'

vi.mock('@/boot/i18n', () => ({
  $t: vi.fn((key) => key)
}))

const messages = {
  'en-US': {
    auditQa: {
      outdatedBanner: 'These results are out of date — content changed since the last run. Re-run recommended.',
      errors: 'Errors',
      warnings: 'Warnings',
      infos: 'Infos',
      total: 'Total',
      lastRun: 'Last run',
      noIssues: 'No issues flagged',
      noResultsYet: 'No QA results yet.',
      running: 'Running...',
      runProgrammatic: 'Run Programmatic Checks',
      runAi: 'Run AI Checks',
      runAll: 'Run All',
      aiReview: 'AI review — verify before acting'
    }
  }
}

const baseCounts = { total: 1, error: 0, warning: 1, info: 0 }

function createWrapper(props = {}) {
  return createTestWrapper(QaResultsPanel, {
    messages,
    props: {
      title: 'QA Review',
      hasReportData: true,
      counts: baseCounts,
      groupedIssues: [],
      ...props
    },
    global: {
      stubs: {
        'q-banner': { template: '<div><slot /><slot name="action" /></div>' }
      }
    }
  })
}

describe('QaResultsPanel outdated banner', () => {
  it('shows the outdated banner when the report is stale', () => {
    const wrapper = createWrapper({ outdated: true })

    expect(wrapper.text()).toContain('These results are out of date')
  })

  it('does not show the outdated banner when the report is current', () => {
    const wrapper = createWrapper({ outdated: false })

    expect(wrapper.text()).not.toContain('These results are out of date')
  })

  it('dismisses the banner when the close button is clicked', async () => {
    const wrapper = createWrapper({ outdated: true })

    await wrapper.find('.qa-outdated-banner q-btn').trigger('click')

    expect(wrapper.text()).not.toContain('These results are out of date')
  })

  it('re-shows the banner after a fresh run completes while still outdated', async () => {
    const wrapper = createWrapper({ outdated: true })

    await wrapper.find('.qa-outdated-banner q-btn').trigger('click')
    expect(wrapper.text()).not.toContain('These results are out of date')

    await wrapper.setProps({ loading: true })
    await wrapper.setProps({ loading: false, outdated: true })

    expect(wrapper.text()).toContain('These results are out of date')
  })
})

describe('QaResultsPanel AI-sourced issue caption', () => {
  const groupedIssues = [{
    label: 'General',
    issues: [
      {
        severity: 'warning',
        category: 'completeness',
        title: 'Structural issue',
        message: 'Missing field',
        location: 'report',
        source: 'structural'
      },
      {
        severity: 'warning',
        category: 'redaction',
        title: 'AI issue',
        message: 'Sensitive data found',
        location: 'report',
        source: 'ai'
      }
    ]
  }]

  it('shows the AI review caption only on AI-sourced issues', () => {
    const wrapper = createWrapper({ groupedIssues })

    expect(wrapper.text()).toContain('AI review — verify before acting')
  })

  it('does not show the AI review caption when there are no AI-sourced issues', () => {
    const wrapper = createWrapper({
      groupedIssues: [{
        label: 'General',
        issues: [groupedIssues[0].issues[0]]
      }]
    })

    expect(wrapper.text()).not.toContain('AI review — verify before acting')
  })
})

describe('QaResultsPanel summary', () => {
  it('renders the summary text when present', () => {
    const wrapper = createWrapper({ summary: 'Overall, the report is well-structured with two minor issues.' })

    expect(wrapper.text()).toContain('Overall, the report is well-structured with two minor issues.')
  })

  it('does not render a summary block when summary is empty', () => {
    const wrapper = createWrapper({ summary: '' })

    expect(wrapper.find('.qa-summary').exists()).toBe(false)
  })
})

describe('QaResultsPanel info tile', () => {
  it('renders an info stat tile alongside errors, warnings, and total', () => {
    const wrapper = createWrapper({ counts: { total: 4, error: 1, warning: 1, info: 2 } })

    expect(wrapper.find('.qa-stat--info .qa-stat__value').text()).toBe('2')
  })

  it('filters to info severity when the info tile is clicked', async () => {
    const wrapper = createWrapper({ counts: { total: 4, error: 1, warning: 1, info: 2 } })

    await wrapper.find('.qa-stat--info').trigger('click')

    expect(wrapper.emitted('update:severityFilter')).toEqual([['info']])
  })
})

describe('QaResultsPanel AI-unavailable banner', () => {
  it('promotes AI-unavailable messages to a banner instead of a buried row', () => {
    const wrapper = createWrapper({
      aiUnavailableMessages: ['Automated content review could not run: provider not configured']
    })

    expect(wrapper.find('.qa-ai-unavailable-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('Automated content review could not run: provider not configured')
  })

  it('does not render the banner when there are no AI-unavailable messages', () => {
    const wrapper = createWrapper({ aiUnavailableMessages: [] })

    expect(wrapper.find('.qa-ai-unavailable-banner').exists()).toBe(false)
  })
})
