<template>
    <div class="row">
        <div class="col-md-10 col-12 offset-md-1 q-mt-md">
            <q-card>
                <q-card-section class="bg-blue-grey-5 text-white">
                    <div class="text-h6">{{ pageTitle }}</div>
                </q-card-section>

                <q-card-section v-if="loading">
                    <q-spinner color="primary" size="2em" />
                </q-card-section>

                <template v-else-if="!aiEnabled">
                    <q-card-section>
                        <q-banner dense class="bg-orange-1 text-orange-10">
                            {{ $t('aiIntegration.disabledBanner') }}
                        </q-banner>
                    </q-card-section>
                </template>

                <template v-else-if="!canViewPage">
                    <q-card-section>
                        <q-banner dense class="bg-orange-1 text-orange-10">
                            {{ $t('aiIntegration.noPermissionBanner', { page: pageTitle }) }}
                        </q-banner>
                    </q-card-section>
                </template>

                <template v-else-if="section === 'writing'">
                    <q-tabs
                    v-if="canReadPrompts || canReadGuidelines"
                    v-model="writingTab"
                    dense
                    class="text-grey-8"
                    active-color="primary"
                    indicator-color="primary"
                    align="left"
                    >
                        <q-tab v-if="canReadPrompts" name="prompts" :label="$t('aiIntegration.tabPrompts')" />
                        <q-tab v-if="canReadGuidelines" name="guidelines" :label="$t('aiIntegration.tabGuidelines')" />
                    </q-tabs>

                    <q-separator v-if="canReadPrompts || canReadGuidelines" />

                    <q-tab-panels
                    v-if="canReadPrompts || canReadGuidelines"
                    v-model="writingTab"
                    animated
                    >
                        <q-tab-panel v-if="canReadPrompts" name="prompts" class="q-pa-none">
                            <q-card-section>
                                <div class="text-grey-8">
                                    {{ $t('aiIntegration.prompts.description') }}
                                </div>
                                <div v-if="!canEditPrompts" class="text-orange q-mt-sm">
                                    {{ $t('aiIntegration.prompts.readOnly') }}
                                </div>
                            </q-card-section>

                            <q-separator />

                            <q-card-section class="q-pa-none">
                                <q-list bordered separator class="rounded-borders">
                                    <q-expansion-item
                                    default-opened
                                    expand-separator
                                    icon="public"
                                    :label="$t('aiIntegration.prompts.globalLabel')"
                                    :caption="$t('aiIntegration.prompts.globalCaption')"
                                    >
                                        <q-card-section class="q-gutter-md">
                                            <div v-if="globalPrompts.length === 0" class="text-grey-7">
                                                {{ $t('aiIntegration.prompts.noGlobalPrompts') }}
                                            </div>

                                            <q-card
                                            v-for="(entry, index) in globalPrompts"
                                            :key="entry.id"
                                            bordered
                                            flat
                                            class="q-pa-md"
                                            >
                                                <div class="row items-center q-col-gutter-md q-mb-sm">
                                                    <div class="col">
                                                        <q-input
                                                        outlined
                                                        dense
                                                        :label="$t('aiIntegration.prompts.label')"
                                                        v-model="entry.label"
                                                        :readonly="!canEditPrompts"
                                                        :hint="$t('aiIntegration.prompts.labelHint')"
                                                        :error="isGlobalPromptIncomplete(entry) && !entry.label.trim()"
                                                        :error-message="$t('aiIntegration.prompts.labelRequired')"
                                                        />
                                                    </div>
                                                    <div class="col-auto">
                                                        <q-toggle
                                                        v-model="entry.enabled"
                                                        :label="$t('aiIntegration.prompts.enabled')"
                                                        :disable="!canEditPrompts"
                                                        />
                                                    </div>
                                                    <div v-if="canEditPrompts" class="col-auto">
                                                        <q-btn
                                                        flat
                                                        round
                                                        dense
                                                        color="negative"
                                                        icon="delete"
                                                        :aria-label="$t('aiIntegration.prompts.removeGlobalPrompt')"
                                                        @click="removeGlobalPrompt(index)"
                                                        />
                                                    </div>
                                                </div>
                                                <q-input
                                                outlined
                                                type="textarea"
                                                autogrow
                                                :label="$t('aiIntegration.prompts.prompt')"
                                                v-model="entry.prompt"
                                                :readonly="!canEditPrompts"
                                                :disable="!entry.enabled"
                                                :error="isGlobalPromptIncomplete(entry) && !entry.prompt.trim()"
                                                :error-message="$t('aiIntegration.prompts.promptRequired')"
                                                />
                                            </q-card>

                                            <div v-if="canEditPrompts">
                                                <q-btn
                                                flat
                                                color="primary"
                                                no-caps
                                                icon="add"
                                                :label="$t('aiIntegration.prompts.addGlobalPrompt')"
                                                @click="addGlobalPrompt()"
                                                />
                                            </div>
                                        </q-card-section>
                                    </q-expansion-item>
                                </q-list>
                            </q-card-section>

                            <q-card-section>
                                <q-input
                                outlined
                                dense
                                clearable
                                v-model="promptFilter"
                                :label="$t('aiIntegration.prompts.filterLabel')"
                                :placeholder="$t('aiIntegration.prompts.filterPlaceholder')"
                                >
                                    <template v-slot:prepend>
                                        <q-icon name="search" />
                                    </template>
                                </q-input>
                            </q-card-section>

                            <q-card-section class="q-pa-none">
                                <q-list bordered separator class="rounded-borders">
                                    <div v-if="promptFilter.trim() && filteredGroupedPromptSections.length === 0" class="text-grey-7 q-pa-md">
                                        {{ $t('aiIntegration.prompts.noFieldsMatch') }}
                                    </div>

                                    <q-expansion-item
                                    v-for="group in filteredGroupedPromptSections"
                                    :key="group.key"
                                    :model-value="isGroupExpanded(group)"
                                    @update:model-value="(val) => setGroupExpanded(group.key, val)"
                                    expand-separator
                                    icon="article"
                                    :label="group.label"
                                    :caption="$t('aiIntegration.prompts.fieldPromptCount', { count: group.mappings.length })"
                                    >
                                        <q-list separator>
                                            <q-expansion-item
                                            v-for="mapping in group.mappings"
                                            :key="`${mapping.entityType}:${mapping.fieldKey}`"
                                            dense-toggle
                                            group="field"
                                            >
                                                <template v-slot:header>
                                                    <q-item-section avatar>
                                                        <q-toggle
                                                        v-model="mapping.enabled"
                                                        :disable="!canEditPrompts"
                                                        @click.stop
                                                        />
                                                    </q-item-section>
                                                    <q-item-section>
                                                        {{ fieldDisplayLabel(mapping) }}
                                                    </q-item-section>
                                                    <q-item-section side>
                                                        <q-chip dense square color="grey-3" text-color="grey-8">
                                                            {{ outputTypeLabel(mapping.outputType) }}
                                                        </q-chip>
                                                    </q-item-section>
                                                </template>

                                                <q-card-section>
                                                    <q-input
                                                    outlined
                                                    type="textarea"
                                                    autogrow
                                                    :label="$t('aiIntegration.prompts.fieldPromptLabel', { field: fieldDisplayLabel(mapping) })"
                                                    v-model="mapping.prompt"
                                                    :readonly="!canEditPrompts"
                                                    :disable="!mapping.enabled"
                                                    />
                                                </q-card-section>
                                            </q-expansion-item>
                                        </q-list>
                                    </q-expansion-item>
                                </q-list>
                            </q-card-section>

                            <q-card-actions align="right" class="prompts-save-bar">
                                <span v-if="promptDirtyCount > 0" class="text-caption text-grey-7 q-mr-md">
                                    {{ $t('aiIntegration.prompts.unsavedChanges', { count: promptDirtyCount }) }}
                                </span>
                                <q-btn
                                color="secondary"
                                unelevated
                                no-caps
                                :label="$t('aiIntegration.prompts.save')"
                                :disable="!canEditPrompts || !hasPromptChanges"
                                :loading="savingPrompts"
                                @click="savePrompts()"
                                />
                            </q-card-actions>
                        </q-tab-panel>

                        <q-tab-panel v-if="canReadGuidelines" name="guidelines" class="q-pa-none">
                            <q-card-section>
                                <div class="text-grey-8">
                                    {{ $t('aiIntegration.guidelines.description') }}
                                </div>
                                <div v-if="!canEditGuidelines" class="text-orange q-mt-sm">
                                    {{ $t('aiIntegration.guidelines.readOnly') }}
                                </div>
                            </q-card-section>

                            <q-separator />

                            <q-card-section class="q-gutter-md">
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
                            </q-card-section>

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
                        </q-tab-panel>
                    </q-tab-panels>
                </template>

                <template v-else-if="section === 'qa'">
                    <q-card-section>
                        <div class="text-grey-8">
                            {{ $t('aiIntegration.qa.description') }}
                        </div>
                        <div v-if="!canEditQa" class="text-orange q-mt-sm">
                            {{ $t('aiIntegration.qa.readOnly') }}
                        </div>
                    </q-card-section>

                    <q-tabs
                    v-model="qaTab"
                    dense
                    class="text-grey-8"
                    active-color="primary"
                    indicator-color="primary"
                    align="left"
                    >
                        <q-tab name="programmatic" :label="$t('aiIntegration.tabProgrammaticChecks')" />
                        <q-tab name="ai" :label="$t('aiIntegration.tabAiChecks')" />
                    </q-tabs>

                    <q-separator />

                    <q-tab-panels v-model="qaTab" animated>
                        <q-tab-panel name="programmatic" class="q-pa-none">
                            <q-card-section class="q-gutter-sm">
                                <q-card
                                v-for="check in programmaticQaCheckOptions"
                                :key="check.key"
                                bordered
                                flat
                                class="q-pa-md"
                                >
                                    <div class="row items-center q-col-gutter-md">
                                        <div class="col">
                                            <div class="text-subtitle2">{{ check.label }}</div>
                                            <div class="text-caption text-grey-7">{{ check.description }}</div>
                                        </div>
                                        <div class="col-auto">
                                            <q-toggle
                                            v-model="qaChecks[check.key]"
                                            :label="$t('aiIntegration.prompts.enabled')"
                                            :disable="!canEditQa"
                                            />
                                        </div>
                                    </div>
                                </q-card>
                            </q-card-section>
                        </q-tab-panel>

                        <q-tab-panel name="ai" class="q-pa-none">
                            <q-card-section class="q-gutter-sm">
                                <q-card
                                v-for="check in aiQaCheckOptions"
                                :key="check.key"
                                bordered
                                flat
                                class="q-pa-md"
                                >
                                    <div class="row items-center q-col-gutter-md">
                                        <div class="col">
                                            <div class="text-subtitle2">{{ check.label }}</div>
                                            <div class="text-caption text-grey-7">{{ check.description }}</div>
                                        </div>
                                        <div class="col-auto">
                                            <q-toggle
                                            v-model="qaChecks[check.key]"
                                            :label="$t('aiIntegration.prompts.enabled')"
                                            :disable="!canEditQa"
                                            />
                                        </div>
                                    </div>
                                </q-card>
                            </q-card-section>

                            <q-separator />

                            <q-card-section>
                                <div class="text-subtitle2 q-mb-sm">{{ $t('aiIntegration.qa.instructionsTitle') }}</div>
                                <div class="text-grey-8 q-mb-md">
                                    {{ $t('aiIntegration.qa.instructionsDescription') }}
                                </div>
                            </q-card-section>

                            <q-card-section class="q-gutter-md q-pt-none">
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
                            </q-card-section>
                        </q-tab-panel>
                    </q-tab-panels>

                    <q-card-actions align="right">
                        <q-btn
                        color="secondary"
                        unelevated
                        no-caps
                        :label="$t('aiIntegration.qa.save')"
                        :disable="!canEditQa || !hasQaChanges || (hasQaInstructionChanges && qaInstructions.delivery !== 'inline')"
                        :loading="savingQaSettings"
                        @click="saveQaSettings()"
                        />
                    </q-card-actions>
                </template>
            </q-card>
        </div>
    </div>
</template>

<script src="./ai-integration.js"></script>

<style scoped>
.redaction-guidelines-editor :deep(textarea),
.qa-instructions-editor :deep(textarea) {
    line-height: 1.5;
}

.ai-integration-save-bar,
.prompts-save-bar {
    position: sticky;
    bottom: 0;
    background: white;
    z-index: 1;
    border-top: 1px solid rgba(0, 0, 0, 0.12);
}

:deep(.body--dark) .ai-integration-save-bar,
:deep(.body--dark) .prompts-save-bar {
    background: var(--q-dark-page);
}
</style>
