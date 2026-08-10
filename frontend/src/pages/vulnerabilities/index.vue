<template>
    <div v-if="languages.length === 0" class="row">
        <div class="col-md-4 offset-md-4 q-mt-md">
            <p>{{$t('noLanguage')}} <a href="/data/custom">{{$t('nav.data')}} -> {{$t('customData')}} -> {{$t('languages')}}</a></p>
        </div>
    </div>

    <div v-else class="vuln-page row no-wrap items-stretch">
        <!-- Sidebar: vulnerabilities list -->
        <div class="vuln-sidebar column no-wrap">
            <div class="q-px-md q-pt-md q-pb-sm">
                <div class="row no-wrap items-center">
                    <q-input
                    dense
                    class="col"
                    data-testid="search-vulnerability-title"
                    :label="$t('search')"
                    v-model="search.title"
                    clearable
                    autofocus
                    outlined
                    >
                        <template v-slot:prepend>
                            <q-icon name="search" size="xs" />
                        </template>
                    </q-input>
                    <q-select
                    dense
                    class="vuln-sidebar-language q-ml-sm"
                    v-model="dtLanguage"
                    :label="$t('language')"
                    :options="languages"
                    option-value="locale"
                    option-label="language"
                    map-options
                    emit-value
                    options-sanitize
                    outlined
                    />
                    <div class="q-ml-sm">
                        <q-btn
                        class="vuln-filter-btn"
                        outline
                        data-testid="vulnerability-filters"
                        :aria-label="$t('filters')"
                        :color="activeFilterCount > 0 ? 'primary' : 'grey-7'"
                        >
                            <q-icon name="o_filter_alt" size="20px" />
                            <q-badge v-if="activeFilterCount > 0" floating rounded color="primary">{{activeFilterCount}}</q-badge>
                            <q-tooltip anchor="bottom middle" self="center middle" :delay="500" class="text-bold">{{$t('filters')}}</q-tooltip>
                        </q-btn>
                        <q-menu style="width: 300px; min-height: 1px; max-height: 75vh" anchor="top right" self="top left" :offset="[8, 0]">
                            <div class="vuln-filter-popover column no-wrap">
                                <div class="row items-center q-px-md q-pt-md">
                                    <span class="text-subtitle2">{{$t('filters')}}</span>
                                </div>

                                <div class="q-px-md q-pt-sm">
                                    <div class="text-caption text-grey-7 text-bold q-mb-xs">{{$t('category')}}</div>
                                    <q-input
                                    dense
                                    v-model="categoryFilterSearch"
                                    :placeholder="$t('search')"
                                    clearable
                                    outlined
                                    >
                                        <template v-slot:prepend>
                                            <q-icon name="search" size="xs" />
                                        </template>
                                    </q-input>
                                    <div class="vuln-filter-options">
                                        <div v-for="facet of categoryFacets" :key="facet.name" class="row items-center no-wrap">
                                            <q-checkbox
                                            dense
                                            size="sm"
                                            v-model="search.categories"
                                            :val="facet.name"
                                            :label="facet.name"
                                            class="col ellipsis"
                                            />
                                            <span class="text-caption text-grey-6">{{facet.count}}</span>
                                        </div>
                                    </div>
                                </div>

                                <q-separator class="q-mt-sm" />

                                <div class="q-px-md q-pt-sm">
                                    <div class="text-caption text-grey-7 text-bold q-mb-xs">{{$t('type')}}</div>
                                    <q-input
                                    dense
                                    v-model="typeFilterSearch"
                                    :placeholder="$t('search')"
                                    clearable
                                    outlined
                                    >
                                        <template v-slot:prepend>
                                            <q-icon name="search" size="xs" />
                                        </template>
                                    </q-input>
                                    <div class="vuln-filter-options">
                                        <div v-for="facet of typeFacets" :key="facet.name" class="row items-center no-wrap">
                                            <q-checkbox
                                            dense
                                            size="sm"
                                            v-model="search.types"
                                            :val="facet.name"
                                            :label="facet.name"
                                            class="col ellipsis"
                                            />
                                            <span class="text-caption text-grey-6">{{facet.count}}</span>
                                        </div>
                                    </div>
                                </div>

                                <q-separator class="q-mt-sm" />

                                <div class="q-px-md q-pt-sm">
                                    <div class="text-caption text-grey-7 text-bold q-mb-xs">CVSS</div>
                                    <div v-for="facet of cvssFacets" :key="facet.value" class="row items-center no-wrap">
                                        <q-radio
                                        dense
                                        size="sm"
                                        v-model="search.cvssRange"
                                        :val="facet.value"
                                        :label="facet.label"
                                        class="col ellipsis"
                                        />
                                        <span class="text-caption text-grey-6">{{facet.count}}</span>
                                    </div>
                                </div>

                                <q-separator class="q-mt-sm" />

                                <div class="q-px-md q-py-sm">
                                    <div class="text-caption text-grey-7 text-bold q-mb-xs">{{$t('createdBy')}}</div>
                                    <q-select
                                    dense
                                    v-model="search.creator"
                                    clearable
                                    :options="creatorOptions"
                                    options-sanitize
                                    outlined
                                    />
                                </div>

                                <q-separator />

                                <div class="q-px-md q-py-sm">
                                    <div class="row items-center no-wrap">
                                        <q-checkbox
                                        dense
                                        size="sm"
                                        v-model="search.unsavedOnly"
                                        :label="$t('unsavedChangesOnly')"
                                        class="col ellipsis"
                                        data-testid="filter-unsaved-only"
                                        />
                                        <span class="text-caption text-grey-6" data-testid="filter-unsaved-count">{{unsavedChangesCount}}</span>
                                    </div>
                                </div>

                                <q-separator />

                                <div class="row items-center q-px-md q-py-sm">
                                    <span class="text-caption text-grey-7">{{activeFilterCount}} {{$t('filtersApplied')}}</span>
                                    <q-space />
                                    <q-btn
                                    flat
                                    dense
                                    no-caps
                                    size="sm"
                                    color="negative"
                                    icon="fa fa-trash-alt"
                                    :label="$t('clearAll')"
                                    :disable="activeFilterCount === 0"
                                    @click="resetAdvancedFilters()"
                                    />
                                </div>
                            </div>
                        </q-menu>
                    </div>
                </div>

                <div class="row items-center q-gutter-xs q-mt-sm no-wrap">
                    <span class="text-caption text-grey-7 q-mr-xs">{{$t('views')}}</span>
                    <q-btn
                    no-caps
                    padding="4px 12px"
                    class="vuln-status-filter"
                    :outline="statusFilter !== 'all'"
                    :unelevated="statusFilter === 'all'"
                    color="grey-8"
                    data-testid="status-filter-all"
                    @click="statusFilter = 'all'"
                    >
                        {{$t('all')}}&nbsp;<span class="vuln-status-count">{{statusCounts.all}}</span>
                    </q-btn>
                    <q-btn
                    no-caps
                    padding="4px 12px"
                    class="vuln-status-filter"
                    :outline="statusFilter !== 'valid'"
                    :unelevated="statusFilter === 'valid'"
                    color="green"
                    data-testid="status-filter-valid"
                    @click="statusFilter = 'valid'"
                    >
                        {{$t('btn.valid')}}&nbsp;<span class="vuln-status-count">{{statusCounts.valid}}</span>
                    </q-btn>
                    <q-btn
                    no-caps
                    padding="4px 12px"
                    class="vuln-status-filter"
                    :outline="statusFilter !== 'new'"
                    :unelevated="statusFilter === 'new'"
                    color="light-blue"
                    data-testid="status-filter-new"
                    @click="statusFilter = 'new'"
                    >
                        {{$t('btn.new')}}&nbsp;<span class="vuln-status-count">{{statusCounts.new}}</span>
                    </q-btn>
                    <q-btn
                    no-caps
                    padding="4px 12px"
                    class="vuln-status-filter"
                    :outline="statusFilter !== 'updates'"
                    :unelevated="statusFilter === 'updates'"
                    color="orange"
                    data-testid="status-filter-updates"
                    @click="statusFilter = 'updates'"
                    >
                        {{$t('btn.updates')}}&nbsp;<span class="vuln-status-count">{{statusCounts.updates}}</span>
                    </q-btn>
                </div>

                <div class="row items-center q-gutter-xs q-mt-sm">
                    <q-btn-dropdown
                    v-if="userStore.isAllowed('vulnerabilities:create')"
                    unelevated
                    color="secondary"
                    no-caps
                    data-testid="new-vulnerability-button"
                    :label="$t('newVulnerability')"
                    >
                        <q-list separator>
                            <q-item-label header>{{$t('selectCategory')}}</q-item-label>
                            <q-item clickable v-close-popup @click="openCreateVulnerability(null)">
                                <q-item-section>
                                <q-item-label>{{$t('noCategory')}}</q-item-label>
                                </q-item-section>
                                <q-item-section side v-if="hasCreateDraftForCategory(null)">
                                    <q-badge data-testid="create-vulnerability-draft-badge-none" color="orange" rounded>
                                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('tooltip.auditDraftUnsavedChanges')}}</q-tooltip>
                                    </q-badge>
                                </q-item-section>
                            </q-item>
                            <q-item v-for="category of vulnCategories" :key="category.name" clickable v-close-popup @click="openCreateVulnerability(category)">
                                <q-item-section>
                                <q-item-label>{{category.name}}</q-item-label>
                                </q-item-section>
                                <q-item-section side v-if="hasCreateDraftForCategory(category.name)">
                                    <q-badge :data-testid="`create-vulnerability-draft-badge-${category.name}`" color="orange" rounded>
                                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('tooltip.auditDraftUnsavedChanges')}}</q-tooltip>
                                    </q-badge>
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </q-btn-dropdown>
                    <q-btn
                    v-if="userStore.isAllowed('vulnerabilities:update')"
                    :label="$t('mergeVulnerabilities')"
                    outline
                    color="secondary"
                    no-caps
                    @click="openMergeVulnerabilities()"
                    />
                    <q-btn
                    v-if="aiQaAllEnabled"
                    :label="$t(vulnQaAllOpen ? 'vulnerabilityQa.hideReview' : 'vulnerabilityQa.showReview')"
                    :outline="!vulnQaAllOpen"
                    :unelevated="vulnQaAllOpen"
                    color="secondary"
                    no-caps
                    data-testid="vulnerability-qa-all-toggle"
                    :disable="vulnerabilityQaCount === 0 && !vulnQaAllOpen"
                    @click="toggleRunAllQa()"
                    >
                        <q-badge v-if="vulnQaAllRunning" floating rounded color="orange" class="qa-run-badge" />
                    </q-btn>
                </div>

                <div class="row items-center q-mt-sm">
                    <span v-if="filteredRowsCount === computedVulnerabilities.length" class="text-body2">{{filteredRowsCount}} {{ filteredRowsCount === 1 ? $t('vulnerabilityNum1') : $t('vulnerabilitiesNums') }}</span>
                    <span v-else class="text-body2">{{filteredRowsCount}} / {{computedVulnerabilities.length}} {{$t('vulnerabilitiesNums')}}</span>
                    <q-space />
                    <q-btn-dropdown
                    flat
                    dense
                    no-caps
                    data-testid="vulnerability-sort"
                    class="text-body2"
                    :label="`${$t('sortBy')}: ${sortLabel}`"
                    >
                        <q-list dense>
                            <q-item v-for="field in ['title', 'category', 'lastModified']" :key="field" clickable v-close-popup @click="setSort(field)">
                                <q-item-section>{{field === 'lastModified' ? $t('lastModified') : $t(field)}}</q-item-section>
                                <q-item-section side v-if="pagination.sortBy === field">
                                    <q-icon size="xs" :name="sortDesc ? 'fa fa-arrow-down' : 'fa fa-arrow-up'" />
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </q-btn-dropdown>
                </div>
            </div>

            <q-separator />

            <div class="col vuln-list-container relative-position">
                <q-virtual-scroll
                v-if="paginatedVulnerabilities.length"
                ref="vulnerabilityList"
                class="full-height"
                :items="paginatedVulnerabilities"
                :virtual-scroll-item-size="64"
                separator
                v-slot="{ item: vuln }"
                >
                    <q-item
                    :key="vuln._id"
                    clickable
                    :active="activePane !== null && activePane !== 'merge' && vulnerabilityId === vuln._id"
                    active-class="vuln-item-active"
                    class="vuln-list-item"
                    :data-testid="`vulnerability-item-${vuln._id}`"
                    @click="selectVulnerability(vuln)"
                    >
                        <q-item-section>
                            <q-item-label lines="2">
                                {{getDtTitle(vuln)}}
                                <q-badge v-if="vuln.status === 1" outline color="light-blue" class="vuln-status-chip q-ml-xs">{{$t('btn.new')}}</q-badge>
                                <q-badge v-else-if="vuln.status === 2" outline color="orange" class="vuln-status-chip q-ml-xs">{{$t('btn.updates')}}</q-badge>
                                <q-badge v-if="hasDraftForVulnerability(vuln._id)" :data-testid="`vulnerability-draft-badge-${vuln._id}`" class="q-ml-xs" color="orange" rounded>
                                    <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('tooltip.auditDraftUnsavedChanges')}}</q-tooltip>
                                </q-badge>
                            </q-item-label>
                            <q-item-label caption>{{vuln.category || $t('noCategory')}}</q-item-label>
                        </q-item-section>
                        <q-item-section side>
                            <div class="row items-center no-wrap">
                                <span v-if="getVulnCvss(vuln)" class="vuln-cvss-score text-bold q-mr-xs" :style="{color: getVulnCvss(vuln).color}">{{getVulnCvss(vuln).score}}</span>
                                <q-btn size="sm" flat dense color="secondary" icon="fa fa-fingerprint" @click.stop="goToAudits(vuln)">
                                    <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('tooltip.findAudits')}}</q-tooltip>
                                </q-btn>
                            </div>
                        </q-item-section>
                    </q-item>
                </q-virtual-scroll>
                <div v-else-if="!loading" class="text-center q-pa-lg text-grey">
                    {{$t('noMatchingRecords')}}
                </div>
                <q-inner-loading :showing="loading" />
            </div>

            <q-separator />

            <div class="q-px-md q-py-sm">
                <div class="row items-center no-wrap justify-end">
                    <span class="text-caption text-grey-7 q-mr-xs">{{$t('resultsPerPage')}}</span>
                    <q-select
                    v-model="pagination.rowsPerPage"
                    :options="rowsPerPageOptions"
                    emit-value
                    map-options
                    dense
                    options-dense
                    options-cover
                    borderless
                    />
                </div>
                <div class="row items-center no-wrap justify-between">
                    <span class="text-caption text-grey-7">{{paginationRangeLabel}} / {{filteredRowsCount}}</span>
                    <q-pagination input v-model="pagination.page" :max="pagesNumber" dense />
                </div>
            </div>
        </div>

        <q-separator vertical />

        <!-- Detail pane -->
        <div class="vuln-detail col column no-wrap" data-testid="vulnerability-detail-pane">

            <!-- Empty state -->
            <template v-if="!activePane">
                <div class="col column flex-center q-pa-xl" data-testid="vulnerability-empty-state">
                    <q-icon name="fa fa-shield-alt" size="72px" class="text-grey-4 q-mb-lg" />
                    <div class="text-h5 text-center">{{$t('selectVulnerability')}}</div>
                    <div class="text-grey-6 text-center q-mt-sm" style="max-width: 420px">{{$t('selectVulnerabilityHint')}}</div>
                    <div v-if="userStore.isAllowed('vulnerabilities:create')" class="row items-center q-mt-lg vuln-empty-or">
                        <q-separator class="col" />
                        <span class="q-mx-md text-grey-6">{{$t('or')}}</span>
                        <q-separator class="col" />
                    </div>
                    <q-btn-dropdown
                    v-if="userStore.isAllowed('vulnerabilities:create')"
                    class="q-mt-lg"
                    unelevated
                    color="secondary"
                    no-caps
                    data-testid="create-vulnerability-empty-button"
                    :label="$t('createNewVulnerability')"
                    >
                        <q-list separator>
                            <q-item-label header>{{$t('selectCategory')}}</q-item-label>
                            <q-item clickable v-close-popup @click="openCreateVulnerability(null)">
                                <q-item-section>
                                <q-item-label>{{$t('noCategory')}}</q-item-label>
                                </q-item-section>
                            </q-item>
                            <q-item v-for="category of vulnCategories" :key="category.name" clickable v-close-popup @click="openCreateVulnerability(category)">
                                <q-item-section>
                                <q-item-label>{{category.name}}</q-item-label>
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </q-btn-dropdown>
                </div>
            </template>

            <!-- Create pane -->
            <div v-else-if="activePane === 'create'" class="col column no-wrap vuln-pane" data-testid="vulnerability-create-pane">
                <q-bar class="vuln-pane-header vuln-modal-bar">
                    <q-btn-dropdown
                    v-if="userStore.isAllowed('vulnerabilities:create')"
                    :label="$t('changeCategory')"
                    outline
                    color="primary"
                    no-caps
                    class="vuln-toolbar-button"
                    >
                        <q-list separator>
                            <q-item-label header>{{$t('selectCategory')}}</q-item-label>
                            <q-item clickable v-close-popup @click="editChangeCategory()">
                                <q-item-section><q-item-label>{{$t('noCategory')}}</q-item-label></q-item-section>
                            </q-item>
                            <q-item v-for="category of vulnCategories" :key="category.name" clickable v-close-popup @click="editChangeCategory(category)">
                                <q-item-section><q-item-label>{{category.name}}</q-item-label></q-item-section>
                            </q-item>
                        </q-list>
                    </q-btn-dropdown>
                    <div v-if="currentCreatorName" class="vuln-creator" data-testid="vulnerability-created-by">
                        <span class="vuln-creator-label">{{$t('createdBy')}}</span>
                        <span class="vuln-creator-name">{{currentCreatorName}}</span>
                    </div>
                    <draft-recovery-status match-toolbar class="vuln-toolbar-button" />
                    <q-space />
                    <q-btn
                    v-if="aiQaEnabled"
                    outline
                    icon="o_gpp_good"
                    :label="$t('btn.qa')"
                    no-caps
                    class="vuln-toolbar-button"
                    :class="{'bg-grey-3': vulnQaOpen}"
                    :color="vulnQaOpen ? 'primary' : 'grey-8'"
                    data-testid="vulnerability-qa-toggle"
                    @click="toggleVulnerabilityQaView()"
                    >
                        <q-badge v-if="vulnQaRunning" floating rounded color="orange" class="qa-run-badge" />
                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">
                            {{ $t('tooltip.vulnerabilityQa') }}
                        </q-tooltip>
                    </q-btn>
                    <q-separator vertical inset class="q-mx-md" />
                    <q-btn
                    v-if="userStore.isAllowed('vulnerabilities:create')"
                    outline
                    :color="saveButtonColor"
                    :text-color="saveButtonTextColor"
                    no-caps
                    class="vuln-toolbar-button"
                    data-testid="save-vulnerability-button"
                    @click="createVulnerability()"
                    >
                        <q-icon v-if="saveButtonState === 'saved'" name="check" class="q-mr-sm" />
                        <span>{{saveButtonLabel}}</span>
                        <q-icon v-if="saveButtonState === 'dirty'" name="circle" size="12px" class="q-ml-sm" />
                    </q-btn>
                    <q-separator vertical inset class="q-mx-md" />
                    <q-btn flat icon="close" class="vuln-toolbar-close" data-testid="create-vulnerability-close" @click="closePane()">
                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('btn.close')}}</q-tooltip>
                    </q-btn>
                </q-bar>

                <div class="row col vuln-modal-content items-stretch no-wrap">
                    <div class="vuln-modal-form" ref="detailScroll">
                <q-card-section>
                    <div class="q-col-gutter-md row">
                        <q-input
                        :label="$t('title')+' *'"
                        stack-label
                        class="col-md-8"
                        autofocus
                        data-testid="create-vulnerability-title"
                        :error="!!errors.title"
                        :error-message="errors.title"
                        hide-bottom-space
                        @keyup.enter="createVulnerability()"
                        v-model="currentVulnerability.details[currentDetailsIndex].title"
                        :readonly="vulnReadonly"
                        outlined
                        />
                        <q-select
                        class="col-md-2"
                        :label="$t('type')"
                        v-model="currentVulnerability.details[currentDetailsIndex].vulnType"
                        :options="vulnTypesLang"
                        option-value="name"
                        option-label="name"
                        emit-value
                        map-options
                        options-sanitize
                        :readonly="vulnReadonly"
                        outlined
                        />
                        <q-select
                        :label="$t('language')"
                        stack-label
                        class="col-md-2"
                        v-model="currentLanguage"
                        :options="languages"
                        option-value="locale"
                        option-label="language"
                        map-options
                        emit-value
                        options-sanitize
                        outlined
                        />
                    </div>
                </q-card-section>
                <q-card-section>
                    <q-field borderless :label="$t('description')" stack-label>
                        <template v-slot="control">
                            <basic-editor
                            ref="basiceditor_description"
                            noAffix
                            :editable="!vulnReadonly"
                            v-model="currentVulnerability.details[currentDetailsIndex].description"
                            :showAiButton="canGenerateAi('description') && isFieldEditable('description')"
                            :aiLoading="isAiFieldLoading('description')"
                            :aiSessionActive="isAiFieldSessionActive('description')"
                            @ai-click="generateFieldDraftAI('description')"
                            />
                        </template>
                    </q-field>
                </q-card-section>
                <q-card-section>
                    <q-field borderless :label="$t('observation')" stack-label>
                        <template v-slot="control">
                            <basic-editor
                            ref="basiceditor_observation"
                            noAffix
                            :editable="!vulnReadonly"
                            v-model="currentVulnerability.details[currentDetailsIndex].observation"
                            :showAiButton="canGenerateAi('observation') && isFieldEditable('observation')"
                            :aiLoading="isAiFieldLoading('observation')"
                            :aiSessionActive="isAiFieldSessionActive('observation')"
                            @ai-click="generateFieldDraftAI('observation')"
                            />
                        </template>
                    </q-field>
                </q-card-section>
                <q-card-section v-if="$settings.report.public.scoringMethods.CVSS3">
                    <div class="col-md-12">
                        <cvss3-calculator
                        v-model="currentVulnerability.cvssv3"
                        :readonly="vulnReadonly"
                        @cvssScoreChange="currentVulnerability.cvssScore = $event"
                        />
                    </div>
                </q-card-section>
                <q-card-section v-if="$settings.report.public.scoringMethods.CVSS4">
                    <div class="col-md-12">
                        <cvss4-calculator
                        v-model="currentVulnerability.cvssv4"
                        :readonly="vulnReadonly"
                        @cvssScoreChange="currentVulnerability.cvssScore = $event"
                        />
                    </div>
                </q-card-section>
                <q-card-section>
                    <q-field borderless :label="$t('remediation')" stack-label>
                        <template v-slot="control">
                            <basic-editor
                            ref="basiceditor_remediation"
                            noAffix
                            :editable="!vulnReadonly"
                            v-model="currentVulnerability.details[currentDetailsIndex].remediation"
                            :showAiButton="canGenerateAi('remediation') && isFieldEditable('remediation')"
                            :aiLoading="isAiFieldLoading('remediation')"
                            :aiSessionActive="isAiFieldSessionActive('remediation')"
                            @ai-click="generateFieldDraftAI('remediation')"
                            />
                        </template>
                    </q-field>
                </q-card-section>
                <q-card-section>
                    <div class="q-col-gutter-md row">
                        <q-select
                        :label="$t('remediationComplexity')"
                        stack-label
                        class="col-md-6"
                        v-model="currentVulnerability.remediationComplexity"
                        :options="[{label: $t('easy'), value: 1},{label: $t('medium'), value: 2},{label: $t('complex'), value: 3}]"
                        map-options
                        emit-value
                        options-sanitize
                        :readonly="vulnReadonly"
                        outlined
                        />
                        <q-select
                        :label="$t('remediationPriority')"
                        stack-label
                        class="col-md-6"
                        v-model="currentVulnerability.priority"
                        :options="[{label: $t('low'), value: 1},{label: $t('medium'), value: 2},{label: $t('high'), value: 3},{label: $t('urgent'), value: 4}]"
                        map-options
                        emit-value
                        options-sanitize
                        :readonly="vulnReadonly"
                        outlined
                        />
                    </div>
                </q-card-section>
                <q-card-section>
                    <textarea-array
                    ref="referencesField"
                    framed-header
                    :label="$t('references')"
                    v-model="currentVulnerability.details[currentDetailsIndex].references"
                    :readonly="vulnReadonly"
                    :showAiButton="canGenerateAi('references') && isFieldEditable('references')"
                    :aiLoading="isAiFieldLoading('references')"
                    :aiSessionActive="isAiFieldSessionActive('references')"
                    @ai-click="generateFieldDraftAI('references')"
                    />
                </q-card-section>

                <q-expansion-item
                :label="$t('customFields')"
                default-opened
                header-class="bg-blue-grey-5 text-white"
                expand-icon-class="text-white"
                >
                    <custom-fields
                    ref="customfields"
                    v-model="currentVulnerability.details[currentDetailsIndex].customFields"
                    :category="currentVulnerability.category"
                    custom-element="QCardSection"
                    display="vuln"
                    :locale="currentLanguage"
                    :readonly="vulnReadonly"
                    :aiEnabled="aiEnabled"
                    :canGenerateAiForField="canGenerateAi"
                    :isAiGeneratingField="isAiFieldLoading"
                    :isAiFieldSessionActive="isAiFieldSessionActive"
                    :isAiFieldSelectionLocked="isAiFieldSelectionLocked"
                    :generateAiForField="generateCustomFieldDraftAI"
                    />
                </q-expansion-item>
                    </div>

                    <div v-if="vulnQaOpen" class="vuln-modal-ai">
                        <vulnerability-qa-panel
                        :key="`draft:${currentLanguage}`"
                        :locale="currentLanguage"
                        :vulnerability="currentVulnerability"
                        :title="currentVulnerability.details[currentDetailsIndex].title"
                        :reload-token="qaReloadToken"
                        @close="closeVulnQa"
                        />
                    </div>

                    <div v-else-if="aiDrawerOpen" class="vuln-modal-ai">
                        <ai-chat-drawer />
                    </div>
                </div>
            </div>

            <!-- Edit pane -->
            <div
            v-else-if="activePane === 'edit'"
            :key="`vulnerability-edit:${vulnerabilityId}`"
            class="col column no-wrap vuln-pane"
            data-testid="vulnerability-edit-pane"
            >
                <q-bar class="vuln-pane-header vuln-modal-bar">
                    <q-btn-dropdown
                    v-if="userStore.isAllowed('vulnerabilities:update')"
                    :label="$t('changeCategory')"
                    outline
                    color="primary"
                    no-caps
                    class="vuln-toolbar-button"
                    >
                    <q-list separator>
                        <q-item-label header>{{$t('selectCategory')}}</q-item-label>
                        <q-item clickable v-close-popup @click="editChangeCategory()">
                            <q-item-section>
                            <q-item-label>{{$t('noCategory')}}</q-item-label>
                            </q-item-section>
                        </q-item>
                        <q-item v-for="category of vulnCategories" :key="category.name" clickable v-close-popup @click="editChangeCategory(category)">
                            <q-item-section>
                            <q-item-label>{{category.name}}</q-item-label>
                            </q-item-section>
                        </q-item>
                    </q-list>
                    </q-btn-dropdown>
                    <div v-if="currentCreatorName" class="vuln-creator" data-testid="vulnerability-created-by">
                        <span class="vuln-creator-label">{{$t('createdBy')}}</span>
                        <span class="vuln-creator-name">{{currentCreatorName}}</span>
                    </div>
                    <draft-recovery-status match-toolbar class="vuln-toolbar-button" />
                    <q-space />
                    <q-btn
                    v-if="vulnUpdates.length > 0"
                    outline
                    color="orange"
                    no-caps
                    icon="o_difference"
                    :label="`${$t('btn.updatesAvailable')} (${vulnUpdates.length})`"
                    class="vuln-toolbar-button q-mr-sm"
                    data-testid="vulnerability-updates-button"
                    @click="updatesModalOpen = true"
                    >
                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">
                            {{ $t('tooltip.vulnerabilityUpdates') }}
                        </q-tooltip>
                    </q-btn>
                    <q-btn
                    v-if="aiQaEnabled && vulnerabilityId"
                    outline
                    icon="o_gpp_good"
                    :label="$t('btn.qa')"
                    no-caps
                    class="vuln-toolbar-button"
                    :class="{'bg-grey-3': vulnQaOpen}"
                    :color="vulnQaOpen ? 'primary' : 'grey-8'"
                    data-testid="vulnerability-qa-toggle"
                    @click="toggleVulnerabilityQaView()"
                    >
                        <q-badge v-if="vulnQaRunning" floating rounded color="orange" class="qa-run-badge" />
                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">
                            {{ $t('tooltip.vulnerabilityQa') }}
                        </q-tooltip>
                    </q-btn>
                    <q-separator
                    v-if="aiQaEnabled && vulnerabilityId && (userStore.isAllowed('vulnerabilities:delete') || userStore.isAllowed('vulnerabilities:update'))"
                    vertical
                    inset
                    class="q-mx-md"
                    />
                    <q-btn
                    v-if="userStore.isAllowed('vulnerabilities:delete')"
                    color="negative"
                    unelevated
                    no-caps
                    icon="delete"
                    :label="$t('btn.delete')"
                    class="vuln-toolbar-button q-mr-sm"
                    data-testid="delete-vulnerability-button"
                    @click="confirmDeleteVulnerability(currentVulnerability)"
                    >
                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('tooltip.delete')}}</q-tooltip>
                    </q-btn>
                    <q-btn
                    v-if="userStore.isAllowed('vulnerabilities:update')"
                    outline
                    :color="saveButtonColor"
                    :text-color="saveButtonTextColor"
                    no-caps
                    class="vuln-toolbar-button q-ml-sm"
                    data-testid="save-vulnerability-button"
                    @click="updateVulnerability()"
                    >
                        <q-icon v-if="saveButtonState === 'saved'" name="check" class="q-mr-sm" />
                        <span>{{saveButtonLabel}}</span>
                        <q-icon v-if="saveButtonState === 'dirty'" name="circle" size="12px" class="q-ml-sm" />
                    </q-btn>
                    <q-separator vertical inset class="q-mx-md" />
                    <q-btn flat icon="close" class="vuln-toolbar-close" data-testid="edit-vulnerability-close" @click="closePane()">
                        <q-tooltip anchor="bottom middle" self="center left" :delay="500" class="text-bold">{{$t('btn.close')}}</q-tooltip>
                    </q-btn>
                </q-bar>

                <div class="row col vuln-modal-content items-stretch no-wrap">
                    <div class="vuln-modal-form" ref="detailScroll">
                <q-card-section>
                    <div class="q-col-gutter-md row">
                        <q-input
                        :label="$t('title')+' *'"
                        stack-label
                        class="col-md-8"
                        autofocus
                        data-testid="edit-vulnerability-title"
                        :error="!!errors.title"
                        :error-message="errors.title"
                        hide-bottom-space
                        @keyup.enter="updateVulnerability()"
                        v-model="currentVulnerability.details[currentDetailsIndex].title"
                        :readonly="vulnReadonly"
                        outlined
                        />
                        <q-select
                        class="col-md-2"
                        :label="$t('type')"
                        v-model="currentVulnerability.details[currentDetailsIndex].vulnType"
                        :options="vulnTypesLang"
                        option-value="name"
                        option-label="name"
                        emit-value
                        map-options
                        options-sanitize
                        :readonly="vulnReadonly"
                        outlined
                        />
                        <q-select
                        :label="$t('language')"
                        stack-label
                        class="col-md-2"
                        v-model="currentLanguage"
                        :options="languages"
                        option-value="locale"
                        option-label="language"
                        map-options
                        emit-value
                        options-sanitize
                        outlined
                        />
                    </div>
                </q-card-section>
                <q-card-section>
                    <q-field borderless :label="$t('description')" stack-label class="basic-editor">
                        <template v-slot="control">
                            <basic-editor
                            ref="basiceditor_description"
                            noAffix
                            :editable="!vulnReadonly"
                            v-model="currentVulnerability.details[currentDetailsIndex].description"
                            :showAiButton="canGenerateAi('description') && isFieldEditable('description')"
                            :aiLoading="isAiFieldLoading('description')"
                            :aiSessionActive="isAiFieldSessionActive('description')"
                            @ai-click="generateFieldDraftAI('description')"
                            />
                        </template>
                    </q-field>
                </q-card-section>
                <q-card-section>
                    <q-field borderless :label="$t('observation')" stack-label class="basic-editor">
                        <template v-slot="control">
                            <basic-editor
                            ref="basiceditor_observation"
                            noAffix
                            :editable="!vulnReadonly"
                            v-model="currentVulnerability.details[currentDetailsIndex].observation"
                            :showAiButton="canGenerateAi('observation') && isFieldEditable('observation')"
                            :aiLoading="isAiFieldLoading('observation')"
                            :aiSessionActive="isAiFieldSessionActive('observation')"
                            @ai-click="generateFieldDraftAI('observation')"
                            />
                        </template>
                    </q-field>
                </q-card-section>
                <q-card-section v-if="$settings.report.public.scoringMethods.CVSS3">
                    <div class="col-md-12">
                        <cvss3-calculator
                        v-model="currentVulnerability.cvssv3"
                        :readonly="vulnReadonly"
                        @cvssScoreChange="currentVulnerability.cvssScore = $event"
                        />
                    </div>
                </q-card-section>
                <q-card-section v-if="$settings.report.public.scoringMethods.CVSS4">
                    <div class="col-md-12">
                        <cvss4-calculator
                        v-model="currentVulnerability.cvssv4"
                        :readonly="vulnReadonly"
                        @cvssScoreChange="currentVulnerability.cvssScore = $event"
                        />
                    </div>
                </q-card-section>
                <q-card-section>
                    <q-field borderless :label="$t('remediation')" stack-label class="basic-editor">
                        <template v-slot="control">
                            <basic-editor
                            ref="basiceditor_remediation"
                            noAffix
                            :editable="!vulnReadonly"
                            v-model="currentVulnerability.details[currentDetailsIndex].remediation"
                            :showAiButton="canGenerateAi('remediation') && isFieldEditable('remediation')"
                            :aiLoading="isAiFieldLoading('remediation')"
                            :aiSessionActive="isAiFieldSessionActive('remediation')"
                            @ai-click="generateFieldDraftAI('remediation')"
                            />
                        </template>
                    </q-field>
                </q-card-section>
                <q-card-section>
                    <div class="q-col-gutter-md row">
                        <q-select
                        :label="$t('remediationComplexity')"
                        stack-label
                        class="col-md-6"
                        v-model="currentVulnerability.remediationComplexity"
                        :options="[{label: $t('easy'), value: 1},{label: $t('medium'), value: 2},{label: $t('complex'), value: 3}]"
                        map-options
                        emit-value
                        options-sanitize
                        :readonly="vulnReadonly"
                        outlined
                        />
                        <q-select
                        :label="$t('remediationPriority')"
                        stack-label
                        class="col-md-6"
                        v-model="currentVulnerability.priority"
                        :options="[{label: $t('low'), value: 1},{label: $t('medium'), value: 2},{label: $t('high'), value: 3},{label: $t('urgent'), value: 4}]"
                        map-options
                        emit-value
                        options-sanitize
                        :readonly="vulnReadonly"
                        outlined
                        />
                    </div>
                </q-card-section>
                <q-card-section>
                    <textarea-array
                    ref="referencesField"
                    framed-header
                    :label="$t('references')"
                    v-model="currentVulnerability.details[currentDetailsIndex].references"
                    :readonly="vulnReadonly"
                    :showAiButton="canGenerateAi('references') && isFieldEditable('references')"
                    :aiLoading="isAiFieldLoading('references')"
                    :aiSessionActive="isAiFieldSessionActive('references')"
                    @ai-click="generateFieldDraftAI('references')"
                    />
                </q-card-section>

                <q-expansion-item
                :label="$t('customFields')"
                default-opened
                header-class="bg-blue-grey-5 text-white"
                expand-icon-class="text-white">
                    <custom-fields
                    ref="customfields"
                    v-model="currentVulnerability.details[currentDetailsIndex].customFields"
                    custom-element="QCardSection"
                    :locale="currentLanguage"
                    :readonly="vulnReadonly"
                    :aiEnabled="aiEnabled"
                    :canGenerateAiForField="canGenerateAi"
                    :isAiGeneratingField="isAiFieldLoading"
                    :isAiFieldSessionActive="isAiFieldSessionActive"
                    :isAiFieldSelectionLocked="isAiFieldSelectionLocked"
                    :generateAiForField="generateCustomFieldDraftAI"
                    />
                </q-expansion-item>
                    </div>

                    <div v-if="vulnQaOpen" class="vuln-modal-ai">
                        <vulnerability-qa-panel
                        :key="`${vulnerabilityId}:${currentLanguage}`"
                        :locale="currentLanguage"
                        :vulnerability-id="vulnerabilityId"
                        :title="currentVulnerability.details[currentDetailsIndex].title"
                        :reload-token="qaReloadToken"
                        @close="closeVulnQa"
                        />
                    </div>

                    <div v-else-if="aiDrawerOpen" class="vuln-modal-ai">
                        <ai-chat-drawer />
                    </div>
                </div>

                <vulnerability-updates-modal
                v-if="vulnUpdates.length > 0"
                ref="updatesModal"
                v-model="updatesModalOpen"
                :vulnerability="currentVulnerability"
                :updates="vulnUpdates"
                :languages="languages"
                :vuln-types="vulnTypes"
                :custom-fields="customFields"
                :readonly="vulnReadonly"
                :save-button-state="saveButtonState"
                :save-button-color="saveButtonColor"
                :save-button-text-color="saveButtonTextColor"
                :save-button-label="saveButtonLabel"
                @save="updateVulnerability()"
                @dismiss="dismissUpdates"
                @dismiss-one="dismissUpdate"
                @dismiss-all="dismissAllUpdates"
                />
            </div>

            <!-- Merge pane -->
            <div v-else-if="activePane === 'merge'" class="col column no-wrap vuln-pane" data-testid="vulnerability-merge-pane">
                <q-bar class="vuln-pane-header vuln-modal-bar">
                    <span>{{$t('mergeVulnerabilities')}}</span>
                    <q-space />
                    <q-btn dense flat icon="close" data-testid="merge-vulnerabilities-close" @click="closePane()" />
                </q-bar>

                <div v-if="languages.length < 2" class="q-pa-md" v-html="$t('mergeVulnerabilitiesInfo')"></div>
                <template v-else>
                    <div class="row col no-wrap items-stretch" style="min-height: 0">
                        <div class="col column no-wrap">
                            <q-card-section>
                                <q-select
                                :label="$t('languageAddFromRight')"
                                v-model="mergeLanguageLeft"
                                :options="languages"
                                option-value="locale"
                                option-label="language"
                                map-options
                                emit-value
                                @update:model-value="mergeVulnLeft = ''"
                                options-sanitize
                                outlined
                                />
                                <q-input
                                v-if="mergeLanguageLeft"
                                v-model="mergeSearchLeft"
                                :placeholder="$t('search')"
                                class="q-mt-sm"
                                dense
                                clearable
                                outlined
                                data-testid="merge-search-left"
                                >
                                    <template v-slot:prepend>
                                        <q-icon name="search" size="xs" />
                                    </template>
                                </q-input>
                            </q-card-section>
                            <q-card-section class="col vuln-merge-list">
                                <q-scroll-area class="full-height">
                                    <q-list>
                                        <q-item tag="label" v-for="vuln of filteredVulnerabilitiesMergeLeft" :key="vuln._id" dense class="q-pl-none">
                                                <q-item-section side top>
                                                    <q-radio v-model="mergeVulnLeft" :val="vuln._id" />
                                                </q-item-section>
                                                <q-item-section>
                                                        <q-item-label>{{getVulnTitleLocale(vuln, mergeLanguageLeft)}}</q-item-label>
                                                </q-item-section>
                                        </q-item>
                                    </q-list>
                                </q-scroll-area>
                            </q-card-section>
                        </div>
                        <q-separator vertical />
                        <div class="col column no-wrap">
                            <q-card-section>
                                <q-select
                                :label="$t('languageMoveToLeft')"
                                v-model="mergeLanguageRight"
                                :options="languages"
                                option-value="locale"
                                option-label="language"
                                map-options
                                emit-value
                                @update:model-value="mergeVulnRight = ''"
                                options-sanitize
                                outlined
                                />
                                <q-input
                                v-if="mergeLanguageRight"
                                v-model="mergeSearchRight"
                                :placeholder="$t('search')"
                                class="q-mt-sm"
                                dense
                                clearable
                                outlined
                                data-testid="merge-search-right"
                                >
                                    <template v-slot:prepend>
                                        <q-icon name="search" size="xs" />
                                    </template>
                                </q-input>
                            </q-card-section>
                            <q-card-section class="col vuln-merge-list">
                                <q-scroll-area class="full-height">
                                    <q-list>
                                        <q-item tag="label" v-for="vuln of filteredVulnerabilitiesMergeRight" :key="vuln._id" dense class="q-pl-none">
                                                <q-item-section side top>
                                                    <q-radio v-model="mergeVulnRight" :val="vuln._id" />
                                                </q-item-section>
                                                <q-item-section>
                                                        <q-item-label>{{getVulnTitleLocale(vuln, mergeLanguageRight)}}</q-item-label>
                                                </q-item-section>
                                        </q-item>
                                    </q-list>
                                </q-scroll-area>
                            </q-card-section>
                        </div>
                    </div>
                    <q-separator />
                    <q-card-actions align="center">
                        <q-btn color="secondary" unelevated @click="mergeVulnerabilities" :disable="mergeVulnLeft === '' || mergeVulnRight === ''">{{$t('merge')}}</q-btn>
                    </q-card-actions>
                </template>
            </div>
        </div>

        <!-- Docked QA-all panel: shown as its own column when no create/edit pane hosts
             the right-hand slot; otherwise the panel renders inside .vuln-modal-ai above. -->
        <template v-if="vulnQaAllDockVisible">
            <q-separator vertical />
            <div class="vuln-qa-dock column no-wrap" data-testid="vulnerability-qa-dock">
                <vulnerability-qa-all-panel
                :expected-count="vulnerabilityQaCount"
                :language-label="dtLanguageLabel"
                @navigate="navigateToVulnerabilityFromQa"
                />
            </div>
        </template>
    </div>
