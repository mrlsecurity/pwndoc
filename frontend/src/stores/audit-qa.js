import { defineStore } from 'pinia'
import AiService from '@/services/ai'
import { useAiGenerationStore } from '@/stores/ai-generation'
import { useQaRunsStore } from '@/stores/qa-runs'
import { buildQaReportViewModel } from '@/services/qa-display'
import { $t } from '@/boot/i18n'

const emptyCounts = () => ({
  total: 0,
  error: 0,
  warning: 0,
  info: 0
})

export const useAuditQaStore = defineStore('auditQa', {
  state: () => ({
    drawerOpen: false,
    auditId: null,
    severityFilter: 'all'
  }),

  getters: {
    qaKey: (state) => (state.auditId ? `audit:${state.auditId}` : null),

    // Whether a QA run is currently in flight for the open audit.
    running() {
      return useQaRunsStore().isRunning(this.qaKey)
    },

    // When the run started (ms), for the "in progress since …" indicator.
    startedAt() {
      return useQaRunsStore().startedAt(this.qaKey)
    },

    runScope() {
      return useQaRunsStore().runScope(this.qaKey)
    },

    // Full-panel spinner only while first fetching a report with nothing to show yet.
    loading() {
      return useQaRunsStore().isLoading(this.qaKey) && !this.hasReport && !this.running
    },

    errorMessage() {
      return useQaRunsStore().getRun(this.qaKey)?.error || ''
    },

    reportViewModel() {
      return buildQaReportViewModel(useQaRunsStore().getRun(this.qaKey)?.report || {})
    },

    summary() { return this.reportViewModel.summary },
    issues() { return this.reportViewModel.issues },
    counts() { return this.reportViewModel.counts || emptyCounts() },
    hasReport() { return this.reportViewModel.hasReport },
    outdated() { return this.reportViewModel.outdated },
    ranAt() { return this.reportViewModel.ranAt },
    programmaticRanAt() { return this.reportViewModel.programmaticRanAt },
    aiRanAt() { return this.reportViewModel.aiRanAt },
    cached() { return this.reportViewModel.cached },

    filteredIssues(state) {
      if (state.severityFilter === 'all')
        return this.issues

      return this.issues.filter((issue) => issue.severity === state.severityFilter)
    },

    // Whether a run is in flight for a given audit — used by toolbar buttons whose panel
    // may be closed (so a closed drawer still signals activity).
    runningForAudit: () => (auditId) =>
      useQaRunsStore().isRunning(auditId ? `audit:${auditId}` : null)
  },

  actions: {
    open(auditId) {
      const aiStore = useAiGenerationStore()
      if (aiStore.drawerOpen)
        aiStore.closeDrawer()

      this.auditId = auditId
      this.drawerOpen = true
      this.severityFilter = 'all'
      // Re-attach to any in-flight run; loadQa is a no-op while a run is running.
      this.loadQa(auditId)
    },

    close() {
      this.drawerOpen = false
    },

    loadQa(auditId) {
      this.auditId = auditId
      return useQaRunsStore().load(
        `audit:${auditId}`,
        () => AiService.runAuditQa(auditId, { loadOnly: true }).then((response) => response.data.datas || {}),
        { errorFallback: $t('auditQa.failed') }
      )
    },

    runQa(auditId, scope = 'all') {
      this.auditId = auditId
      this.severityFilter = 'all'
      return useQaRunsStore().start(
        `audit:${auditId}`,
        () => AiService.runAuditQa(auditId, { scope }).then((response) => response.data.datas || {}),
        { errorFallback: $t('auditQa.failed'), scope }
      )
    },

    setSeverityFilter(filter) {
      this.severityFilter = filter
    }
  }
})
