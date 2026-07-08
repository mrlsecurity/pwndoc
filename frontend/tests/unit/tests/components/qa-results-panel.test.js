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
      total: 'Total',
      lastRun: 'Last run',
      noIssues: 'No issues flagged',
      noResultsYet: 'No QA results yet.',
      running: 'Running...',
      runProgrammatic: 'Run Programmatical Checks',
      runAi: 'Run AI Checks',
      runAll: 'Run All'
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
