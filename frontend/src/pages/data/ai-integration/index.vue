<template>
    <div class="row">
        <div class="col-md-10 col-12 offset-md-1 q-mt-md ai-integration-page">
            <div
            v-if="section !== 'qa' || loading || !aiEnabled || !canViewPage"
            class="text-h5 text-weight-bold q-mb-md"
            >
                {{ pageTitle }}
            </div>

            <div v-if="loading" class="q-pa-xl text-center">
                <q-spinner color="primary" size="2em" />
            </div>

            <template v-else-if="!aiEnabled">
                <q-banner dense rounded class="bg-orange-1 text-orange-10">
                    {{ $t('aiIntegration.disabledBanner') }}
                </q-banner>
            </template>

            <template v-else-if="!canViewPage">
                <q-banner dense rounded class="bg-orange-1 text-orange-10">
                    {{ $t('aiIntegration.noPermissionBanner', { page: pageTitle }) }}
                </q-banner>
            </template>

            <template v-else-if="section === 'writing'">
                <q-tabs
                v-if="canReadPrompts || canReadGuidelines"
                v-model="writingTab"
                dense
                no-caps
                class="text-grey-8 ai-integration-tabs q-mb-sm"
                active-color="primary"
                indicator-color="primary"
                align="left"
                >
                    <q-tab v-if="canReadPrompts" name="prompts" :label="$t('aiIntegration.tabPrompts')" />
                    <q-tab v-if="canReadGuidelines" name="guidelines" :label="$t('aiIntegration.tabGuidelines')" />
                </q-tabs>

                <q-tab-panels
                v-if="canReadPrompts || canReadGuidelines"
                v-model="writingTab"
                animated
                class="bg-transparent"
                >
                    <q-tab-panel v-if="canReadPrompts" name="prompts" class="q-pa-none">
                        <div class="text-grey-8 q-mt-md q-mb-md">
                            {{ $t('aiIntegration.prompts.description') }}
                        </div>
                        <div v-if="!canEditPrompts" class="text-orange q-mt-sm q-mb-md">
                            {{ $t('aiIntegration.prompts.readOnly') }}
                        </div>

                        <div class="row q-col-gutter-md ai-integration-columns">
                            <!-- Navigation tree -->
                            <div class="col-12 col-md-3">
                                <q-card bordered flat class="q-pa-md ai-integration-card full-height column no-wrap">
                                    <div class="text-subtitle2 text-weight-medium q-mb-sm">
                                        {{ $t('aiIntegration.prompts.categoriesAndFields') }}
                                    </div>

                                    <q-input
                                    data-testid="prompt-tree-search"
                                    outlined
                                    dense
                                    clearable
                                    v-model="treeFilter"
                                    :placeholder="$t('aiIntegration.prompts.searchAllPlaceholder')"
                                    class="q-mb-sm"
                                    >
                                        <template v-slot:prepend>
                                            <q-icon name="search" />
                                        </template>
                                    </q-input>

                                    <q-tree
                                    data-testid="prompt-tree"
                                    :nodes="promptTreeNodes"
                                    node-key="key"
                                    :selected="selectedNode"
                                    @update:selected="selectTreeNode"
                                    v-model:expanded="expandedNodes"
                                    no-selection-unset
                                    no-connectors
                                    selected-color="primary"
                                    class="ai-integration-tree col ai-integration-scroll-y"
                                    >
                                        <template v-slot:default-header="prop">
                                            <div class="row items-center no-wrap full-width">
                                                <div class="ellipsis">{{ prop.node.label }}</div>
                                                <q-space />
                                                <span class="text-caption text-grey-6 q-ml-sm">{{ prop.node.count }}</span>
                                            </div>
                                        </template>
                                    </q-tree>
                                </q-card>
                            </div>

                            <!-- Prompt list -->
                            <div class="col">
                                <q-card bordered flat class="q-pa-md ai-integration-card full-height column no-wrap">
                                    <div class="row items-center q-col-gutter-sm q-mb-sm col-auto">
                                        <div class="col">
                                            <q-input
                                            data-testid="prompt-table-search"
                                            outlined
                                            dense
                                            clearable
                                            v-model="tableFilter"
                                            :placeholder="$t('aiIntegration.prompts.filterPlaceholder')"
                                            >
                                                <template v-slot:prepend>
                                                    <q-icon name="search" />
                                                </template>
                                            </q-input>
                                        </div>
                                        <template v-if="isGenericNodeSelected && canEditPrompts">
                                            <div v-if="selectedGenericIds.length > 0" class="col-auto">
                                                <q-btn
                                                data-testid="delete-selected-generic"
                                                color="negative"
                                                outline
                                                no-caps
                                                icon="delete"
                                                :label="$t('aiIntegration.prompts.deleteSelected', { count: selectedGenericIds.length })"
                                                @click="deleteSelectedGenericPrompts()"
                                                />
                                            </div>
                                            <div class="col-auto">
                                                <q-btn
                                                data-testid="add-generic-prompt"
                                                color="primary"
                                                unelevated
                                                no-caps
                                                icon="add"
                                                :label="$t('aiIntegration.prompts.addGlobalPrompt')"
                                                @click="openNewGenericEditor()"
                                                />
                                            </div>
                                        </template>
                                    </div>

                                    <div class="col ai-integration-scroll-y">
                                        <!-- Generic prompts: reorderable table -->
                                        <template v-if="isGenericNodeSelected">
                                            <div class="text-caption text-grey-7 q-mb-sm">
                                                {{ $t('aiIntegration.prompts.globalCaption') }}
                                            </div>

                                            <div
                                            v-if="filteredGenericPrompts.length === 0"
                                            class="text-grey-7 q-pa-md text-center"
                                            data-testid="generic-empty"
                                            >
                                                {{ tableFilter.trim() ? $t('aiIntegration.prompts.noFieldsMatch') : $t('aiIntegration.prompts.noGlobalPrompts') }}
                                            </div>

                                            <q-markup-table v-else flat bordered separator="horizontal" data-testid="generic-list">
                                                <thead>
                                                    <tr>
                                                        <th v-if="canReorderGeneric" class="generic-col-drag"></th>
                                                        <th v-if="canEditPrompts" class="generic-col-checkbox"></th>
                                                        <th class="text-left">{{ $t('aiIntegration.prompts.label') }}</th>
                                                        <th class="text-center generic-col-toggle">{{ $t('aiIntegration.prompts.aiAssist') }}</th>
                                                        <th class="text-left">{{ $t('aiIntegration.prompts.columnPrompt') }}</th>
                                                    </tr>
                                                </thead>
                                                <draggable
                                                v-model="genericDragList"
                                                tag="tbody"
                                                item-key="id"
                                                handle=".drag-handle"
                                                ghost-class="drag-ghost"
                                                :disabled="!canReorderGeneric"
                                                >
                                                    <template #item="{ element: entry }">
                                                        <tr
                                                        class="cursor-pointer"
                                                        :class="{ 'prompt-row-active': editor && editor.kind === 'generic' && !editor.isNew && editor.id === entry.id }"
                                                        @click="openGenericEditor(entry)"
                                                        >
                                                            <td v-if="canReorderGeneric" @click.stop>
                                                                <q-icon name="drag_indicator" class="drag-handle cursor-pointer" color="grey" />
                                                            </td>
                                                            <td v-if="canEditPrompts" @click.stop>
                                                                <q-checkbox v-model="selectedGenericIds" :val="entry.id" dense />
                                                            </td>
                                                            <td>{{ entry.label }}</td>
                                                            <td class="text-center" @click.stop>
                                                                <q-toggle
                                                                color="green"
                                                                :model-value="entry.enabled"
                                                                :disable="!canEditPrompts || savingPrompts"
                                                                @update:model-value="(val) => toggleGenericEnabled(entry, val)"
                                                                />
                                                            </td>
                                                            <td class="prompt-preview-cell text-grey-8">{{ entry.prompt }}</td>
                                                        </tr>
                                                    </template>
                                                </draggable>
                                            </q-markup-table>
                                        </template>

                                        <!-- Field prompts table -->
                                        <q-table
                                        v-else
                                        data-testid="prompt-table"
                                        flat
                                        bordered
                                        hide-bottom
                                        :rows="fieldTableRows"
                                        :columns="fieldTableColumns"
                                        :row-key="(row) => `${row.entityType}:${row.fieldKey}`"
                                        v-model:pagination="fieldTablePagination"
                                        :no-data-label="$t('aiIntegration.prompts.noFieldsMatch')"
                                        >
                                            <template v-slot:body="props">
                                                <q-tr
                                                :props="props"
                                                class="cursor-pointer"
                                                :class="{ 'prompt-row-active': isEditorRow(props.row) }"
                                                @click="openFieldEditor(props.row)"
                                                >
                                                    <q-td key="field" :props="props">
                                                        {{ fieldDisplayLabel(props.row) }}
                                                    </q-td>
                                                    <q-td key="enabled" :props="props">
                                                        <q-toggle
                                                        color="green"
                                                        :model-value="props.row.enabled"
                                                        :disable="!canEditPrompts || savingPrompts"
                                                        @update:model-value="(val) => toggleFieldEnabled(props.row, val)"
                                                        />
                                                    </q-td>
                                                    <q-td key="preview" :props="props" class="prompt-preview-cell">
                                                        <span class="text-grey-8">{{ props.row.prompt }}</span>
                                                    </q-td>
                                                </q-tr>
                                            </template>
                                        </q-table>
                                    </div>
                                </q-card>
                            </div>

                            <!-- Editor panel -->
                            <div v-if="editor" class="col-12 col-md-4">
                                <q-card bordered flat data-testid="prompt-editor" class="full-height column no-wrap">
                                    <q-card-section class="row no-wrap col-auto">
                                        <q-breadcrumbs class="text-grey-8 ellipsis q-pt-sm" gutter="xs">
                                            <q-breadcrumbs-el
                                            v-for="(crumb, index) in editorBreadcrumbs"
                                            :key="index"
                                            :label="crumb"
                                            />
                                        </q-breadcrumbs>
                                        <q-space />
                                        <q-btn
                                        data-testid="editor-close"
                                        flat
                                        round
                                        dense
                                        icon="close"
                                        @click="closeEditor()"
                                        />
                                    </q-card-section>

                                    <q-separator />

                                    <q-card-section class="q-gutter-md col ai-integration-scroll-y">
                                        <template v-if="editor.kind === 'field'">
                                            <div class="row items-center">
                                                <q-toggle
                                                data-testid="editor-enabled"
                                                color="green"
                                                v-model="editor.enabled"
                                                :label="$t('aiIntegration.prompts.aiAssist')"
                                                :disable="!canEditPrompts"
                                                />
                                                <q-space />
                                                <q-chip v-if="editorSourceMapping" dense square color="grey-3" text-color="grey-8">
                                                    {{ outputTypeLabel(editorSourceMapping.outputType) }}
                                                </q-chip>
                                            </div>

                                            <q-input
                                            data-testid="editor-prompt"
                                            outlined
                                            dense
                                            type="textarea"
                                            autogrow
                                            counter
                                            :label="$t('aiIntegration.prompts.prompt')"
                                            v-model="editor.prompt"
                                            :readonly="!canEditPrompts"
                                            :disable="!editor.enabled"
                                            :input-style="{ minHeight: '140px' }"
                                            />

                                            <q-banner dense rounded class="bg-grey-3 text-grey-8 prompt-variables-banner">
                                                <div class="text-caption text-weight-medium text-grey-7 q-mb-xs">
                                                    {{ $t('aiIntegration.prompts.variablesTitle') }}
                                                </div>
                                                <code
                                                v-for="variable in editorPromptVariables"
                                                :key="variable"
                                                class="q-mr-sm"
                                                >{{ variableToken(variable) }}</code>
                                            </q-banner>
                                        </template>

                                        <template v-else>
                                            <div class="row items-center" style="gap: 16px">
                                                <div class="col">
                                                    <q-input
                                                    data-testid="editor-label"
                                                    outlined
                                                    dense
                                                    hide-bottom-space
                                                    :label="$t('aiIntegration.prompts.label')"
                                                    v-model="editor.label"
                                                    :readonly="!canEditPrompts"
                                                    />
                                                </div>
                                                <div class="col-auto">
                                                    <q-toggle
                                                    data-testid="editor-enabled"
                                                    color="green"
                                                    v-model="editor.enabled"
                                                    :label="$t('aiIntegration.prompts.enabled')"
                                                    :disable="!canEditPrompts"
                                                    />
                                                </div>
                                            </div>
                                            <div class="text-caption text-grey-7 q-mt-xs">
                                                {{ $t('aiIntegration.prompts.labelHint') }}
                                            </div>

                                            <q-input
                                            data-testid="editor-prompt"
                                            outlined
                                            dense
                                            type="textarea"
                                            autogrow
                                            counter
                                            :label="$t('aiIntegration.prompts.prompt')"
                                            v-model="editor.prompt"
                                            :readonly="!canEditPrompts"
                                            :input-style="{ minHeight: '140px' }"
                                            />
                                        </template>
                                    </q-card-section>

                                    <q-card-actions v-if="canEditPrompts" class="q-px-md q-pb-md">
                                        <q-btn
                                        v-if="editor.kind === 'field' && editorSourceMapping && !editorSourceMapping.usingDefaultPrompt"
                                        data-testid="editor-reset"
                                        flat
                                        no-caps
                                        color="negative"
                                        icon="restart_alt"
                                        :label="$t('aiIntegration.prompts.resetToDefault')"
                                        @click="resetFieldPrompt()"
                                        />
                                        <q-btn
                                        v-if="editor.kind === 'generic' && !editor.isNew"
                                        data-testid="editor-delete"
                                        flat
                                        no-caps
                                        color="negative"
                                        icon="delete"
                                        :label="$t('aiIntegration.prompts.deletePrompt')"
                                        @click="deleteEditorGenericPrompt()"
                                        />
                                        <q-space />
                                        <q-btn
                                        data-testid="editor-save"
                                        color="primary"
                                        unelevated
                                        no-caps
                                        :label="$t('aiIntegration.prompts.saveChanges')"
                                        :disable="!editorCanSave"
                                        :loading="savingEditor"
                                        @click="saveEditor()"
                                        />
                                    </q-card-actions>
                                </q-card>
                            </div>
                        </div>
                    </q-tab-panel>

                    <q-tab-panel v-if="canReadGuidelines" name="guidelines" class="q-pa-none">
                        <q-card bordered flat class="q-pa-md ai-integration-card">
                            <div class="text-grey-8">
                                {{ $t('aiIntegration.guidelines.description') }}
                            </div>
                            <div v-if="!canEditGuidelines" class="text-orange q-mt-sm">
                                {{ $t('aiIntegration.guidelines.readOnly') }}
                            </div>

                            <div class="q-gutter-md q-mt-md">
                                <q-input
                                outlined
                                type="textarea"
                                class="redaction-guidelines-editor"
                                :input-style="{ fontFamily: 'monospace', minHeight: '360px' }"
                                :label="$t('aiIntegration.guidelines.label')"
                                v-model="redactionGuidelines.content"
                                :readonly="!canEditGuidelines || redactionGuidelines.delivery !== 'inline'"
                                :hint="$t('aiIntegration.guidelines.hint')"
                                />
                                <q-banner
                                v-if="redactionGuidelines.delivery === 'bedrock_prompt_cache'"
                                dense
                                class="bg-blue-1 text-blue-10"
                                >
                                    {{ $t('aiIntegration.guidelines.bedrockDelivery') }}
                                    {{ $t('aiIntegration.guidelines.cacheReference') }}: <code>{{ redactionGuidelines.bedrockPromptCache.cacheReference || $t('aiIntegration.guidelines.notSet') }}</code>
                                    <span v-if="redactionGuidelines.bedrockPromptCache.region">
                                        ({{ redactionGuidelines.bedrockPromptCache.region }})
                                    </span>
                                </q-banner>
                            </div>

                            <q-card-actions align="right">
                                <q-btn
                                color="secondary"
                                unelevated
                                no-caps
                                :label="$t('aiIntegration.guidelines.save')"
                                :disable="!canEditGuidelines || !hasGuidelineChanges || redactionGuidelines.delivery !== 'inline'"
                                :loading="savingGuidelines"
                                @click="saveRedactionGuidelines()"
                                />
                            </q-card-actions>
                        </q-card>
                    </q-tab-panel>
                </q-tab-panels>
            </template>

            <template v-else-if="section === 'qa'">
                <q-card bordered flat class="ai-integration-card qa-settings-card q-mb-md">
                    <q-card-section class="q-pa-md">
                        <div class="text-h5 text-weight-bold q-mb-md">{{ pageTitle }}</div>
                        <div class="text-grey-8">
                            {{ $t('aiIntegration.qa.description') }}
                        </div>
                        <div v-if="!canEditQa" class="text-orange q-mt-sm">
                            {{ $t('aiIntegration.qa.readOnly') }}
                        </div>

                <section class="q-mt-lg" aria-labelledby="builtin-checks-heading">
                    <div id="builtin-checks-heading" class="text-subtitle1 text-weight-bold q-mb-sm">
                        {{ $t('aiIntegration.tabProgrammaticChecks') }}
                    </div>
                    <div class="row q-col-gutter-sm">
                            <div v-for="check in programmaticQaCheckOptions" :key="check.key" class="col-12">
                                <q-card bordered flat class="q-pa-md ai-integration-card">
                                    <div class="row items-center q-col-gutter-md">
                                        <div class="col-auto">
                                            <q-avatar rounded size="44px" class="qa-check-avatar qa-check-avatar--builtin">
                                                <q-icon :name="check.icon" size="22px" />
                                            </q-avatar>
                                        </div>
                                        <div class="col">
                                            <div class="text-subtitle2">{{ check.label }}</div>
                                            <div class="text-caption text-grey-7">{{ check.description }}</div>
                                            <div class="q-mt-xs">
                                                <q-chip
                                                v-for="scope in check.scopes"
                                                :key="scope"
                                                dense
                                                square
                                                outline
                                                color="grey-7"
                                                class="q-mr-xs"
                                                >
                                                    {{ scopeLabel(scope) }}
                                                </q-chip>
                                            </div>
                                        </div>
                                        <div class="col-auto row items-center no-wrap">
                                            <span
                                            v-if="qaToggleSaveKey === check.key"
                                            class="qa-toggle-save-status text-caption text-positive q-mr-sm row items-center no-wrap"
                                            >
                                                <q-spinner
                                                v-if="qaToggleSaveState === 'saving'"
                                                color="positive"
                                                size="16px"
                                                />
                                                <template v-else>
                                                    <q-icon name="check_circle" size="18px" class="q-mr-xs" />
                                                    {{ $t('aiIntegration.qa.saved') }}
                                                </template>
                                            </span>
                                            <q-toggle
                                            color="green"
                                            :model-value="qaChecks[check.key]"
                                            :label="$t('aiIntegration.prompts.enabled')"
                                            :disable="!canEditQa || savingQaSettings"
                                            @update:model-value="toggleQaCheck(check.key, $event)"
                                            />
                                        </div>
                                    </div>
                                </q-card>
                            </div>
                        </div>
                </section>

                <section class="q-mt-md" aria-labelledby="ai-checks-heading">
                    <div id="ai-checks-heading" class="text-subtitle1 text-weight-bold q-mb-sm">
                        {{ $t('aiIntegration.tabAiChecks') }}
                    </div>
                    <div class="row q-col-gutter-sm">
                            <div v-for="check in aiQaCheckOptions" :key="check.key" class="col-12">
                                <q-card v-if="check.key !== 'instructions'" bordered flat class="q-pa-md ai-integration-card">
                                    <div class="row items-center q-col-gutter-md">
                                        <div class="col-auto">
                                            <q-avatar rounded size="44px" class="qa-check-avatar qa-check-avatar--ai ai-soft-surface">
                                                <q-icon :name="check.icon" size="22px" class="ai-gradient-icon" />
                                            </q-avatar>
                                        </div>
                                        <div class="col">
                                            <div class="text-subtitle2">{{ check.label }}</div>
                                            <div class="text-caption text-grey-7">{{ check.description }}</div>
                                            <div class="q-mt-xs">
                                                <q-chip
                                                v-for="scope in check.scopes"
                                                :key="scope"
                                                dense
                                                square
                                                outline
                                                color="grey-7"
                                                class="q-mr-xs"
                                                >
                                                    {{ scopeLabel(scope) }}
                                                </q-chip>
                                            </div>
                                        </div>
                                        <div class="col-auto row items-center no-wrap">
                                            <span
                                            v-if="qaToggleSaveKey === check.key"
                                            class="qa-toggle-save-status text-caption text-positive q-mr-sm row items-center no-wrap"
                                            >
                                                <q-spinner
                                                v-if="qaToggleSaveState === 'saving'"
                                                color="positive"
                                                size="16px"
                                                />
                                                <template v-else>
                                                    <q-icon name="check_circle" size="18px" class="q-mr-xs" />
                                                    {{ $t('aiIntegration.qa.saved') }}
                                                </template>
                                            </span>
                                            <q-toggle
                                            color="green"
                                            :model-value="qaChecks[check.key]"
                                            :label="$t('aiIntegration.prompts.enabled')"
                                            :disable="!canEditQa || savingQaSettings"
                                            @update:model-value="toggleQaCheck(check.key, $event)"
                                            />
                                        </div>
                                    </div>
                                </q-card>

                                <q-card v-else bordered flat class="ai-integration-card">
                                    <q-expansion-item v-model="qaInstructionsExpanded" expand-separator>
                                        <template v-slot:header>
                                            <q-item-section avatar>
                                                <q-avatar rounded size="44px" class="qa-check-avatar qa-check-avatar--ai ai-soft-surface">
                                                    <q-icon :name="check.icon" size="22px" class="ai-gradient-icon" />
                                                </q-avatar>
                                            </q-item-section>
                                            <q-item-section>
                                                <q-item-label class="text-subtitle2">{{ check.label }}</q-item-label>
                                                <q-item-label caption>{{ check.description }}</q-item-label>
                                                <div class="q-mt-xs">
                                                    <q-chip
                                                    v-for="scope in check.scopes"
                                                    :key="scope"
                                                    dense
                                                    square
                                                    outline
                                                    color="grey-7"
                                                    class="q-mr-xs"
                                                    >
                                                        {{ scopeLabel(scope) }}
                                                    </q-chip>
                                                </div>
                                            </q-item-section>
                                            <q-item-section side @click.stop>
                                                <div class="row items-center no-wrap">
                                                    <span
                                                    v-if="qaToggleSaveKey === check.key"
                                                    class="qa-toggle-save-status text-caption text-positive q-mr-sm row items-center no-wrap"
                                                    >
                                                        <q-spinner
                                                        v-if="qaToggleSaveState === 'saving'"
                                                        color="positive"
                                                        size="16px"
                                                        />
                                                        <template v-else>
                                                            <q-icon name="check_circle" size="18px" class="q-mr-xs" />
                                                            {{ $t('aiIntegration.qa.saved') }}
                                                        </template>
                                                    </span>
                                                    <q-toggle
                                                    color="green"
                                                    :model-value="qaChecks[check.key]"
                                                    :label="$t('aiIntegration.prompts.enabled')"
                                                    :disable="!canEditQa || savingQaSettings"
                                                    @update:model-value="toggleQaCheck(check.key, $event)"
                                                    />
                                                </div>
                                            </q-item-section>
                                        </template>

                                        <q-card-section class="q-pt-md">
                                            <div class="text-grey-8 q-mb-md">
                                                {{ $t('aiIntegration.qa.instructionsDescription') }}
                                            </div>
                                            <div class="q-gutter-md">
                                <q-input
                                outlined
                                type="textarea"
                                class="qa-instructions-editor"
                                :input-style="{ fontFamily: 'monospace', minHeight: '360px' }"
                                :label="$t('aiIntegration.qa.instructionsLabel')"
                                v-model="qaInstructions.content"
                                :readonly="!canEditQa || qaInstructions.delivery !== 'inline'"
                                :hint="$t('aiIntegration.qa.instructionsHint')"
                                />
                                <q-banner
                                v-if="qaInstructions.delivery === 'bedrock_prompt_cache'"
                                dense
                                class="bg-blue-1 text-blue-10"
                                >
                                    {{ $t('aiIntegration.guidelines.bedrockDelivery') }}
                                    {{ $t('aiIntegration.guidelines.cacheReference') }}: <code>{{ qaInstructions.bedrockPromptCache.cacheReference || $t('aiIntegration.guidelines.notSet') }}</code>
                                    <span v-if="qaInstructions.bedrockPromptCache.region">
                                        ({{ qaInstructions.bedrockPromptCache.region }})
                                    </span>
                                </q-banner>
                                            </div>
                                            <div class="row justify-end q-mt-md">
                                                <q-btn
                                                color="secondary"
                                                unelevated
                                                no-caps
                                                :label="$t('aiIntegration.qa.saveInstructions')"
                                                :disable="!canEditQa || !hasQaInstructionChanges || qaInstructions.delivery !== 'inline'"
                                                :loading="savingQaSettings"
                                                @click="saveQaSettings()"
                                                />
                                            </div>
                                        </q-card-section>
                                    </q-expansion-item>
                                </q-card>
                            </div>
                    </div>
                </section>
                    </q-card-section>

                </q-card>
            </template>
        </div>
    </div>