</template>

<script src='./vulnerabilities.js'></script>

<style scoped>
.vuln-page {
    height: calc(100vh - 50px);
    background: #fff;
}

body.body--dark .vuln-page {
    background: var(--q-dark-page, #121212);
}

.vuln-sidebar {
    /* Scale with the viewport (mockup ratio ~1/3 of the screen) while keeping
       usable bounds on small and very large displays. */
    width: clamp(400px, 32vw, 560px);
    min-width: 400px;
    flex-shrink: 0;
}

.vuln-sidebar-language {
    width: 110px;
}

.vuln-list-container {
    overflow: hidden;
    min-height: 0;
}

.vuln-list-item {
    min-height: 64px;
    padding: 10px 16px;
}

.vuln-item-active {
    background: rgba(25, 118, 210, 0.08);
    border-left: 3px solid var(--q-primary);
}

body.body--dark .vuln-item-active {
    background: rgba(144, 202, 249, 0.12);
}

.vuln-status-chip {
    text-transform: uppercase;
    font-size: 10px;
    font-weight: 700;
}

.vuln-status-filter {
    font-size: 13px;
}

.vuln-pane-header {
    background: #fff;
    color: rgba(0, 0, 0, 0.87);
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

body.body--dark .vuln-pane-header {
    background: var(--q-dark, #1d1d1d);
    color: #fff;
    border-bottom-color: rgba(255, 255, 255, 0.28);
}

.vuln-empty-or {
    width: 280px;
}

.vuln-status-count {
    opacity: 0.8;
}

.vuln-cvss-score {
    min-width: 34px;
    text-align: right;
}

.vuln-filter-popover {
    width: 300px;
    max-height: 75vh;
    overflow-y: auto;
}

.vuln-filter-btn {
    height: 40px;
    width: 40px;
    min-height: 40px;
}

.vuln-filter-options {
    max-height: 180px;
    overflow-y: auto;
    margin-top: 4px;
}

.vuln-filter-options .q-checkbox,
.vuln-filter-popover .q-radio {
    min-height: 26px;
}

.vuln-detail {
    min-width: 0;
}

.vuln-pane {
    min-height: 0;
}

.vuln-modal-bar {
    padding: 10px 16px;
    min-height: 64px;
}

.vuln-toolbar-button {
    min-height: 40px;
    padding-left: 16px;
    padding-right: 16px;
    font-size: 14px;
}

/* Keeps every toolbar label on one line so the buttons stay the same height when
   the QA dock or the draft-recovery button squeezes the bar. */
.vuln-toolbar-button :deep(.q-btn__content) {
    flex-wrap: nowrap;
    white-space: nowrap;
}

.vuln-toolbar-close {
    width: 40px;
    height: 40px;
    font-size: 16px;
}

.vuln-creator {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-left: 24px;
    min-width: 110px;
    line-height: 1.25;
}

.vuln-creator-label {
    color: rgba(0, 0, 0, 0.6);
    font-size: 11px;
    font-weight: 600;
}

.vuln-creator-name {
    font-size: 13px;
    font-weight: 500;
    margin-top: 3px;
}

body.body--dark .vuln-creator-label {
    color: rgba(255, 255, 255, 0.7);
}

.vuln-modal-content {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
}

.vuln-modal-content > .vuln-modal-form,
.vuln-modal-content > .vuln-modal-ai {
    align-self: stretch;
    max-height: 100%;
}

.vuln-modal-form {
    overflow-y: auto;
    overflow-x: auto;
    min-height: 0;
    /* The QA/AI panel keeps its own width (below); the form keeps this floor so the
       CVSS matrix doesn't get cramped when the panel is open on narrower screens. */
    flex: 1 1 640px;
    min-width: 640px;
}

.vuln-modal-ai {
    border-left: 1px solid #e0e0e0;
    min-height: 0;
    /* Match the audit QA sidebar width (25% of the viewport) so the QA/AI panel
       is the same size across audits and the vulnerability library. */
    flex: 0 0 25vw;
    min-width: 420px;
    max-height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.vuln-modal-ai :deep(.ai-chat-drawer__panel),
.vuln-modal-ai :deep(.qa-results-panel) {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
}

.vuln-merge-list {
    flex: 1 1 0;
    min-height: 0;
}

/* Docked QA-all column (no create/edit pane open) — same sizing as .vuln-modal-ai so the
   panel doesn't jump when it moves between the dock and the pane slot. */
.vuln-qa-dock {
    flex: 0 0 25vw;
    min-width: 420px;
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
}

.vuln-qa-dock :deep(.qa-results-panel) {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
}
</style>
