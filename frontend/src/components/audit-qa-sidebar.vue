<template>
  <qa-results-panel
  :title="$t('auditQa.title')"
  :loading="loading"
  :error-message="errorMessage"
  :has-report-data="hasReport"
  :programmatic-ran-at="programmaticRanAt"
  :ai-ran-at="aiRanAt"
  :counts="counts"
  :severity-filter="severityFilter"
  :grouped-issues="groupedIssues"
  :outdated="outdated"
  :summary="summary"
  show-navigation
  :navigation-label="navigationLabel"
  @close="closeDrawer"
  @run="runQaScope"
  @update:severity-filter="setSeverityFilter"
  @navigate="navigateToIssue"
  />
</template>

<script>
import { mapState, mapActions } from 'pinia'
import { useAuditQaStore } from '@/stores/audit-qa'
import QaResultsPanel from '@/components/qa-results-panel.vue'
import { groupIssuesByLabel, formatQaLocationLabel } from '@/services/qa-display'
import {
  parseIssueLocation,
  buildIssueRoute,
  issueNavigationType
} from '@/services/audit-qa-navigation'

export default {
  name: 'AuditQaSidebar',

  components: {
    QaResultsPanel
  },

  props: {
    auditId: {
      type: String,
      required: true
    },
    findings: {
      type: Array,
      default: () => []
    },
    sections: {
      type: Array,
      default: () => []
    }
  },

  emits: ['highlight-field'],

  computed: {
    ...mapState(useAuditQaStore, [
      'loading',
      'issues',
      'hasReport',
      'programmaticRanAt',
      'aiRanAt',
      'errorMessage',
      'severityFilter',
      'counts',
      'outdated',
      'summary'
    ]),

    filteredIssues() {
      return useAuditQaStore().filteredIssues
    },

    groupedIssues() {
      return groupIssuesByLabel(this.filteredIssues, this.formatLocationLabel)
    }
  },

  methods: {
    ...mapActions(useAuditQaStore, {
      closeStore: 'close',
      runQa: 'runQa',
      setSeverityFilter: 'setSeverityFilter'
    }),

    closeDrawer() {
      this.closeStore()
    },

    runQaScope(scope) {
      if (this.auditId)
        this.runQa(this.auditId, scope)
    },

    formatLocationLabel(location) {
      return formatQaLocationLabel(location)
    },

    navigationLabel(issue) {
      return issueNavigationType(issue.location) === 'field'
        ? this.$t('auditQa.goToField')
        : this.$t('auditQa.goToSection')
    },

    navigateToIssue(issue) {
      const parsed = parseIssueLocation(issue.location)
      const route = buildIssueRoute(this.auditId, parsed, {
        findings: this.findings,
        sections: this.sections
      })

      if (!route?.path)
        return

      if (route.fieldName)
        this.$emit('highlight-field', route.fieldName)

      this.$router.push(route.path).catch(() => {})
    }
  }
}
</script>
