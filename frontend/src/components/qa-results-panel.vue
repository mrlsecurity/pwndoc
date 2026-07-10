<template>
  <div class="qa-results-panel column full-height" :class="{ 'qa-results-panel--running': running }">
    <q-toolbar class="bg-grey-3" @mousedown.prevent>
      <q-icon name="fas fa-list-check" size="sm" class="q-mr-sm" />
      <q-toolbar-title class="text-subtitle1">{{ title }}</q-toolbar-title>
      <q-btn icon="close" flat round dense @click="$emit('close')" />
    </q-toolbar>

    <q-linear-progress v-if="running" indeterminate color="primary" class="qa-run-progress" />

    <q-card-section v-if="loading" class="text-center q-py-xl col" @mousedown.prevent>
      <q-spinner color="primary" size="3em" />
      <div class="q-mt-md text-grey-7">{{ runningLabel }}</div>
    </q-card-section>

    <template v-else>
      <q-card-section class="col-auto q-pb-none" @mousedown.prevent>
        <div v-if="running" class="qa-run-inprogress q-mb-md">
          <q-spinner-dots color="primary" size="20px" class="q-mr-sm" />
          <span>{{ inProgressLabel }}</span>
        </div>

        <q-banner v-if="topBanner" dense rounded class="bg-blue-grey-1 text-grey-9 q-mb-md">
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

        <div v-if="hasRunActions" class="column q-gutter-sm q-mb-md">
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

        <template v-if="hasReportData">
          <q-banner
          v-if="showOutdatedBanner"
          dense
          rounded
          class="bg-orange-1 text-orange-10 q-mb-md qa-outdated-banner"
          >
            {{ $t('auditQa.outdatedBanner') }}
            <template v-slot:action>
              <q-btn flat dense round icon="close" @click="dismissOutdated" />
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

          <div v-if="summary" class="qa-summary q-mb-md">{{ summary }}</div>
        </template>
      </q-card-section>

      <template v-if="hasReportData">
        <q-separator />

        <q-card-section class="qa-groups col q-pa-none" @mousedown.prevent>
          <div v-if="!groupedIssues.length" class="text-center text-grey-6 q-pa-lg">
            {{ $t('auditQa.noIssues') }}
          </div>

          <q-list v-else separator>
            <q-expansion-item
            v-for="group in groupedIssues"
            :key="group.label"
            default-opened
            header-class="qa-group__header"
            expand-icon-class="text-grey-7"
            >
              <template v-slot:header>
                <q-item-section>
                  <q-item-label>{{ group.label }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge class="qa-group__count" color="grey-4" text-color="grey-9">{{ group.issues.length }}</q-badge>
                </q-item-section>
              </template>
              <q-card flat bordered class="q-ma-sm">
                <q-list separator>
                  <q-item
                  v-for="(issue, index) in group.issues"
                  :key="`${issue.location}:${issue.title}:${index}`"
                  class="qa-issue"
                  >
                    <q-item-section avatar top>
                      <q-icon :name="severityIcon(issue.severity)" :color="severityColor(issue.severity)" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-weight-medium">{{ issue.title }}</q-item-label>
                      <q-item-label caption>{{ issue.message }}</q-item-label>
                      <q-item-label caption class="q-mt-xs text-grey-7">
                        {{ categoryLabel(issue.category) }}
                        <span v-if="issue.source === 'ai'"> · {{ $t('auditQa.aiReview') }}</span>
                      </q-item-label>
                    </q-item-section>
                    <q-item-section v-if="showNavigation" side top>
                      <q-btn
                      outline
                      dense
                      no-caps
                      color="primary"
                      :label="navigationLabel(issue)"
                      icon-right="chevron_right"
                      @click="$emit('navigate', issue)"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card>
            </q-expansion-item>
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
import { buildPreviousRunEntries } from '@/services/qa-display'

export default {
  name: 'QaResultsPanel',

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
    runningLabel: {
      type: String,
      default: () => $t('auditQa.running')
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
    summary: {
      type: String,
      default: ''
    },
    aiUnavailableMessages: {
      type: Array,
      default: () => []
    },
    showNavigation: {
      type: Boolean,
      default: false
    },
    navigationLabel: {
      type: Function,
      default: () => ''
    }
  },

  emits: ['close', 'run', 'update:severityFilter', 'navigate'],

  data() {
    return {
      dismissedOutdated: false
    }
  },

  watch: {
    loading(isLoading, wasLoading) {
      if (wasLoading && !isLoading)
        this.dismissedOutdated = false
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
      return this.startedAtLabel
        ? $t('auditQa.runInProgress', { time: this.startedAtLabel })
        : $t('auditQa.runInProgressNoTime')
    },

    showOutdatedBanner() {
      return this.outdated && !this.dismissedOutdated
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
    }
  },

  methods: {
    dismissOutdated() {
      this.dismissedOutdated = true
    },

    setSeverityFilter(filter) {
      this.$emit('update:severityFilter', filter)
    },

    severityColor(severity) {
      if (severity === 'error')
        return 'negative'
      if (severity === 'warning')
        return 'warning'
      return 'info'
    },

    severityIcon(severity) {
      if (severity === 'error')
        return 'error'
      if (severity === 'warning')
        return 'warning'
      return 'info'
    },

    categoryLabel(category) {
      const labels = {
        completeness: $t('auditQa.category.completeness'),
        redaction: $t('auditQa.category.redaction'),
        customer: $t('auditQa.category.customer'),
        instructions: $t('auditQa.category.instructions'),
        references: $t('auditQa.category.references'),
        imageCaptions: $t('auditQa.category.imageCaptions'),
        duplicates: $t('auditQa.category.duplicates'),
        aiDuplicates: $t('auditQa.category.aiDuplicates'),
        aiUnlinkedTranslations: $t('auditQa.category.aiUnlinkedTranslations'),
        other: $t('auditQa.category.other')
      }
      return labels[category] || labels.other
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

.qa-summary {
  font-size: 0.85rem;
  line-height: 1.4;
  color: #424242;
  overflow-wrap: anywhere;
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
.qa-results-panel--running .qa-groups,
.qa-results-panel--running .qa-summary {
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

.body--dark .qa-summary {
  color: #e0e0e0;
}

.body--dark .qa-run-inprogress {
  color: #90caf9;
}
</style>
