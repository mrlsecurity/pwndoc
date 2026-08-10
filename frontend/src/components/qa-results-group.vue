<template>
  <q-expansion-item
  :model-value="expanded"
  header-class="qa-group__header"
  expand-icon-class="text-grey-7"
  @update:model-value="$emit('update:expanded', $event)"
  >
    <template v-slot:header>
      <q-item-section>
        <q-item-label>{{ group.label }}</q-item-label>
      </q-item-section>
      <q-item-section v-if="showGroupNavigation" side>
        <q-btn
        outline
        dense
        no-caps
        color="primary"
        :label="$t('auditQa.goToSection')"
        icon-right="chevron_right"
        @click.stop="$emit('navigate', group.issues[0].location)"
        />
      </q-item-section>
      <q-item-section side>
        <q-badge class="qa-group__count" color="grey-4" text-color="grey-9">{{ issueCount }}</q-badge>
      </q-item-section>
    </template>

    <!-- The body is only rendered while expanded: collapsed groups cost nothing, which is
         what keeps large reports (hundreds of rows) responsive. Long lists render in
         chunks behind a "show more" button for the same reason. -->
    <template v-if="expanded">
      <!-- Category groups: one row per finding/vulnerability aggregating every issue it
           has, with the row-level actions (navigate / recheck). -->
      <q-list v-if="group.findingRows" separator class="q-ma-sm">
        <q-card
        v-for="row in visibleRows"
        :key="row.key"
        flat
        bordered
        class="q-mb-sm qa-finding-row"
        :class="{ 'qa-finding-row--resolved': row.resolved }"
        >
          <q-item class="qa-finding-row__header">
            <q-item-section>
              <q-item-label class="text-weight-medium">
                {{ row.title }}
                <q-badge
                v-if="row.resolved"
                color="positive"
                text-color="white"
                class="q-ml-xs"
                >{{ $t('vulnerabilityQa.resolvedLabel') }}</q-badge>
                <q-badge
                v-else-if="row.outdated"
                color="orange"
                text-color="white"
                class="q-ml-xs"
                >{{ $t('vulnerabilityQa.rowOutdated') }}</q-badge>
              </q-item-label>
            </q-item-section>
            <q-item-section v-if="showNavigation || showRecheck || showRowResolve" side>
              <div class="row no-wrap items-center q-gutter-xs">
                <q-btn
                v-if="showRecheck"
                data-testid="qa-recheck-row"
                outline
                dense
                color="primary"
                icon="refresh"
                :loading="recheckingKeys.includes(row.key)"
                :disable="running || !row.outdated"
                @click="$emit('recheck', row)"
                >
                  <q-tooltip>{{ row.outdated ? $t('vulnerabilityQa.recheckHint') : $t('vulnerabilityQa.recheckUpToDate') }}</q-tooltip>
                </q-btn>
                <q-btn
                v-if="showRowResolve"
                data-testid="qa-resolve-row"
                outline
                dense
                :color="row.resolved ? 'positive' : 'grey-7'"
                :icon="row.resolved ? 'undo' : 'check'"
                :loading="resolvingRowKeys.includes(row.key)"
                :disable="running"
                @click="$emit('resolve-row', row)"
                >
                  <q-tooltip>{{ row.resolved ? $t('vulnerabilityQa.unresolve') : $t('vulnerabilityQa.resolve') }}</q-tooltip>
                </q-btn>
                <q-btn
                v-if="showNavigation"
                outline
                dense
                no-caps
                color="primary"
                :label="rowNavigationLabel"
                icon-right="chevron_right"
                @click="$emit('navigate', row.issues[0].location, row)"
                />
              </div>
            </q-item-section>
          </q-item>
          <q-separator />
          <q-list separator>
            <q-item
            v-for="(issue, index) in row.issues"
            :key="`${issue.location}:${issue.title}:${index}`"
            class="qa-issue"
            :class="{ 'qa-issue--dismissed': issue.dismissed }"
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
                  <span v-if="issue.dismissed"> · {{ $t('vulnerabilityQa.resolvedLabel') }}</span>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>

        <q-btn
        v-if="hiddenRowCount > 0"
        data-testid="qa-group-show-more"
        flat
        no-caps
        color="primary"
        class="full-width q-mb-sm"
        :label="$t('auditQa.showMore', { count: hiddenRowCount })"
        @click="showMore"
        />
      </q-list>

      <!-- Flat groups: report / general / network / sections / catalog — plain issue rows,
           no per-issue button (the group header carries the single action). -->
      <q-card v-else flat bordered class="q-ma-sm">
        <q-list separator>
          <q-item
          v-for="(issue, index) in visibleIssues"
          :key="`${issue.location}:${issue.title}:${index}`"
          class="qa-issue"
          :class="{ 'qa-issue--dismissed': issue.dismissed }"
          >
            <q-item-section avatar top>
              <q-icon :name="severityIcon(issue.severity)" :color="severityColor(issue.severity)" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ issue.title }}</q-item-label>
              <q-item-label caption>{{ issue.message }}</q-item-label>
              <!-- Cross-template issues (duplicates, translations) link every involved
                   template so the reviewer can open them directly. -->
              <div v-if="issue.linkedTemplates && issue.linkedTemplates.length" class="q-mt-xs">
                <q-chip
                v-for="entry in issue.linkedTemplates"
                :key="entry.id"
                data-testid="qa-linked-template"
                clickable
                dense
                size="sm"
                color="grey-3"
                text-color="grey-9"
                icon-right="chevron_right"
                @click="$emit('navigate', issue.location, { findingId: entry.id })"
                >{{ entry.title }}</q-chip>
              </div>
              <q-item-label caption class="q-mt-xs text-grey-7">
                {{ categoryLabel(issue.category) }}
                <span v-if="issue.source === 'ai'"> · {{ $t('auditQa.aiReview') }}</span>
                <span v-if="issue.dismissed"> · {{ $t('vulnerabilityQa.resolvedLabel') }}</span>
              </q-item-label>
            </q-item-section>
            <q-item-section v-if="showDismissActions && issue.key" side top>
              <q-btn
              data-testid="qa-dismiss-issue"
              flat
              round
              dense
              size="sm"
              :color="issue.dismissed ? 'positive' : 'grey-7'"
              :icon="issue.dismissed ? 'undo' : 'check'"
              :loading="dismissingKeys.includes(issue.key)"
              :disable="running"
              @click="$emit('dismiss', issue)"
              >
                <q-tooltip>{{ issue.dismissed ? $t('vulnerabilityQa.unresolve') : $t('vulnerabilityQa.resolveIssue') }}</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>

        <q-btn
        v-if="hiddenIssueCount > 0"
        data-testid="qa-group-show-more"
        flat
        no-caps
        color="primary"
        class="full-width"
        :label="$t('auditQa.showMore', { count: hiddenIssueCount })"
        @click="showMore"
        />
      </q-card>
    </template>
  </q-expansion-item>
