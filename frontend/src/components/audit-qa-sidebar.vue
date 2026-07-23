<template>
  <q-scroll-area
  :style="{ height }"
  >
    <qa-results-panel
    :title="$t('auditQa.title')"
    :loading="loading"
    :running="running"
    :started-at="startedAt"
    :run-scope="runScope"
    :error-message="errorMessage"
    :has-report-data="hasReport"
    :programmatic-ran-at="programmaticRanAt"
    :ai-ran-at="aiRanAt"
    :counts="counts"
    :severity-filter="severityFilter"
    :grouped-issues="groupedIssues"
    :outdated="outdated"
    :ai-unavailable-messages="aiUnavailableMessages"
    :show-programmatic-action="showProgrammaticAction"
    :show-ai-action="showAiAction"
    :show-all-action="showProgrammaticAction && showAiAction"
    show-navigation
    @close="closeDrawer"
    @run="runQaScope"
    @update:severity-filter="setSeverityFilter"
    @navigate="navigateTo"
    />
  </q-scroll-area>
</template>

<script>
import { mapState, mapActions } from 'pinia'
import { useAuditQaStore } from '@/stores/audit-qa'
import { useUserStore } from '@/stores/user'
import QaResultsPanel from '@/components/qa-results-panel.vue'
import { buildAuditQaGroups, splitAiUnavailableIssues } from '@/services/qa-display'
import { parseIssueLocation, buildIssueRoute } from '@/services/audit-qa-navigation'
import { isAiSettingEnabled } from '@/services/qa-checks'

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
    },
    // The panel fills a fixed-height q-scroll-area; the caller supplies the route-specific
    // height used by the audit editor layout.
    height: {
      type: String,
      required: true
    }
  },

  computed: {
    ...mapState(useAuditQaStore, [
      'loading',
      'running',
      'startedAt',
      'runScope',
      'issues',
      'hasReport',
      'programmaticRanAt',
      'aiRanAt',
      'errorMessage',
      'severityFilter',
      'counts',
      'outdated'
    ]),

    filteredIssues() {
      return useAuditQaStore().filteredIssues
    },

    aiSettingEnabled() {
      return isAiSettingEnabled(this.$settings)
    },

    // Built-in checks require audits:qa; AI checks require audits:ai-qa (disjoint permissions)
    // plus AI integration enabled.
    showProgrammaticAction() {
      return useUserStore().isAllowed('audits:qa')
    },

    showAiAction() {
      return useUserStore().isAllowed('audits:ai-qa') && this.aiSettingEnabled
    },

    aiUnavailableMessages() {
      return splitAiUnavailableIssues(this.issues).aiUnavailableIssues.map((issue) => issue.message)
    },

    // Report (global) / General information / Network / Findings — grouped by category with
    // one row per finding aggregating every issue it has / Sections, in that order, matching
    // the left navigation drawer's own layout.
    groupedIssues() {
      const { remainingIssues } = splitAiUnavailableIssues(this.filteredIssues)
      return buildAuditQaGroups(remainingIssues, { findings: this.findings, sections: this.sections })
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

    runQaScope(scope, provider) {
      if (this.auditId)
        this.runQa(this.auditId, scope, provider)
    },

    // `location` is the raw location string of any issue in the clicked group/finding-row —
    // all issues within one share the same destination, so any of them resolves the same route.
    navigateTo(location) {
      const parsed = parseIssueLocation(location)
      const route = buildIssueRoute(this.auditId, parsed, {
        findings: this.findings,
        sections: this.sections
      })

      if (route?.path)
        this.$router.push(route.path).catch(() => {})
    }
  }
}
</script>