</template>

<script src="./ai-integration.js"></script>

<style scoped>
.ai-integration-card {
    background: white;
}

.body--dark .ai-integration-card {
    background: var(--q-dark-page);
}

.qa-check-avatar--builtin {
    background: rgba(0, 77, 64, 0.09);
    color: #00695c;
}

.qa-check-avatar--ai {
    color: var(--ai-gradient-end);
}

.ai-integration-columns {
    min-height: 0;
}

/* Set directly on each column rather than on the row: a wrapped flex row's
   "align-items: stretch" doesn't reliably cap a child's cross size when a
   sibling's content (e.g. a fully expanded tree) is taller than the viewport. */
.ai-integration-columns > div {
    height: calc(100vh - 240px);
}

.ai-integration-card.full-height {
    overflow: hidden;
    min-height: 0;
}

.ai-integration-scroll-y {
    min-height: 0;
    overflow-y: auto;
}

.redaction-guidelines-editor :deep(textarea),
.qa-instructions-editor :deep(textarea) {
    line-height: 1.5;
}

.prompt-row-active {
    background: rgba(25, 118, 210, 0.08);
}

.body--dark .prompt-row-active {
    background: rgba(144, 202, 249, 0.12);
}

.prompt-preview-cell {
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prompt-variables-banner code {
    background: rgba(0, 0, 0, 0.06);
    color: inherit;
    white-space: nowrap;
}

.body--dark .prompt-variables-banner code {
    background: rgba(255, 255, 255, 0.1);
}

.drag-ghost {
    opacity: 0.5;
}

.generic-col-drag,
.generic-col-checkbox {
    width: 1%;
}

.generic-col-toggle {
    width: 100px;
}

/* Tree: hide the built-in connector lines and give the selected node the same
   flat highlight used for the active table/list row, instead of relying on
   text color alone. */
.ai-integration-tree :deep(.q-tree__node-header.q-tree__node--selected) {
    background: rgba(25, 118, 210, 0.08);
    border-radius: 4px;
}

.body--dark .ai-integration-tree :deep(.q-tree__node-header.q-tree__node--selected) {
    background: rgba(144, 202, 249, 0.12);
}
</style>
