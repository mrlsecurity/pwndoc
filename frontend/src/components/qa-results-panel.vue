<template>
  <div class="qa-results-panel column full-height" :class="{ 'qa-results-panel--running': running }">
    <q-toolbar class="bg-grey-3" @mousedown.prevent>
      <q-toolbar-title class="text-subtitle1">{{ title }}</q-toolbar-title>
      <q-btn
      v-if="showGroupToggle"
      data-testid="qa-groups-toggle"
      :icon="groupToggleIcon"
      :aria-label="groupToggleLabel"
      flat
      round
      dense
      @click="toggleAllGroups"
      >
        <q-tooltip>{{ groupToggleLabel }}</q-tooltip>
      </q-btn>
      <q-btn icon="close" flat round dense @click="$emit('close')" />
    </q-toolbar>

    <q-linear-progress v-if="running" indeterminate color="primary" class="qa-run-progress" />

    <q-card-section v-if="loading" class="text-center q-py-xl col" @mousedown.prevent>
      <q-spinner color="primary" size="3em" />
      <div class="q-mt-md text-grey-7">{{ loadingLabel }}</div>
    </q-card-section>

    <template v-else>
      <q-card-section class="col-auto q-pb-none" @mousedown.prevent>
        <div v-if="running" class="q-mb-md">
          <div class="qa-run-inprogress">
            <q-spinner-dots color="primary" size="20px" class="q-mr-sm" />
            <span>{{ inProgressLabel }}</span>
            <q-space />
            <q-btn
            v-if="showCancel"
            data-testid="qa-cancel-run"
            flat
            dense
            no-caps
            size="sm"
            color="negative"
            :label="$t('vulnerabilityQa.cancel')"
            @click="$emit('cancel')"
            />
          </div>
          <template v-if="progressView">
            <q-linear-progress :value="progressView.ratio" color="primary" class="q-mt-xs" />
            <div class="text-caption text-grey-7 q-mt-xs">
              {{ progressView.label }}
              <span v-if="progressView.reusedLabel"> · {{ progressView.reusedLabel }}</span>
            </div>
          </template>
        </div>

        <q-banner v-if="topBanner" dense rounded class="bg-blue-grey-1 text-grey-9 q-mb-md qa-top-banner">
          {{ topBanner }}
        </q-banner>

        <div v-if="previousRunEntries.length" class="qa-run-meta q-mb-md">
          <div class="qa-run-meta__heading">{{ $t('auditQa.lastRun') }}</div>
          <div
          v-for="entry in previousRunEntries"
          :key="entry.kind"
          class="qa-run-meta__line"
          >
            <q-icon
            :name="entry.kind === 'ai' ? 'auto_awesome' : 'rule'"
            size="14px"
            class="qa-run-meta__icon"
            />
            <span class="qa-run-meta__label">{{ entry.label }}</span>
            <span v-if="entry.date" class="qa-run-meta__date">{{ entry.date }}</span>
          </div>
        </div>

        <div v-if="errorMessage" class="text-negative q-mb-md">
          {{ errorMessage }}
        </div>

        <q-banner
        v-if="aiUnavailableMessages.length"
        dense
        rounded
        class="bg-orange-1 text-orange-10 q-mb-md qa-ai-unavailable-banner"
        >
          <div
          v-for="(message, index) in aiUnavailableMessages"
          :key="index"
          >
            {{ message }}
          </div>
        </q-banner>

        <!-- Before the first run the scope choices are the main content; once a report
             exists they collapse into one split button so findings keep the space. -->
        <div v-if="hasRunActions && !hasReportData" class="column q-gutter-sm q-mb-md">
          <q-btn
          v-if="programmaticActionVisible"
          outline
          no-caps
          color="primary"
          :label="$t('auditQa.runProgrammatic')"
          :disable="loading || running"
          @click="$emit('run', 'programmatic')"
          />
          <q-btn
          v-if="aiActionVisible"
          outline
          no-caps
          color="primary"
          :label="$t('auditQa.runAi')"
          :disable="loading || running"
          @click="$emit('run', 'ai')"
          />
          <q-btn
          v-if="allActionVisible"
          unelevated
          no-caps
          color="primary"
          :label="$t('auditQa.runAll')"
          :disable="loading || running"
          @click="$emit('run', 'all')"
          />
        </div>
        <div v-else-if="showRerunAction" class="q-mb-md">
          <q-btn-dropdown
          v-if="otherRunScopeChoices.length"
          data-testid="qa-run-again"
          split
          unelevated
          no-caps
          dense
          color="primary"
          :label="runAgainLabel"
          :disable="loading || running"
          @click="$emit('run', defaultRunScope)"
          >
            <q-list>
              <q-item
              v-for="choice in otherRunScopeChoices"
              :key="choice.scope"
              clickable
              v-close-popup
              :data-testid="`qa-run-scope-${choice.scope}`"
              @click.stop="$emit('run', choice.scope)"
              >
                <q-item-section>{{ choice.label }}</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn
          v-else
          data-testid="qa-run-again"
          unelevated
          no-caps
          dense
          color="primary"
          :label="runAgainLabel"
          :disable="loading || running"
          @click="$emit('run', defaultRunScope)"
          />
          <div v-if="runAgainHint" data-testid="qa-run-again-caption" class="text-caption text-grey-7 q-mt-xs">
            {{ runAgainHint }}
          </div>
        </div>

        <template v-if="hasReportData">
          <q-banner
          v-if="showOutdatedBanner && !showStatusFilter"
          dense
          rounded
          class="bg-orange-1 text-orange-10 q-mb-md qa-outdated-banner"
          >
            {{ $t('auditQa.outdatedBanner') }}
            <template v-if="showOutdatedRerun || showOutdatedDismiss" v-slot:action>
              <q-btn
              v-if="hasRunActions && showOutdatedRerun"
              data-testid="qa-outdated-rerun"
              flat
              dense
              no-caps
              :label="$t('auditQa.runAgain')"
              :disable="loading || running"
              @click="$emit('run', defaultRunScope)"
              />
              <q-btn
              v-if="showOutdatedDismiss"
              data-testid="qa-outdated-dismiss"
              flat
              dense
              round
              icon="close"
              @click="dismissOutdated"
              />
            </template>
          </q-banner>

          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-3">
              <div
              class="qa-stat qa-stat--error"
              :class="{ 'qa-stat--active': severityFilter === 'error' }"
              @click="setSeverityFilter('error')"
              >
                <div class="qa-stat__value">{{ counts.error }}</div>
                <div class="qa-stat__label">{{ $t('auditQa.errors') }}</div>
              </div>
            </div>
            <div class="col-3">
              <div
              class="qa-stat qa-stat--warning"
              :class="{ 'qa-stat--active': severityFilter === 'warning' }"
              @click="setSeverityFilter('warning')"
              >
                <div class="qa-stat__value">{{ counts.warning }}</div>
                <div class="qa-stat__label">{{ $t('auditQa.warnings') }}</div>
              </div>
            </div>
            <div class="col-3">
              <div
              class="qa-stat qa-stat--info"
              :class="{ 'qa-stat--active': severityFilter === 'info' }"
              @click="setSeverityFilter('info')"
              >
                <div class="qa-stat__value">{{ counts.info }}</div>
                <div class="qa-stat__label">{{ $t('auditQa.infos') }}</div>
              </div>
            </div>
            <div class="col-3">
              <div
              class="qa-stat qa-stat--total"
              :class="{ 'qa-stat--active': severityFilter === 'all' }"
              @click="setSeverityFilter('all')"
              >
                <div class="qa-stat__value">{{ counts.total }}</div>
                <div class="qa-stat__label">{{ $t('auditQa.total') }}</div>
              </div>
            </div>
          </div>

          <div v-if="showTextFilter" class="row items-center q-gutter-sm q-mb-md">
            <q-input
            data-testid="qa-text-filter"
            class="col qa-text-filter"
            dense
            outlined
            clearable
            :debounce="300"
            :model-value="textFilter"
            :placeholder="$t('vulnerabilityQa.filterRows')"
            @mousedown.stop
            @update:model-value="$emit('update:textFilter', $event || '')"
            >
              <template v-slot:prepend>
                <q-icon name="search" size="18px" />
              </template>
            </q-input>
          </div>

          <div v-if="showStatusFilter" class="row items-center q-gutter-xs q-mb-md">
            <q-chip
            v-for="option in statusFilterOptions"
            :key="option.value"
            :data-testid="`qa-status-filter-${option.value}`"
            clickable
            dense
            :outline="statusFilter !== option.value"
            :color="statusFilter === option.value ? 'primary' : 'grey-7'"
            :text-color="statusFilter === option.value ? 'white' : ''"
            @click="$emit('update:statusFilter', option.value)"
            >
              {{ option.label }}<span v-if="option.count"> ({{ option.count }})</span>
            </q-chip>
          </div>
        </template>
      </q-card-section>

      <template v-if="hasReportData">
        <q-separator />

        <q-card-section class="qa-groups col q-pa-none" @mousedown.prevent>
          <div v-if="!groupedIssues.length" class="text-center text-grey-6 q-pa-lg">
            {{ $t('auditQa.noIssues') }}
          </div>

          <!-- Each group is its own component: toggling/filtering only re-renders groups
               whose props changed, and collapsed groups keep zero DOM — required for the
               vulnerability-database report which can hold hundreds of rows. -->
          <q-list v-else separator>
            <qa-results-group
            v-for="group in groupedIssues"
            :key="group.key || group.label"
            :group="group"
            :expanded="expandedGroups[groupKey(group)] === true"
            :show-navigation="showNavigation"
            :show-recheck="showRecheck"
            :rechecking-keys="recheckingKeys"
            :show-row-resolve="showRowResolve"
            :resolving-row-keys="resolvingRowKeys"
            :row-navigation-label="rowNavigationLabel"
            :count-rows="countRows"
            :show-dismiss-actions="showDismissActions"
            :dismissing-keys="dismissingKeys"
            :running="running"
            @update:expanded="setGroupExpanded(group, $event)"
            @navigate="forwardNavigate"
            @recheck="$emit('recheck', $event)"
            @resolve-row="$emit('resolve-row', $event)"
            @dismiss="$emit('dismiss', $event)"
            />
          </q-list>
        </q-card-section>
      </template>

      <q-card-section v-else class="text-center text-grey-6 col" @mousedown.prevent>
        {{ emptyStateLabel }}
      </q-card-section>
    </template>
  </div>
