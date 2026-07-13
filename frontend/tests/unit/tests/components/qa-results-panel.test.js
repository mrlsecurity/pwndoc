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
        'q-banner': { template: '<div><slot /><slot name="action" /></div>' },
        // Quasar auto-stubs drop named/scoped slots by default — forward `header` explicitly
        // so the group header (label + "Go to section" button) is actually testable.
        'q-expansion-item': { template: '<div><div class="qa-group-header"><slot name="header" /></div><slot /></div>' }
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

describe('QaResultsPanel group expansion', () => {
  const groupedIssues = [
    { key: 'report', label: 'Report', issues: [] },
    { key: 'general', label: 'General', issues: [] }
  ]

  it('shows one collapse-all toolbar action when every group is expanded', () => {
    const wrapper = createWrapper({ groupedIssues })
    const toggle = wrapper.get('[data-testid="qa-groups-toggle"]')

    expect(wrapper.vm.expandedGroups).toEqual({ report: true, general: true })
    expect(toggle.attributes('aria-label')).toBe('collapseAll')
    expect(toggle.attributes('icon')).toBe('unfold_less')
  })

  it('collapses all groups, then offers to expand them again', async () => {
    const wrapper = createWrapper({ groupedIssues })

    await wrapper.get('[data-testid="qa-groups-toggle"]').trigger('click')

    expect(wrapper.vm.expandedGroups).toEqual({ report: false, general: false })
    expect(wrapper.get('[data-testid="qa-groups-toggle"]').attributes('aria-label')).toBe('expandAll')
    expect(wrapper.get('[data-testid="qa-groups-toggle"]').attributes('icon')).toBe('unfold_more')

    await wrapper.get('[data-testid="qa-groups-toggle"]').trigger('click')
    expect(wrapper.vm.expandedGroups).toEqual({ report: true, general: true })
  })

  it('expands every group from a partially expanded state', async () => {
    const wrapper = createWrapper({ groupedIssues })
    wrapper.vm.expandedGroups.general = false
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-testid="qa-groups-toggle"]').trigger('click')

    expect(wrapper.vm.expandedGroups).toEqual({ report: true, general: true })
  })

  it('preserves existing group state and opens newly arriving groups', async () => {
    const wrapper = createWrapper({ groupedIssues })
    wrapper.vm.expandedGroups.report = false

    await wrapper.setProps({
      groupedIssues: [
        groupedIssues[0],
        { key: 'network', label: 'Network', issues: [] }
      ]
    })

    expect(wrapper.vm.expandedGroups).toEqual({ report: false, network: true })
  })

  it('hides the bulk action when fewer than two groups are visible', () => {
    const wrapper = createWrapper({ groupedIssues: [groupedIssues[0]] })

    expect(wrapper.find('[data-testid="qa-groups-toggle"]').exists()).toBe(false)
  })
})

describe('QaResultsPanel running indicator', () => {
  it('shows the progress bar and in-progress line while a run is in flight', () => {
    const wrapper = createWrapper({ running: true, startedAt: Date.now() })

    expect(wrapper.find('.qa-run-progress').exists()).toBe(true)
    expect(wrapper.find('.qa-run-inprogress').exists()).toBe(true)
    expect(wrapper.find('.qa-results-panel--running').exists()).toBe(true)
  })

  it('does not show the in-progress indicators when idle', () => {
    const wrapper = createWrapper({ running: false })

    expect(wrapper.find('.qa-run-progress').exists()).toBe(false)
    expect(wrapper.find('.qa-run-inprogress').exists()).toBe(false)
    expect(wrapper.find('.qa-results-panel--running').exists()).toBe(false)
  })

  it('keeps the previous report visible while running (does not replace it with a spinner)', () => {
    const wrapper = createWrapper({
      running: true,
      startedAt: Date.now(),
      groupedIssues: [{
        label: 'General',
        issues: [{ severity: 'warning', category: 'completeness', title: 'Issue', message: 'msg', location: 'report', source: 'structural' }]
      }]
    })

    expect(wrapper.text()).toContain('Issue')
    expect(wrapper.find('.qa-run-progress').exists()).toBe(true)
  })
})

describe('QaResultsPanel finding-row rendering', () => {
  const findingRowsGroup = {
    key: 'category:Injection',
    label: 'Findings > Injection',
    findingRows: [{
      key: 'finding-1',
      title: 'XSS',
      findingId: 'finding-1',
      issues: [
        { location: 'finding:finding-1::XSS', title: 'Still needs redaction', message: 'msg', severity: 'warning', category: 'redaction' },
        { location: 'finding:finding-1::XSS/description', title: 'Missing detail', message: 'msg', severity: 'error', category: 'completeness' }
      ]
    }]
  }

  function createFindingRowWrapper() {
    return createWrapper({ groupedIssues: [findingRowsGroup], showNavigation: true })
  }

  it('renders exactly one Go to finding button for the whole row, on the title, not per issue', () => {
    const wrapper = createFindingRowWrapper()
    const findingRow = wrapper.find('.qa-finding-row')
    const buttons = findingRow.findAll('q-btn')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('label')).toBe('auditQa.goToFinding')
  })

  it('does not render any button on individual issue rows', () => {
    const wrapper = createFindingRowWrapper()
    const rows = wrapper.findAll('.qa-issue')
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row.find('q-btn').exists()).toBe(false))
  })

  it('emits navigate with the first issue\'s location on click', async () => {
    const wrapper = createFindingRowWrapper()

    await wrapper.find('.qa-finding-row').find('q-btn').trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([['finding:finding-1::XSS']])
  })
})

describe('QaResultsPanel flat-group navigation', () => {
  it('renders a Go to section button on a general/section group header', () => {
    const wrapper = createWrapper({
      showNavigation: true,
      groupedIssues: [{ key: 'general', label: 'General information', issues: [
        { location: 'general', title: 'Missing scope', message: 'msg', severity: 'warning', category: 'completeness' }
      ] }]
    })

    const buttons = wrapper.find('.qa-groups').findAll('q-btn')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('label')).toBe('auditQa.goToSection')
  })

  it('does not render any button on the Report group', () => {
    const wrapper = createWrapper({
      showNavigation: true,
      groupedIssues: [{ key: 'report', label: 'Report', issues: [
        { location: 'report', title: 'Instructions issue', message: 'msg', severity: 'warning', category: 'instructions' }
      ] }]
    })

    expect(wrapper.find('.qa-groups').find('q-btn').exists()).toBe(false)
  })

  it('does not render a button on individual issues within a flat group', () => {
    const wrapper = createWrapper({
      showNavigation: true,
      groupedIssues: [{ key: 'general', label: 'General information', issues: [
        { location: 'general', title: 'Missing scope', message: 'msg', severity: 'warning', category: 'completeness' }
      ] }]
    })

    expect(wrapper.find('.qa-issue q-btn').exists()).toBe(false)
  })

  it('emits navigate with the location on click', async () => {
    const wrapper = createWrapper({
      showNavigation: true,
      groupedIssues: [{ key: 'section:Executive Summary', label: 'Executive Summary', issues: [
        { location: 'section:Executive Summary', title: 'Missing detail', message: 'msg', severity: 'warning', category: 'completeness' }
      ] }]
    })

    await wrapper.find('.qa-groups').find('q-btn').trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([['section:Executive Summary']])
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
