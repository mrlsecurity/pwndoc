<template>
  <q-scroll-area
  ref="scrollArea"
  :style="{ height }"
  @scroll="onScroll"
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
import QaResultsPanel from '@/components/qa-results-panel.vue'
import { buildAuditQaGroups, splitAiUnavailableIssues } from '@/services/qa-display'
import { parseIssueLocation, buildIssueRoute } from '@/services/audit-qa-navigation'

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
    // The panel fills a fixed-height q-scroll-area (its actual scroll mechanism — an inner
    // overflow region wouldn't get a definite height, and Quasar's scroll area doesn't use
    // native scrollTop, so the caller passes the same height it used to give that area).
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
      'outdated',
      'scrollTop'
    ]),

    filteredIssues() {
      return useAuditQaStore().filteredIssues
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

  watch: {
    // The report (and with it, enough scrollable height to land on a non-zero position) may
    // arrive after mount — re-apply the restore once it does.
    hasReport(loaded) {
      if (loaded)
        this.restoreScrollPosition()
    }
  },

  mounted() {
    this.restoreScrollPosition()
  },

  methods: {
    ...mapActions(useAuditQaStore, {
      closeStore: 'close',
      runQa: 'runQa',
      setSeverityFilter: 'setSeverityFilter',
      setScrollTop: 'setScrollTop'
    }),

    closeDrawer() {
      this.closeStore()
    },

    runQaScope(scope) {
      if (this.auditId)
        this.runQa(this.auditId, scope)
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
    },

    restoreScrollPosition() {
      if (!this.scrollTop)
        return

      this.$nextTick(() => {
        this.$refs.scrollArea?.setScrollPosition('vertical', this.scrollTop, 0)
      })
    },

    onScroll(info) {
      this.setScrollTop(info.verticalPosition)
    }
  }
}
</script>