</template>

<script>
import { $t } from '@/boot/i18n'
import { hasAnyProgrammaticQaCheckEnabled, hasAnyAiQaCheckEnabled } from '@/services/qa-checks'
import { buildPreviousRunEntries, countGroupEntries } from '@/services/qa-display'
import QaResultsGroup from '@/components/qa-results-group.vue'

// Above this many total issues, groups start collapsed: expanding on demand keeps the
// initial render (and every subsequent interaction) cheap on large reports.
const DEFAULT_EXPAND_ISSUE_LIMIT = 100

export default {
  name: 'QaResultsPanel',

  components: {
    QaResultsGroup
  },

  props: {
    title: {
      type: String,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    },
    running: {
      type: Boolean,
      default: false
    },
    startedAt: {
      type: [Number, String, Date],
      default: null
    },
    runScope: {
      type: String,
      default: null
    },
    errorMessage: {
      type: String,
      default: ''
    },
    hasReportData: {
      type: Boolean,
      default: false
    },
    programmaticRanAt: {
      type: [String, Number, Date],
      default: null
    },
    aiRanAt: {
      type: [String, Number, Date],
      default: null
    },
    emptyStateLabel: {
      type: String,
      default: () => $t('auditQa.noResultsYet')
    },
    loadingLabel: {
      type: String,
      default: () => $t('auditQa.loading')
    },
    showProgrammaticAction: {
      type: Boolean,
      default: true
    },
    showAiAction: {
      type: Boolean,
      default: true
    },
    showAllAction: {
      type: Boolean,
      default: true
    },
    counts: {
      type: Object,
      default: () => ({
        total: 0,
        error: 0,
        warning: 0,
        info: 0
      })
    },
    severityFilter: {
      type: String,
      default: 'all'
    },
    groupedIssues: {
      type: Array,
      default: () => []
    },
    topBanner: {
      type: String,
      default: ''
    },
    outdated: {
      type: Boolean,
      default: false
    },
    aiUnavailableMessages: {
      type: Array,
      default: () => []
    },
    showNavigation: {
      type: Boolean,
      default: false
    },
    // Determinate job progress ({ processed, total, reused, phase, catalogDone,
    // catalogTotal }) — rendered under the in-progress line while `running`.
    progress: {
      type: Object,
      default: null
    },
    showCancel: {
      type: Boolean,
      default: false
    },
    // Per-row recheck action on findingRows groups; keys currently being rechecked
    // show a spinner.
    showRecheck: {
      type: Boolean,
      default: false
    },
    recheckingKeys: {
      type: Array,
      default: () => []
    },
    // Whole-vulnerability resolve action on findingRows groups; keys being resolved
    // show a spinner.
    showRowResolve: {
      type: Boolean,
      default: false
    },
    resolvingRowKeys: {
      type: Array,
      default: () => []
    },
    // Label for the per-row navigation button (findings vs. vulnerabilities).
    rowNavigationLabel: {
      type: String,
      default: () => $t('auditQa.goToFinding')
    },
    // Count category groups by vulnerability (finding row) rather than issue total.
    countRows: {
      type: Boolean,
      default: false
    },
    // Per-issue dismiss/restore action; keys currently being updated show a spinner.
    showDismissActions: {
      type: Boolean,
      default: false
    },
    dismissingKeys: {
      type: Array,
      default: () => []
    },
    // Free-text filter over row titles (QA-all panel).
    showTextFilter: {
      type: Boolean,
      default: false
    },
    textFilter: {
      type: String,
      default: ''
    },
    // Status filter chips (active / outdated / resolved / all) — QA-all panel.
    showStatusFilter: {
      type: Boolean,
      default: false
    },
    statusFilter: {
      type: String,
      default: 'active'
    },
    statusCounts: {
      type: Object,
      default: () => ({ outdated: 0, resolved: 0 })
    },
    // Hint rendered under the "Run again" button (QA-all panel passes the vuln-specific
    // copy). Empty hides it — audit / single-vuln panels don't set it.
    runAgainHint: {
      type: String,
      default: ''
    },
    // Vulnerability QA only offers a full rerun when cached results are stale. Audit
    // QA keeps its existing always-available rerun behavior by using the default.
    rerunOnlyWhenOutdated: {
      type: Boolean,
      default: false
    },
    // Some consumers use the main rerun control exclusively and keep the outdated
    // banner informational.
    showOutdatedRerun: {
      type: Boolean,
      default: true
    },
    showOutdatedDismiss: {
      type: Boolean,
      default: true
    }
  },

  emits: [
    'close',
    'run',
    'update:severityFilter',
    'navigate',
    'cancel',
    'recheck',
    'resolve-row',
    'dismiss',
    'update:statusFilter',
    'update:textFilter'
  ],

  data() {
    return {
      dismissedOutdated: false,
      expandedGroups: {}
    }
  },

  watch: {
    loading(isLoading, wasLoading) {
      if (wasLoading && !isLoading)
        this.dismissedOutdated = false
    },

    groupedIssues: {
      immediate: true,
      handler(groups) {
        const totalIssues = groups.reduce((sum, group) => sum + this.groupIssueCount(group), 0)
        const defaultExpanded = totalIssues <= DEFAULT_EXPAND_ISSUE_LIMIT
        const nextExpandedGroups = {}
        groups.forEach((group) => {
          const key = this.groupKey(group)
          nextExpandedGroups[key] = Object.prototype.hasOwnProperty.call(this.expandedGroups, key)
            ? this.expandedGroups[key]
            : defaultExpanded
        })
        this.expandedGroups = nextExpandedGroups
      }
    }
  },

  computed: {
    startedAtLabel() {
      if (!this.startedAt)
        return ''

      const date = new Date(this.startedAt)
      if (Number.isNaN(date.getTime()))
        return ''

      return date.toLocaleTimeString()
    },

    inProgressLabel() {
      const key = this.runScope === 'programmatic'
        ? 'auditQa.runInProgressProgrammatic'
        : this.runScope === 'ai'
          ? 'auditQa.runInProgressAi'
          : 'auditQa.runInProgress'

      return this.startedAtLabel
        ? $t(`${key}`, { time: this.startedAtLabel })
        : $t(`${key}NoTime`)
    },

    showOutdatedBanner() {
      return this.outdated && !this.dismissedOutdated
    },

    progressView() {
      if (!this.progress)
        return null

      if (this.progress.phase === 'catalog') {
        const total = this.progress.catalogTotal || 0
        return {
          ratio: total ? (this.progress.catalogDone || 0) / total : 1,
          label: $t('vulnerabilityQa.progressCatalog', {
            done: this.progress.catalogDone || 0,
            total: total
          }),
          reusedLabel: ''
        }
      }

      const total = this.progress.total || 0
      return {
        ratio: total ? (this.progress.processed || 0) / total : 0,
        label: $t('vulnerabilityQa.progressTemplates', {
          processed: this.progress.processed || 0,
          total: total
        }),
        reusedLabel: this.progress.reused
          ? $t('vulnerabilityQa.reusedCached', { count: this.progress.reused })
          : ''
      }
    },

    qaChecks() {
      return this.$settings?.ai?.public?.qaChecks || {}
    },

    programmaticActionVisible() {
      return this.showProgrammaticAction &&
        hasAnyProgrammaticQaCheckEnabled(this.qaChecks)
    },

    aiActionVisible() {
      return this.showAiAction &&
        hasAnyAiQaCheckEnabled(this.qaChecks)
    },

    allActionVisible() {
      return this.showAllAction &&
        this.programmaticActionVisible &&
        this.aiActionVisible
    },

    previousRunEntries() {
      if (this.programmaticRanAt || this.aiRanAt) {
        return buildPreviousRunEntries({
          programmaticRanAt: this.programmaticRanAt,
          aiRanAt: this.aiRanAt
        })
      }

      return []
    },

    hasRunActions() {
      return this.programmaticActionVisible ||
        this.aiActionVisible ||
        this.allActionVisible
    },

    showRerunAction() {
      return this.hasRunActions && (!this.rerunOnlyWhenOutdated || this.outdated)
    },

    // "Run again" repeats the last run's scope when it is still available, so a
    // programmatic-only review never silently escalates to AI checks.
    defaultRunScope() {
      if (this.runScope === 'programmatic' && this.programmaticActionVisible)
        return 'programmatic'
      if (this.runScope === 'ai' && this.aiActionVisible)
        return 'ai'
      if (this.runScope === 'all' && this.allActionVisible)
        return 'all'
      if (this.allActionVisible)
        return 'all'
      return this.programmaticActionVisible ? 'programmatic' : 'ai'
    },

    runScopeChoices() {
      const choices = []
      if (this.programmaticActionVisible)
        choices.push({ scope: 'programmatic', label: $t('auditQa.runProgrammatic') })
      if (this.aiActionVisible)
        choices.push({ scope: 'ai', label: $t('auditQa.runAi') })
      if (this.allActionVisible)
        choices.push({ scope: 'all', label: $t('auditQa.runAll') })
      return choices
    },

    // "Run again" main button shows the last run's scope; the dropdown offers the others.
    runAgainLabel() {
      return $t('auditQa.runAgainScoped', { scope: this.scopeLabel(this.defaultRunScope) })
    },

    otherRunScopeChoices() {
      return this.runScopeChoices
        .filter((choice) => choice.scope !== this.defaultRunScope)
        .map((choice) => ({
          scope: choice.scope,
          label: $t('auditQa.runAgainScoped', { scope: this.scopeLabel(choice.scope) })
        }))
    },

    statusFilterOptions() {
      return [
        { value: 'active', label: $t('vulnerabilityQa.filterActive') },
        { value: 'outdated', label: $t('vulnerabilityQa.filterOutdated'), count: this.statusCounts.outdated },
        { value: 'resolved', label: $t('vulnerabilityQa.filterResolved'), count: this.statusCounts.resolved },
        { value: 'all', label: $t('vulnerabilityQa.filterAllStatus') }
      ]
    },

    showGroupToggle() {
      return this.hasReportData && this.groupedIssues.length > 1
    },

    allGroupsExpanded() {
      return this.groupedIssues.length > 0 && this.groupedIssues.every((group) =>
        this.expandedGroups[this.groupKey(group)] === true
      )
    },

    groupToggleIcon() {
      return this.allGroupsExpanded ? 'unfold_less' : 'unfold_more'
    },

    groupToggleLabel() {
      return $t(this.allGroupsExpanded ? 'collapseAll' : 'expandAll')
    }
  },

  methods: {
    scopeLabel(scope) {
      if (scope === 'programmatic')
        return $t('auditQa.scopeProgrammatic')
      if (scope === 'ai')
        return $t('auditQa.scopeAi')
      return $t('auditQa.scopeAll')
    },

    groupKey(group) {
      return String(group.key || group.label)
    },

    toggleAllGroups() {
      const expanded = !this.allGroupsExpanded
      const nextExpandedGroups = { ...this.expandedGroups }
      this.groupedIssues.forEach((group) => {
        nextExpandedGroups[this.groupKey(group)] = expanded
      })
      this.expandedGroups = nextExpandedGroups
    },

    groupIssueCount(group) {
      // Expand heuristic always counts issues (not rows) regardless of the badge mode.
      return countGroupEntries(group, false)
    },

    setGroupExpanded(group, expanded) {
      this.expandedGroups = {
        ...this.expandedGroups,
        [this.groupKey(group)]: expanded
      }
    },

    // Group-header navigation has no row; keep the single-argument emit shape for it.
    forwardNavigate(location, row) {
      if (row === undefined)
        this.$emit('navigate', location)
      else
        this.$emit('navigate', location, row)
    },

    dismissOutdated() {
      this.dismissedOutdated = true
    },

    setSeverityFilter(filter) {
      this.$emit('update:severityFilter', filter)
    }
  }
}
</script>

