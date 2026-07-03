import { defineStore } from 'pinia'
import AiService from '@/services/ai'
import { useAiGenerationStore } from '@/stores/ai-generation'
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
    loading: false,
    auditId: null,
    summary: '',
    issues: [],
    cached: false,
    outdated: false,
    ranAt: null,
    programmaticRanAt: null,
    aiRanAt: null,
    hasReport: false,
    errorMessage: '',
    severityFilter: 'all',
    counts: emptyCounts()
  }),

  getters: {
    filteredIssues(state) {
      if (state.severityFilter === 'all')
        return state.issues

      return state.issues.filter((issue) => issue.severity === state.severityFilter)
    }
  },

  actions: {
    open(auditId) {
      const aiStore = useAiGenerationStore()
      if (aiStore.drawerOpen)
        aiStore.closeDrawer()

      this.auditId = auditId
      this.drawerOpen = true
      this.severityFilter = 'all'
      this.errorMessage = ''
      this.loadQa(auditId)
    },

    close() {
      this.drawerOpen = false
    },

    applyReport(data = {}) {
      Object.assign(this, buildQaReportViewModel(data))
    },

    loadQa(auditId) {
      this.loading = true
      this.errorMessage = ''
      this.auditId = auditId

      return AiService.runAuditQa(auditId, { loadOnly: true })
      .then((response) => {
        this.applyReport(response.data.datas || {})
      })
      .catch((err) => {
        this.errorMessage = err.response?.data?.datas || $t('auditQa.failed')
        this.summary = ''
        this.issues = []
        this.hasReport = false
        this.counts = emptyCounts()
      })
      .finally(() => {
        this.loading = false
      })
    },

    runQa(auditId, scope = 'all') {
      this.loading = true
      this.errorMessage = ''
      this.auditId = auditId
      this.severityFilter = 'all'

      return AiService.runAuditQa(auditId, { scope })
      .then((response) => {
        this.applyReport(response.data.datas || {})
        this.cached = false
        this.outdated = false
      })
      .catch((err) => {
        this.errorMessage = err.response?.data?.datas || $t('auditQa.failed')
      })
      .finally(() => {
        this.loading = false
      })
    },

    setSeverityFilter(filter) {
      this.severityFilter = filter
    }
  }
})