</template>

<script>
import { $t } from '@/boot/i18n'
import { countGroupEntries } from '@/services/qa-display'

// How many rows/issues a group renders initially and how many each "show more" adds.
const INITIAL_CHUNK = 20
const CHUNK_INCREMENT = 50

// One QA issue group. Split out of qa-results-panel so that toggling, filtering or
// progress updates only re-render the groups whose props actually changed instead of
// the whole report, and so collapsed groups keep zero DOM.
export default {
  name: 'QaResultsGroup',

  props: {
    group: {
      type: Object,
      required: true
    },
    expanded: {
      type: Boolean,
      default: false
    },
    showNavigation: {
      type: Boolean,
      default: false
    },
    showRecheck: {
      type: Boolean,
      default: false
    },
    recheckingKeys: {
      type: Array,
      default: () => []
    },
    // Whole-vulnerability resolve action on findingRows groups; keys currently being
    // resolved show a spinner.
    showRowResolve: {
      type: Boolean,
      default: false
    },
    resolvingRowKeys: {
      type: Array,
      default: () => []
    },
    showDismissActions: {
      type: Boolean,
      default: false
    },
    dismissingKeys: {
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
    running: {
      type: Boolean,
      default: false
    }
  },

  emits: ['update:expanded', 'navigate', 'recheck', 'dismiss', 'resolve-row'],

  data() {
    return {
      visibleCount: INITIAL_CHUNK
    }
  },

  watch: {
    // Collapsing resets the chunk so re-expanding (or expand-all) stays cheap.
    expanded(isExpanded) {
      if (!isExpanded)
        this.visibleCount = INITIAL_CHUNK
    }
  },

  computed: {
    showGroupNavigation() {
      return this.showNavigation &&
        !this.group.findingRows &&
        this.group.key !== 'report' &&
        this.group.key !== 'catalog'
    },

    issueCount() {
      return countGroupEntries(this.group, this.countRows)
    },

    visibleRows() {
      return (this.group.findingRows || []).slice(0, this.visibleCount)
    },

    hiddenRowCount() {
      return Math.max(0, (this.group.findingRows || []).length - this.visibleCount)
    },

    visibleIssues() {
      return (this.group.issues || []).slice(0, this.visibleCount)
    },

    hiddenIssueCount() {
      return Math.max(0, (this.group.issues || []).length - this.visibleCount)
    }
  },

  methods: {
    showMore() {
      this.visibleCount += CHUNK_INCREMENT
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
.qa-issue--dismissed {
  opacity: 0.55;
}

.qa-finding-row--resolved {
  opacity: 0.75;
}

/* Keep the vulnerability header (title + actions) visible while its issue list scrolls,
   so a vuln with many issues stays identifiable. Sticky within the .qa-groups scroll
   area; overflow must be visible on the card for the header to detach from it. */
.qa-finding-row {
  overflow: visible;
}

.qa-finding-row__header {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
}
</style>

<style>
.body--dark .qa-finding-row__header {
  background: #1d1d1d;
}
</style>