<style scoped>
.qa-results-panel {
  min-width: 0;
  height: 100%;
  user-select: none;
  caret-color: transparent;
}

.qa-results-panel :deep(.q-toolbar__title),
.qa-results-panel :deep(.q-item__section) {
  min-width: 0;
}

.qa-results-panel :deep(.q-toolbar__title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qa-results-panel :deep(.q-item__label) {
  overflow-wrap: anywhere;
}

/* The panel suppresses text selection/caret to behave like a docked toolbar; the filter
   input is a real text field, so restore both for it (and let it receive focus — the
   @mousedown.stop on the input keeps the section's focus-guard from eating the click). */
.qa-results-panel :deep(.qa-text-filter input) {
  caret-color: auto;
  user-select: text;
}

.qa-run-progress {
  flex: 0 0 auto;
}

.qa-run-inprogress {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 500;
  color: #1976d2;
}

/* Keep the previous report visible but clearly de-emphasised while a run is in flight. */
.qa-results-panel--running .qa-groups {
  opacity: 0.5;
  transition: opacity 0.15s;
}

.qa-run-meta {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 6px 8px;
  background: #fafafa;
}

.qa-run-meta__heading {
  font-size: 0.72rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}

.qa-run-meta__line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #616161;
  min-width: 0;
}

