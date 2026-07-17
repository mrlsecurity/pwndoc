import { Dialog, Notify } from 'quasar';
import { Cvss3P1, Cvss4P0 } from 'ae-cvss-calculator'

import BasicEditor from 'components/editor/Editor.vue';
import Cvss3Calculator from 'components/cvss3calculator'
import Cvss4Calculator from 'components/cvss4calculator'
import TextareaArray from 'components/textarea-array'
import CustomFields from 'components/custom-fields'
import DraftRecoveryStatus from 'components/draft-recovery-status.vue'

import VulnerabilityService from '@/services/vulnerability'
import DataService from '@/services/data'
import AiService from '@/services/ai'
import AiFieldHelper from '@/services/ai-field-helper'
import { useAiGenerationStore } from '@/stores/ai-generation'
import { useQaRunsStore } from '@/stores/qa-runs'
import { useVulnQaStore } from '@/stores/vuln-qa'
import { useUserStore } from 'src/stores/user'
import Utils from '@/services/utils'
import { createDraftRecovery } from '@/composables/useDraftRecovery'
import DraftRecoveryService from '@/services/draft-recovery'
import VulnerabilityQaPanel from '@/components/vulnerability-qa-panel.vue'
import VulnerabilityQaAllPanel from '@/components/vulnerability-qa-all-panel.vue'
import AiChatDrawer from '@/components/ai-chat-drawer.vue'
import { hasAnyQaCheckEnabled } from '@/services/qa-checks'

import { $t } from 'boot/i18n'

const userStore = useUserStore()

// Memoized CVSS parsing per row object — rows are replaced on each list reload so
// stale entries are garbage collected with them.
const cvssCacheByRow = new WeakMap()

