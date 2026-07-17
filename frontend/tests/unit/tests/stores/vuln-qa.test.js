import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

vi.mock('@/services/ai', () => ({
  default: {
    getVulnerabilityQaStatus: vi.fn(),
    startVulnerabilityQaRun: vi.fn(),
    cancelVulnerabilityQaRun: vi.fn(),
    runVulnerabilityQa: vi.fn(),
    setVulnerabilityQaIssueDismissed: vi.fn(),
    resolveVulnerabilityQa: vi.fn()
  }
}))

import AiService from '@/services/ai'
import { useVulnQaStore } from '@/stores/vuln-qa'
import { useAiGenerationStore } from '@/stores/ai-generation'
import { useQaRunsStore } from '@/stores/qa-runs'

const statusResponse = (job, report = {}) => ({
  data: { datas: { job, report } }
})

const runningJob = (overrides = {}) => ({
  id: 'job-1',
  locale: 'en',
  scope: 'all',
  state: 'running',
  phase: 'templates',
  processed: 2,
  reused: 3,
  total: 10,
  catalogDone: 0,
  catalogTotal: 0,
  failures: [],
  revision: 5,
  ...overrides
})

describe('vuln-qa store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('open() closes the AI drawer, attaches the locale and fetches status', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(
      statusResponse(null, { hasReport: true, issues: [], mode: 'all' })
    )
    const aiStore = useAiGenerationStore()
    aiStore.drawerOpen = true
    const closeSpy = vi.spyOn(aiStore, 'closeDrawer')

    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    expect(closeSpy).toHaveBeenCalled()
    expect(store.panelOpen).toBe(true)
    expect(store.locale).toBe('en')
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledWith('en')
    expect(useQaRunsStore().getRun('all:en').report.hasReport).toBe(true)
  })

  it('derives running state and progress from the server job', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(runningJob()))
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    expect(store.running).toBe(true)
    expect(store.progress).toEqual({
      processed: 5, // processed + reused both count as done work
      total: 10,
      reused: 3,
      phase: 'templates',
      catalogDone: 0,
      catalogTotal: 0
    })
  })

  it('throttles revision-driven refreshes from socket progress events', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(runningJob({ revision: 5 })))
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)

    // Same revision → no refetch scheduled.
    store.handleSocketProgress(runningJob({ revision: 5, processed: 4 }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)
    // Counters still update straight from the payload.
    expect(store.job.processed).toBe(4)

    // Advancing revision schedules exactly one trailing refetch for a burst of events.
    store.handleSocketProgress(runningJob({ revision: 6 }))
    store.handleSocketProgress(runningJob({ revision: 7 }))
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(2)
  })

  it('ignores socket events for other locales', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null))
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    store.handleSocketProgress(runningJob({ locale: 'fr' }))
    expect(store.job).toBeNull()
  })

  it('refetches immediately when the job completes', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(runningJob()))
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)

    // The server now reports the finished job; the done event triggers the refetch.
    AiService.getVulnerabilityQaStatus.mockResolvedValue(
      statusResponse(runningJob({ state: 'done', revision: 9 }), { hasReport: true })
    )
    store.handleSocketDone(runningJob({ state: 'done', revision: 9 }))
    await vi.runAllTimersAsync()

    expect(store.running).toBe(false)
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(2)
  })

  it('run() starts the background job and attaches to an already running one', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null))
    AiService.startVulnerabilityQaRun.mockResolvedValue({
      data: { datas: { alreadyRunning: true, job: runningJob() } }
    })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    await store.run('all')

    expect(AiService.startVulnerabilityQaRun).toHaveBeenCalledWith({ locale: 'en', scope: 'all' })
    expect(store.running).toBe(true)

    // A second run() while running is a no-op (the server also guards).
    await store.run('all')
    expect(AiService.startVulnerabilityQaRun).toHaveBeenCalledTimes(1)
  })

  it('recheck() runs the single-vuln endpoint and refreshes the assembled report', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null, { hasReport: true }))
    AiService.runVulnerabilityQa.mockResolvedValue({ data: { datas: { hasReport: true } } })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)

    await store.recheck('v1')

    expect(AiService.runVulnerabilityQa).toHaveBeenCalledWith({
      locale: 'en',
      vulnerabilityId: 'v1',
      scope: 'all'
    })
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(2)
    expect(store.recheckingIds).toEqual([])
  })

  it('recheck() mirrors the run into the per-vulnerability qa-runs key', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null, { hasReport: true }))
    AiService.runVulnerabilityQa.mockResolvedValue({ data: { datas: { hasReport: true, issues: [] } } })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    const qaRuns = useQaRunsStore()
    await store.recheck('v1')

    const vulnRun = qaRuns.getRun('vuln:v1:en')
    expect(vulnRun).not.toBeNull()
    expect(vulnRun.running).toBe(false)
    expect(vulnRun.loaded).toBe(true)
    expect(vulnRun.report).toEqual({ hasReport: true, issues: [] })
  })

  it('resolveVuln() posts the resolution and refreshes the report', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null, { hasReport: true }))
    AiService.resolveVulnerabilityQa.mockResolvedValue({ data: { datas: { resolved: true } } })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)

    await store.resolveVuln('v1', true)

    expect(AiService.resolveVulnerabilityQa).toHaveBeenCalledWith({
      locale: 'en',
      vulnerabilityId: 'v1',
      resolved: true
    })
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(2)
    expect(store.resolvingIds).toEqual([])
  })

  it('recheck() follows the scope of the last catalog run', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(
      statusResponse(runningJob({ state: 'done', scope: 'programmatic' }), { hasReport: true })
    )
    AiService.runVulnerabilityQa.mockResolvedValue({ data: { datas: { hasReport: true } } })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    await store.recheck('v1')

    expect(AiService.runVulnerabilityQa).toHaveBeenCalledWith({
      locale: 'en',
      vulnerabilityId: 'v1',
      scope: 'programmatic'
    })
  })

  it('setIssueDismissed() posts the dismissal and refreshes the report', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null, { hasReport: true }))
    AiService.setVulnerabilityQaIssueDismissed.mockResolvedValue({ data: { datas: { dismissed: true } } })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)

    await store.setIssueDismissed({ key: 'k1', dismissed: false }, 'v1', true)

    expect(AiService.setVulnerabilityQaIssueDismissed).toHaveBeenCalledWith({
      locale: 'en',
      vulnerabilityId: 'v1',
      key: 'k1',
      dismissed: true
    })
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(2)
    expect(store.dismissingKeys).toEqual([])

    // Catalog issues carry no vulnerabilityId and restore with dismissed: false.
    await store.setIssueDismissed({ key: 'k2', dismissed: true }, null, false)
    expect(AiService.setVulnerabilityQaIssueDismissed).toHaveBeenLastCalledWith({
      locale: 'en',
      vulnerabilityId: undefined,
      key: 'k2',
      dismissed: false
    })
  })

  it('setIssueDismissed() surfaces failures without refetching', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(null, { hasReport: true }))
    AiService.setVulnerabilityQaIssueDismissed.mockRejectedValue(new Error('nope'))
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    await store.setIssueDismissed({ key: 'k1' }, 'v1', true)

    expect(store.errorMessage).toBe('nope')
    expect(store.dismissingKeys).toEqual([])
    expect(AiService.getVulnerabilityQaStatus).toHaveBeenCalledTimes(1)
  })

  it('recheck() is blocked while a full job is running', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(runningJob()))
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    await store.recheck('v1')
    expect(AiService.runVulnerabilityQa).not.toHaveBeenCalled()
  })

  it('cancel() forwards to the cancel endpoint and updates the job', async () => {
    AiService.getVulnerabilityQaStatus.mockResolvedValue(statusResponse(runningJob()))
    AiService.cancelVulnerabilityQaRun.mockResolvedValue({
      data: { datas: { job: runningJob({ state: 'cancelling' }) } }
    })
    const store = useVulnQaStore()
    store.open('en')
    await vi.runAllTimersAsync()

    await store.cancel()

    expect(AiService.cancelVulnerabilityQaRun).toHaveBeenCalledWith('en')
    expect(store.cancelling).toBe(true)
  })
})