.qa-run-meta__line + .qa-run-meta__line {
  margin-top: 2px;
}

.qa-run-meta__icon {
  flex-shrink: 0;
  color: #757575;
  align-self: center;
}

.qa-run-meta__label {
  font-weight: 500;
  color: #424242;
}

.qa-run-meta__date {
  color: #757575;
  overflow-wrap: anywhere;
}

.qa-run-meta__date::before {
  content: '·';
  margin-right: 4px;
}

.qa-stat {
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
  background: #f5f5f5;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s, background 0.15s;
}

.qa-stat:hover {
  background: #eee;
}

.qa-stat--active {
  border-color: currentColor;
  background: #fff;
}

.qa-stat--error.qa-stat--active {
  border-color: #c10015;
}

.qa-stat--warning.qa-stat--active {
  border-color: #f2c037;
}

.qa-stat--info.qa-stat--active {
  border-color: #31ccec;
}

.qa-stat--total.qa-stat--active {
  border-color: #1976d2;
}

.qa-stat__value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.qa-stat__label {
  font-size: 0.75rem;
  color: #666;
  margin-top: 4px;
}

.qa-stat--error .qa-stat__value {
  color: #c10015;
}

.qa-stat--warning .qa-stat__value {
  color: #f2c037;
}

.qa-stat--info .qa-stat__value {
  color: #31ccec;
}