export default {
    data: () => {
        return {
            userStore: userStore,
            // Vulnerabilities list
            vulnerabilities: [],
            // Loading state
            loading: true,
            // List pagination
            pagination: {
                page: 1,
                rowsPerPage: 25,
                sortBy: 'title'
            },
            sortDesc: false,
            rowsPerPageOptions: [
                {label:'25', value:25},
                {label:'50', value:50},
                {label:'100', value:100},
                {label:'All', value:0}
            ],
            // Vulnerabilities languages
            languages: [],
            locale: '',
            // Search filter
            search: {title: '', categories: [], types: [], cvssRange: 'all', creator: null, unsavedOnly: false},
            // Text filters for the option lists inside the filter popover
            categoryFilterSearch: '',
            typeFilterSearch: '',
            // Status filter (single-select): all | valid | new | updates
            statusFilter: 'all',
            // Errors messages
            errors: {title: ''},
            // Selected or New Vulnerability
            currentVulnerability: {
                cvssv3: '',
                cvssv4: '',
                priority: '',
                remediationComplexity: '',
                details: []
            },
            currentVulnerabilityOrig: null,
            currentLanguage: "",
            dtLanguage: "",
            currentDetailsIndex: 0,
            vulnerabilityId: '',
            vulnUpdates: [],
            currentUpdate: '',
            currentUpdateLocale: '',
            vulnTypes: [],
            // Merge languages
            mergeLanguageLeft: '',
            mergeLanguageRight: '',
            mergeSearchLeft: '',
            mergeSearchRight: '',
            mergeVulnLeft: '',
            mergeVulnRight: '',
            // Vulnerability categories
            vulnCategories: [],
            currentCategory: null,
            // Custom Fields
            customFields: [],
            draftRecovery: null,
            draftRecoveryPaused: false,
            vulnerabilityDrafts: [],
            aiPromptFieldKeys: [],
            aiFieldPrompts: [],
            // Content displayed in the detail pane: null | create | edit | updates | merge
            activePane: null,
            vulnQaOpen: false
        }
    },

    components: {
        BasicEditor,
        Cvss3Calculator,
        Cvss4Calculator,
        TextareaArray,
        CustomFields,
        DraftRecoveryStatus,
        AiChatDrawer,
        VulnerabilityQaPanel,
        VulnerabilityQaAllPanel
    },

    mounted: function() {
        this.getLanguages()
        this.getVulnTypes()
        this.getVulnerabilities()
        this.getVulnerabilityCategories()
        this.getCustomFields()
        this.setupDraftRecovery()
        this.refreshVulnerabilityDrafts()
        this.loadAiEnabledFieldKeys()
        this.setupVulnQaSocket()
    },

    unmounted: function() {
        if (this.draftRecovery)
            this.draftRecovery.stop()
        this.teardownVulnQaSocket()
    },

    watch: {
        currentLanguage: function(val, oldVal) {
            this.setCurrentDetails();
        },
        // The QA-all panel is per-locale: switching the list language re-attaches it (and
        // any in-flight job/state) to the newly selected locale.
        dtLanguage: function(val) {
            const vulnQaStore = useVulnQaStore()
            if (vulnQaStore.panelOpen && vulnQaStore.locale !== val)
                vulnQaStore.open(val)
        },
        draftRecoveryRevision: function() {
            this.refreshVulnerabilityDrafts()
        },
        filteredRowsCount: function() {
            // Keep the current page within bounds when filters shrink the list
            if (this.pagination.page > this.pagesNumber)
                this.pagination.page = Math.max(1, this.pagesNumber)
        },
        'pagination.rowsPerPage': function() {
            this.pagination.page = 1
        }
    },

    computed: {
        vulnTypesLang: function() {
            return this.vulnTypes.filter(type => type.locale === this.currentLanguage);
        },

        computedVulnerabilities: function() {
            var result = [];
            this.vulnerabilities.forEach(vuln => {
                for (var i=0; i<vuln.details.length; i++) {
                    if (vuln.details[i].locale === this.dtLanguage && vuln.details[i].title) {
                        result.push(vuln);
                    }
                }
            })
            return result;
        },

        statusCounts: function() {
            var counts = {all: this.computedVulnerabilities.length, valid: 0, new: 0, updates: 0}
            this.computedVulnerabilities.forEach(vuln => {
                if (vuln.status === 1)
                    counts.new += 1
                else if (vuln.status === 2)
                    counts.updates += 1
                else
                    counts.valid += 1
            })
            return counts
        },

        filteredVulnerabilities: function() {
            return this.customFilter(this.computedVulnerabilities, {...this.search, status: this.statusFilter})
        },

        filteredRowsCount: function() {
            return this.filteredVulnerabilities.length
        },

        sortedVulnerabilities: function() {
            return this.customSort(this.filteredVulnerabilities, this.pagination.sortBy, this.sortDesc)
        },

        pagesNumber: function() {
            if (!this.pagination.rowsPerPage)
                return 1
            return Math.max(1, Math.ceil(this.filteredRowsCount / this.pagination.rowsPerPage))
        },

        paginatedVulnerabilities: function() {
            if (!this.pagination.rowsPerPage)
                return this.sortedVulnerabilities
            var start = (this.pagination.page - 1) * this.pagination.rowsPerPage
            return this.sortedVulnerabilities.slice(start, start + this.pagination.rowsPerPage)
        },

        paginationRangeLabel: function() {
            if (this.filteredRowsCount === 0)
                return '0 - 0'
            if (!this.pagination.rowsPerPage)
                return `1 - ${this.filteredRowsCount}`
            var start = (this.pagination.page - 1) * this.pagination.rowsPerPage + 1
            var end = Math.min(this.filteredRowsCount, start + this.pagination.rowsPerPage - 1)
            return `${start} - ${end}`
        },

        activeFilterCount: function() {
            var count = 0
            if (this.search.categories.length > 0)
                count += 1
            if (this.search.types.length > 0)
                count += 1
            if (this.search.cvssRange !== 'all')
                count += 1
            if (this.search.creator)
                count += 1
            if (this.search.unsavedOnly)
                count += 1
            return count
        },

        unsavedChangesCount: function() {
            return this.computedVulnerabilities.filter(vuln =>
                this.hasDraftForVulnerability(vuln._id)
            ).length
        },

        categoryFacets: function() {
            var counts = {}
            this.computedVulnerabilities.forEach(vuln => {
                var name = vuln.category || 'No Category'
                counts[name] = (counts[name] || 0) + 1
            })
            var term = (this.categoryFilterSearch || '').toLowerCase()
            return this.vulnCategoriesOptions
                .filter(name => !term || name.toLowerCase().indexOf(term) > -1)
                .map(name => ({name: name, count: counts[name] || 0}))
        },

        typeFacets: function() {
            var counts = {}
            this.computedVulnerabilities.forEach(vuln => {
                var name = this.getDtType(vuln)
                counts[name] = (counts[name] || 0) + 1
            })
            var term = (this.typeFilterSearch || '').toLowerCase()
            return this.vulnTypeOptions
                .filter(name => !term || name.toLowerCase().indexOf(term) > -1)
                .map(name => ({name: name, count: counts[name] || 0}))
        },

        cvssFacets: function() {
            var counts = {all: this.computedVulnerabilities.length, low: 0, medium: 0, high: 0, critical: 0}
            this.computedVulnerabilities.forEach(vuln => {
                var bucket = this.getCvssBucket(vuln)
                if (bucket)
                    counts[bucket] += 1
            })
            return [
                {value: 'all', label: $t('all'), count: counts.all},
                {value: 'low', label: `0 – 3.9 (${$t('low')})`, count: counts.low},
                {value: 'medium', label: `4 – 6.9 (${$t('medium')})`, count: counts.medium},
                {value: 'high', label: `7 – 8.9 (${$t('high')})`, count: counts.high},
                {value: 'critical', label: `9 – 10 (${$t('critical')})`, count: counts.critical}
            ]
        },

        creatorOptions: function() {
            var names = new Set()
            this.vulnerabilities.forEach(vuln => {
                if (vuln.creator && vuln.creator.username)
                    names.add(vuln.creator.username)
            })
            return Array.from(names).sort((a, b) => a.localeCompare(b))
        },

        sortLabel: function() {
            var fieldLabels = {title: $t('title'), category: $t('category'), lastModified: $t('lastModified')}
            var direction
            if (this.pagination.sortBy === 'lastModified')
                direction = this.sortDesc ? $t('oldestFirst') : $t('newestFirst')
            else
                direction = this.sortDesc ? 'Z → A' : 'A → Z'
            return `${fieldLabels[this.pagination.sortBy] || this.pagination.sortBy} (${direction})`
        },

        vulnCategoriesOptions: function() {
            var result = this.vulnCategories.map(cat => {return cat.name})
            result.unshift('No Category')
            return result
        },

        vulnTypeOptions: function() {
            var result = this.vulnTypes.filter(type => type.locale === this.dtLanguage).map(type => {return type.name})
            result.unshift('Undefined')
            return result
        },

        filteredVulnerabilitiesMergeLeft: function() {
            const search = (this.mergeSearchLeft || '').trim().toLowerCase()
            return this.vulnerabilities.filter(vuln =>
                this.getVulnTitleLocale(vuln, this.mergeLanguageRight) === 'undefined' &&
                this.getVulnTitleLocale(vuln, this.mergeLanguageLeft) !== 'undefined' &&
                (!search || this.getVulnTitleLocale(vuln, this.mergeLanguageLeft).toLowerCase().includes(search))
            )
        },

        filteredVulnerabilitiesMergeRight: function() {
            const search = (this.mergeSearchRight || '').trim().toLowerCase()
            return this.vulnerabilities.filter(vuln =>
                this.getVulnTitleLocale(vuln, this.mergeLanguageLeft) === 'undefined' &&
                this.getVulnTitleLocale(vuln, this.mergeLanguageRight) !== 'undefined' &&
                (!search || this.getVulnTitleLocale(vuln, this.mergeLanguageRight).toLowerCase().includes(search))
            )
        },

        draftRecoveryRevision: function() {
            return DraftRecoveryService.state.revision
        },

        aiQaEnabled: function() {
            return this.$settings?.ai?.public?.enabled !== false &&
                userStore.isAllowed('vulnerabilities:ai-qa') &&
                hasAnyQaCheckEnabled(this.$settings?.ai?.public?.qaChecks)
        },

        aiQaAllEnabled: function() {
            return this.$settings?.ai?.public?.enabled !== false &&
                userStore.isAllowed('vulnerabilities:ai-qa-all') &&
                hasAnyQaCheckEnabled(this.$settings?.ai?.public?.qaChecks)
        },

        vulnerabilityQaCount: function() {
            return this.computedVulnerabilities.length
        },

        dtLanguageLabel: function() {
            return this.languages.find((entry) => entry.locale === this.dtLanguage)?.language || this.dtLanguage
        },

        aiEnabled: function() {
            return this.$settings?.ai?.public?.enabled !== false && (
                userStore.isAllowed('audits:ai-generate') ||
                userStore.isAllowed('vulnerabilities:ai-generate')
            )
        },

        aiDrawerOpen: function() {
            return useAiGenerationStore().drawerOpen
        },

        vulnQaAllOpen: function() {
            return useVulnQaStore().panelOpen
        },

        vulnQaAllRunning: function() {
            return useVulnQaStore().running
        },

        // The QA-all panel always renders as its own docked column (never inside a pane),
        // so navigating between vulnerabilities — which swaps the pane content — never
        // remounts it and the reviewer keeps their scroll position and expanded groups.
        vulnQaAllDockVisible: function() {
            return this.vulnQaAllOpen
        },

        // Run key for the QA panel of the vulnerability currently in the pane. Matches the
        // key computed inside vulnerability-qa-panel so the toolbar dot reflects its run even
        // when the panel is closed.
        activeVulnQaKey: function() {
            if (this.vulnerabilityId)
                return `vuln:${this.vulnerabilityId}:${this.currentLanguage}`
            return 'draft'
        },

        vulnQaRunning: function() {
            return useQaRunsStore().isRunning(this.activeVulnQaKey)
        },

        canUseAiInPane: function() {
            if (!this.aiEnabled)
                return false
            if (this.vulnerabilityId)
                return userStore.isAllowed('vulnerabilities:update')
            return userStore.isAllowed('vulnerabilities:create')
        }
    },

    methods: {
        // Get available languages
        getLanguages: function() {
            DataService.getLanguages()
            .then((data) => {
                this.languages = data.data.datas;
                if (this.languages.length > 0) {
                    this.dtLanguage = this.languages[0].locale;
                    this.cleanCurrentVulnerability();
                }
            })
            .catch((err) => {
                console.log(err)
            })
        },

         // Get available custom fields
         getCustomFields: function() {
            DataService.getCustomFields()
            .then((data) => {
                this.customFields = data.data.datas
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Vulnerabilities types
        getVulnTypes: function() {
            DataService.getVulnerabilityTypes()
            .then((data) => {
                this.vulnTypes = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get available vulnerability categories
        getVulnerabilityCategories: function() {
            DataService.getVulnerabilityCategories()
            .then((data) => {
                this.vulnCategories = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        getVulnerabilities: function() {
            this.loading = true
            VulnerabilityService.getVulnerabilities()
            .then((data) => {
                this.vulnerabilities = data.data.datas
                this.loading = false
            })
            .catch((err) => {
                console.log(err)
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        createVulnerability: function() {
            this.cleanErrors();
            var index = this.currentVulnerability.details.findIndex(obj => obj.title !== '');
            if (index < 0)
                this.errors.title = $t('err.titleRequired');

            if (this.errors.title)
                return;

            VulnerabilityService.createVulnerabilities([this.currentVulnerability])
            .then(() => {
                if (this.draftRecovery)
                    this.draftRecovery.clearDraft()
                this.getVulnerabilities();
                this.closePane();
                Notify.create({
                    message: $t('msg.vulnerabilityCreatedOk'),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        updateVulnerability: function() {
            this.cleanErrors();
            var index = this.currentVulnerability.details.findIndex(obj => obj.title !== '');
            if (index < 0)
                this.errors.title = $t('err.titleRequired');

            if (this.errors.title)
                return;

            VulnerabilityService.updateVulnerability(this.vulnerabilityId, this.currentVulnerability)
            .then(() => {
                if (this.draftRecovery)
                    this.draftRecovery.clearDraft()
                this.getVulnerabilities();
                this.closePane();
                Notify.create({
                    message: $t('msg.vulnerabilityUpdatedOk'),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        deleteVulnerability: function(vulnerabilityId) {
            VulnerabilityService.deleteVulnerability(vulnerabilityId)
            .then(() => {
                if (this.vulnerabilityId === vulnerabilityId)
                    this.closePane()
                this.getVulnerabilities();
                Notify.create({
                    message: $t('msg.vulnerabilityDeletedOk'),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        confirmDeleteVulnerability: function(row) {
            Dialog.create({
                title: $t('msg.confirmSuppression'),
                message: $t('msg.vulnerabilityWillBeDeleted'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => this.deleteVulnerability(row._id))
        },

        getVulnUpdates: function(vulnId) {
            VulnerabilityService.getVulnUpdates(vulnId)
            .then((data) => {
                this.vulnUpdates = data.data.datas;
                this.vulnUpdates.forEach(vuln => {
                    vuln.customFields = Utils.filterCustomFields('vulnerability', this.currentVulnerability.category, this.customFields, vuln.customFields, vuln.locale)
                })
                if (this.vulnUpdates.length > 0) {
                    this.currentUpdate = this.vulnUpdates[0]._id || null;
                    this.currentLanguage = this.vulnUpdates[0].locale || null;
                }
            })
            .catch((err) => {
                console.log(err)
            })
        },

        clone: function(row) {
            this.cleanCurrentVulnerability();

            this.currentVulnerability = this.$_.cloneDeep(row)
            this.setCurrentDetails();
            this.currentVulnerabilityOrig = this.$_.cloneDeep(this.currentVulnerability)

            this.vulnerabilityId = row._id;
            if (userStore.isAllowed('vulnerabilities:update'))
                this.getVulnUpdates(this.vulnerabilityId);
        },

        selectVulnerability: async function(row) {
            if (this.activePane && this.vulnerabilityId === row._id)
                return
            await this.openVulnerability(row)
        },

        openVulnerability: async function(row) {
            if (this.activePane)
                await this.cleanupCurrentVulnerability()

            this.clone(row)
            if (userStore.isAllowed('vulnerabilities:update') && row.status === 2)
                this.activePane = 'updates'
            else
                this.activePane = 'edit'
            this.scrollDetailToTop()
            await this.draftRecovery.maybePromptRecovery()
        },

        // Switching vulnerabilities swaps the pane content in place, which keeps the
        // previous scroll offset and lands the reader mid-form. Always reset to the top.
        // `detailScroll` is the active pane's scroll container (only one pane is mounted).
        scrollDetailToTop: function() {
            this.$nextTick(() => {
                this.$refs.detailScroll?.scrollTo({ top: 0 })
            })
        },

        openCreateVulnerability: async function(category) {
            if (this.activePane)
                await this.cleanupCurrentVulnerability()

            this.currentCategory = category ? this.$_.cloneDeep(category) : null
            this.vulnerabilityId = ''
            this.cleanCurrentVulnerability()
            this.currentVulnerabilityOrig = this.$_.cloneDeep(this.currentVulnerability)
            this.activePane = 'create'
            await this.draftRecovery.maybePromptRecovery()
        },

        openMergeVulnerabilities: async function() {
            if (this.activePane === 'merge')
                return
            if (this.activePane)
                await this.cleanupCurrentVulnerability()
            this.activePane = 'merge'
        },

        closePane: async function() {
            if (!this.activePane)
                return
            if (this.activePane === 'merge') {
                this.activePane = null
                return
            }
            await this.cleanupCurrentVulnerability()
            this.activePane = null
        },

        cleanupCurrentVulnerability: async function() {
            const aiStore = useAiGenerationStore()
            if (aiStore.isActive)
                aiStore.cancelSession({ force: true })
            this.vulnQaOpen = false
            // The unsaved-vulnerability QA run is tied to this pane session; drop it so the
            // next pane starts clean instead of showing a previous draft's results.
            useQaRunsStore().reset('draft')

            if (this.draftRecovery) {
                await this.draftRecovery.flushPendingWrite()
                this.draftRecovery.resetForKey()
            }
            this.draftRecoveryPaused = true
            this.vulnerabilityId = ''
            this.currentCategory = null
            this.cleanCurrentVulnerability()
            this.currentVulnerabilityOrig = this.$_.cloneDeep(this.currentVulnerability)
            await this.$nextTick()
            this.draftRecoveryPaused = false
            await this.refreshVulnerabilityDrafts()
        },

        editChangeCategory: function(category) {
            Dialog.create({
                title: $t('msg.confirmCategoryChange'),
                message: $t('msg.categoryChangingNotice'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => {
                if (category){
                    this.currentVulnerability.category = category.name
                }
                else {
                    this.currentVulnerability.category = null
                }
                this.setCurrentDetails()
            })
        },

        cleanErrors: function() {
            this.errors.title = '';
        },

        cleanCurrentVulnerability: function() {
            this.cleanErrors();
            this.currentVulnerability.cvssv3 = '';
            this.currentVulnerability.cvssv4 = '';
            this.currentVulnerability.priority = '';
            this.currentVulnerability.remediationComplexity = '';
            this.currentVulnerability.details = [];
            delete this.currentVulnerability.creator;
            this.currentLanguage = this.dtLanguage;
            if (this.currentCategory && this.currentCategory.name)
                this.currentVulnerability.category = this.currentCategory.name
            else
                this.currentVulnerability.category = null

            this.setCurrentDetails();
        },

        setupDraftRecovery: function() {
            if (this.draftRecovery)
                return

            this.draftRecovery = createDraftRecovery(this, {
                scope: () => this.vulnerabilityId ? 'vuln-modal-edit' : 'vuln-modal-create',
                refKey: () => this.vulnerabilityId || `_new:${this.currentCategory?.name || 'none'}`,
                userId: () => userStore.id,
                getCurrent: () => this.currentVulnerability,
                setCurrent: (data) => {
                    this.currentVulnerability = data
                    if (!this.vulnerabilityId && data.category)
                        this.currentCategory = { name: data.category }
                    this.setCurrentDetails()
                },
                getOriginal: () => this.currentVulnerabilityOrig,
                isDirty: () => !!this.currentVulnerabilityOrig && !this.$_.isEqual(this.currentVulnerability, this.currentVulnerabilityOrig),
                isReadOnly: () => this.draftRecoveryPaused || (this.vulnerabilityId ? !userStore.isAllowed('vulnerabilities:update') : !userStore.isAllowed('vulnerabilities:create')),
                afterRestore: async () => {
                    await this.$nextTick()
                }
            })
        },

        refreshVulnerabilityDrafts: async function() {
            if (!userStore.id) {
                this.vulnerabilityDrafts = []
                return
            }

            this.vulnerabilityDrafts = await DraftRecoveryService.listDrafts({
                userId: userStore.id,
                scopes: ['vuln-modal-edit', 'vuln-modal-create']
            })
        },

        hasDraftForVulnerability: function(vulnerabilityId) {
            if (!vulnerabilityId || this.vulnerabilityId === vulnerabilityId)
                return false
            return this.vulnerabilityDrafts.some(draft =>
                draft.scope === 'vuln-modal-edit' &&
                draft.refKey === vulnerabilityId
            )
        },

        hasCreateDraftForCategory: function(categoryName) {
            const refKey = `_new:${categoryName || 'none'}`
            return this.vulnerabilityDrafts.some(draft =>
                draft.scope === 'vuln-modal-create' &&
                draft.refKey === refKey
            )
        },

        // Create detail if locale doesn't exist else set the currentDetailIndex
        setCurrentDetails: function(value) {
            var index = this.currentVulnerability.details.findIndex(obj => obj.locale === this.currentLanguage);
            if (index < 0) {
                var details = {
                    locale: this.currentLanguage,
                    title: '',
                    vulnType: '',
                    description: '',
                    observation: '',
                    remediation: '',
                    references: [],
                    customFields: []
                }
                details.customFields = Utils.filterCustomFields('vulnerability', this.currentVulnerability.category, this.customFields, [], this.currentLanguage)

                this.currentVulnerability.details.push(details)
                index = this.currentVulnerability.details.length - 1;
            }
            else {
                this.currentVulnerability.details[index].customFields = Utils.filterCustomFields('vulnerability', this.currentVulnerability.category, this.customFields, this.currentVulnerability.details[index].customFields, this.currentLanguage)
            }
            this.currentDetailsIndex = index;
        },

        isTextInCustomFields: function(field) {

            if (this.currentVulnerability.details[this.currentDetailsIndex].customFields) {
                return typeof this.currentVulnerability.details[this.currentDetailsIndex].customFields.find(f => {
                    return f.customField === field.customField._id && f.text === field.text
                }) === 'undefined'
            }
            return false
        },

        getTextDiffInCustomFields: function(field) {
            var result = ''
            if (this.currentVulnerability.details[this.currentDetailsIndex].customFields) {
                this.currentVulnerability.details[this.currentDetailsIndex].customFields.find(f => {
                    if (f.customField === field.customField._id)
                        result = f.text
                })
            }
            return result
        },

        getDtTitle: function(row) {
            var index = row.details.findIndex(obj => obj.locale === this.dtLanguage);
            if (index < 0 || !row.details[index].title)
                return $t('err.notDefinedLanguage');
            else
                return row.details[index].title;
        },

        getDtType: function(row) {
            var index = row.details.findIndex(obj => obj.locale === this.dtLanguage);
            if (index < 0 || !row.details[index].vulnType)
                return "Undefined";
            else
                return row.details[index].vulnType;
        },

        getVulnCvss: function(row) {
            var scoring = this.$settings?.report?.public?.scoringMethods || {}
            var cacheKey = `${row.cvssv3 || ''}|${row.cvssv4 || ''}|${!!scoring.CVSS3}|${!!scoring.CVSS4}`
            var cached = cvssCacheByRow.get(row)
            if (cached && cached.key === cacheKey)
                return cached.value

            var cvss = null
            try {
                if (scoring.CVSS4 && row.cvssv4)
                    cvss = new Cvss4P0(row.cvssv4).createJsonSchema()
                else if (scoring.CVSS3 && row.cvssv3)
                    cvss = new Cvss3P1(row.cvssv3).createJsonSchema()
            } catch (err) {
                // Invalid CVSS format — ignore and treat as no CVSS
                cvss = null
            }

            var value = null
            if (cvss && typeof cvss.baseScore === 'number' && cvss.baseScore >= 0) {
                value = {
                    score: cvss.baseScore.toFixed(1),
                    scoreNum: cvss.baseScore,
                    color: this.getSeverityColor(cvss.baseSeverity)
                }
            }
            cvssCacheByRow.set(row, {key: cacheKey, value: value})
            return value
        },

        // Severity bucket used by the CVSS range filter; null when the row has no CVSS
        getCvssBucket: function(row) {
            var cvss = this.getVulnCvss(row)
            if (!cvss)
                return null
            if (cvss.scoreNum < 4)
                return 'low'
            if (cvss.scoreNum < 7)
                return 'medium'
            if (cvss.scoreNum < 9)
                return 'high'
            return 'critical'
        },

        getSeverityColor: function(severity) {
            var cvssColors = this.$settings?.report?.public?.cvssColors
            if (cvssColors) {
                var severityColorName = `${String(severity || 'None').toLowerCase()}Color`
                return cvssColors[severityColorName] || cvssColors.noneColor
            }
            switch (String(severity || '').toLowerCase()) {
                case 'low':
                    return 'green'
                case 'medium':
                    return 'orange'
                case 'high':
                    return 'red'
                case 'critical':
                    return 'black'
                default:
                    return 'blue'
            }
        },

        customSort: function(rows, sortBy, descending) {
            if (rows) {
                var data = [...rows];

                if (sortBy === 'lastModified') {
                    (descending)
                        ? data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                        : data.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
                }
                else if (sortBy === 'title') {
                    (descending)
                        ? data.sort((a, b) => this.getDtTitle(b).localeCompare(this.getDtTitle(a)))
                        : data.sort((a, b) => this.getDtTitle(a).localeCompare(this.getDtTitle(b)))
                }
                else if (sortBy === 'category') {
                    (descending)
                        ? data.sort((a, b) => (b.category || $t('noCategory')).localeCompare(a.category || $t('noCategory')))
                        : data.sort((a, b) => (a.category || $t('noCategory')).localeCompare(b.category || $t('noCategory')))
                }
                return data;
            }
        },

        setSort: function(sortBy) {
            if (this.pagination.sortBy === sortBy)
                this.sortDesc = !this.sortDesc
            else {
                this.pagination.sortBy = sortBy
                this.sortDesc = sortBy === 'lastModified'
            }
        },

        matchesStatusFilter: function(row, status) {
            if (status === 'valid')
                return row.status === 0
            if (status === 'new')
                return row.status === 1
            if (status === 'updates')
                return row.status === 2
            return true
        },

        customFilter: function(rows, terms) {
            var termTitle = (terms.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            var categories = terms.categories || []
            var types = terms.types || []
            var cvssRange = terms.cvssRange || 'all'
            var result = rows && rows.filter(row => {
                var title = this.getDtTitle(row).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                return title.indexOf(termTitle) > -1 &&
                (categories.length === 0 || categories.includes(row.category || 'No Category')) &&
                (types.length === 0 || types.includes(this.getDtType(row))) &&
                (cvssRange === 'all' || this.getCvssBucket(row) === cvssRange) &&
                (!terms.creator || row.creator?.username === terms.creator) &&
                (!terms.unsavedOnly || this.hasDraftForVulnerability(row._id)) &&
                this.matchesStatusFilter(row, terms.status || 'all')
            })
            return result || [];
        },

        resetAdvancedFilters: function() {
            this.search.categories = []
            this.search.types = []
            this.search.cvssRange = 'all'
            this.search.creator = null
            this.search.unsavedOnly = false
            this.categoryFilterSearch = ''
            this.typeFilterSearch = ''
        },

        goToAudits: function(row) {
            var title = this.getDtTitle(row);
            this.$router.push({name: 'audits', query: {findingTitle: title}});
        },

        // Exactly one right-hand panel is visible at a time: per-vuln QA ('qa'), the AI
        // chat drawer ('ai'), or the QA-all panel ('qa-all'). Opening one closes the others.
        prepareSidePanelForPane: function(except) {
            if (except !== 'qa')
                this.vulnQaOpen = false
            if (except !== 'ai') {
                const aiStore = useAiGenerationStore()
                if (aiStore.isActive)
                    aiStore.cancelSession({ force: true })
            }
            if (except !== 'qa-all')
                useVulnQaStore().close()
        },

        toggleVulnerabilityQaView: function() {
            if (this.vulnQaOpen) {
                this.vulnQaOpen = false
                return
            }

            Utils.syncEditors(this.$refs)
            this.prepareSidePanelForPane('qa')
            this.vulnQaOpen = true
        },

        closeVulnQa: function() {
            this.vulnQaOpen = false
        },

        toggleRunAllQa: function() {
            const vulnQaStore = useVulnQaStore()
            if (vulnQaStore.panelOpen) {
                vulnQaStore.close()
                return
            }
            if (!this.vulnerabilityQaCount)
                return

            this.prepareSidePanelForPane('qa-all')
            vulnQaStore.open(this.dtLanguage)
        },

        // Issue click in the QA-all panel: select the offending vulnerability in the list
        // (paging/scrolling to it) and open its edit pane — the panel follows into the
        // pane's side slot, so triage flow is click → fix → recheck → next.
        navigateToVulnerabilityFromQa: async function(vulnerabilityId) {
            const vuln = this.vulnerabilities.find((row) => row._id === vulnerabilityId)
            if (!vuln) {
                // Deleted since the QA run: without feedback the button looks broken.
                Notify.create({
                    message: $t('vulnerabilityQa.notFoundInList'),
                    color: 'warning',
                    textColor: 'white',
                    position: 'top-right'
                })
                return
            }

            const index = this.sortedVulnerabilities.findIndex((row) => row._id === vulnerabilityId)
            if (index === -1) {
                Notify.create({
                    message: $t('vulnerabilityQa.notVisibleWithFilters'),
                    color: 'info',
                    textColor: 'white',
                    position: 'top-right',
                    actions: [{
                        label: $t('vulnerabilityQa.clearFilters'),
                        color: 'white',
                        handler: () => {
                            this.clearListFilters()
                            this.navigateToVulnerabilityFromQa(vulnerabilityId)
                        }
                    }]
                })
            } else if (this.pagination.rowsPerPage) {
                this.pagination.page = Math.floor(index / this.pagination.rowsPerPage) + 1
            }

            await this.selectVulnerability(vuln)
            this.$nextTick(() => {
                document.querySelector(`[data-testid="vulnerability-item-${vulnerabilityId}"]`)
                    ?.scrollIntoView({ block: 'nearest' })
            })
        },

        clearListFilters: function() {
            this.search = {title: '', categories: [], types: [], cvssRange: 'all', creator: null, unsavedOnly: false}
            this.statusFilter = 'all'
        },

        setupVulnQaSocket: function() {
            const vulnQaStore = useVulnQaStore()
            this.vulnQaSocketHandlers = {
                progress: (payload) => vulnQaStore.handleSocketProgress(payload),
                done: (payload) => vulnQaStore.handleSocketDone(payload),
                connect: () => this.$socket.emit('join', { username: userStore.username, room: 'vuln-qa' })
            }
            this.$socket.emit('join', { username: userStore.username, room: 'vuln-qa' })
            this.$socket.on('vuln-qa:progress', this.vulnQaSocketHandlers.progress)
            this.$socket.on('vuln-qa:done', this.vulnQaSocketHandlers.done)
            this.$socket.on('connect', this.vulnQaSocketHandlers.connect)
        },

        teardownVulnQaSocket: function() {
            if (!this.vulnQaSocketHandlers)
                return
            // Remove only this page's listeners — the boot file's global connect/disconnect
            // handlers must survive, so never call a bare $socket.off().
            this.$socket.emit('leave', { username: userStore.username, room: 'vuln-qa' })
            this.$socket.off('vuln-qa:progress', this.vulnQaSocketHandlers.progress)
            this.$socket.off('vuln-qa:done', this.vulnQaSocketHandlers.done)
            this.$socket.off('connect', this.vulnQaSocketHandlers.connect)
            this.vulnQaSocketHandlers = null
            useVulnQaStore().clearStatusRefresh()
        },

        getVulnTitleLocale: function(vuln, locale) {
            for (var i=0; i<vuln.details.length; i++) {
                if (vuln.details[i].locale === locale && vuln.details[i].title) return vuln.details[i].title;
            }
            return "undefined";
        },

        mergeVulnerabilities: function() {
            VulnerabilityService.mergeVulnerability(this.mergeVulnLeft, this.mergeVulnRight, this.mergeLanguageRight)
            .then(() => {
                this.mergeVulnLeft = ''
                this.mergeVulnRight = ''
                this.getVulnerabilities();
                Notify.create({
                    message: $t('msg.vulnerabilityMergeOk'),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        loadAiEnabledFieldKeys: function() {
            if (!this.aiEnabled) {
                this.aiPromptFieldKeys = []
                this.aiFieldPrompts = []
                return
            }

            AiService.getEnabledFields('finding')
            .then((data) => {
                const fields = data.data.datas?.fields || []
                this.aiFieldPrompts = fields
                this.aiPromptFieldKeys = fields
                    .map((field) => String(field.fieldKey || ''))
                    .filter((fieldKey) => fieldKey !== 'poc')
            })
            .catch(() => {
                this.aiPromptFieldKeys = []
                this.aiFieldPrompts = []
            })
        },

        getCustomFieldAiKey: function(customFieldId) {
            return `custom-field:${customFieldId}`
        },

        canGenerateAi: function(fieldKey) {
            return this.canUseAiInPane && this.aiPromptFieldKeys.includes(fieldKey)
        },

        buildAiLockKey: function(fieldKey) {
            const vulnKey = this.vulnerabilityId || `new:${this.currentCategory?.name || 'none'}`
            return `vulnerability:${vulnKey}:${this.currentLanguage}:${fieldKey}`
        },

        isAiFieldLoading: function(fieldKey) {
            return useAiGenerationStore().isFieldGenerating(this.buildAiLockKey(fieldKey))
        },

        isAiFieldSessionActive: function(fieldKey) {
            return AiFieldHelper.isFieldSessionActive(this.buildAiLockKey(fieldKey))
        },

        isAiFieldSelectionLocked: function(fieldKey) {
            return AiFieldHelper.isFieldSelectionLocked(this.buildAiLockKey(fieldKey))
        },

        isFieldEditable: function(fieldKey) {
            return this.canUseAiInPane
        },

        getCurrentDetail: function() {
            return this.currentVulnerability.details[this.currentDetailsIndex] || {}
        },

        getAiSelectionTarget: function(field, customField = null) {
            if (customField)
                return this.$refs.customfields?.getAiSelectionTarget?.(customField) || null

            if (field === 'references')
                return this.$refs.referencesField || null

            return this.$refs[`basiceditor_${field}`] || null
        },

        generateCustomFieldDraftAI: function(customField) {
            return this.generateFieldDraftAI(null, customField)
        },

        generateFieldDraftAI: async function(field, customField = null) {
            const fieldKey = customField ? this.getCustomFieldAiKey(customField?.customField?._id) : field
            if (!fieldKey || !this.canGenerateAi(fieldKey))
                return

            if (!this.canUseAiInPane || this.isAiFieldLoading(fieldKey))
                return

            this.prepareSidePanelForPane('ai')

            const lockKey = this.buildAiLockKey(fieldKey)
            const aiStore = useAiGenerationStore()
            if (aiStore.drawerOpen && aiStore.isActive && aiStore.lockKey !== lockKey) {
                Notify.create({
                    message: $t('aiChat.activeSession'),
                    color: 'warning',
                    textColor: 'dark',
                    position: 'top-right'
                })
                return
            }

            Utils.syncEditors(this.$refs)

            const detail = this.getCurrentDetail()

            try {
                await AiFieldHelper.runFieldSession({
                    field,
                    customField,
                    fieldKey,
                    lockKey,
                    selectionTarget: this.getAiSelectionTarget(field, customField),
                    entityShape: 'vulnerability',
                    requestEntityType: 'finding',
                    locale: this.currentLanguage,
                    aiFieldPrompts: this.aiFieldPrompts,
                    languages: this.languages,
                    buildContext: () => AiFieldHelper.buildVulnerabilityAiContext(this.currentVulnerability, detail, customField),
                    getDiffEntity: () => {
                        Utils.syncEditors(this.$refs)
                        return this.currentVulnerability
                    },
                    setValue: (value) => {
                        if (customField)
                            customField.text = value
                        else
                            detail[field] = value
                    }
                })
            } catch (err) {
                Notify.create({
                    message: err.response?.data?.datas || err.message || 'Unable to generate AI draft',
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            }
        }
    }
}