.qa-stat--total .qa-stat__value {
  color: #1976d2;
}

.qa-groups {
  min-height: 0;
  overflow-y: auto;
}

.qa-group__header {
  background: #f7f7f7;
}

.qa-issue {
  align-items: flex-start;
}
</style>

<style>
.body--dark .qa-run-meta {
  border-color: #444;
  background: #2a2a2a;
}

.body--dark .qa-run-meta__heading,
.body--dark .qa-run-meta__label {
  color: #e0e0e0;
}

.body--dark .qa-run-meta__line {
  color: #bdbdbd;
}

.body--dark .qa-run-meta__icon,
.body--dark .qa-run-meta__date {
  color: #9e9e9e;
}

.body--dark .qa-stat {
  background: #2a2a2a;
}

.body--dark .qa-stat:hover {
  background: #333333;
}

.body--dark .qa-stat--active {
  background: #1d1d1d;
}

.body--dark .qa-stat__label {
  color: #bdbdbd;
}

.body--dark .qa-group__header {
  background: #262626;
}

.body--dark .qa-group__count {
  background: #424242 !important;
  color: #ffffff !important;
}

.body--dark .qa-run-inprogress {
  color: #90caf9;
}

.body--dark .qa-top-banner {
  background: #2a2a2a !important;
  color: #e0e0e0 !important;
}
</style>
