<template>
    <div class="col-12 q-pa-md ai-integration-page">
        <div
        class="text-h5 text-weight-bold q-mb-md"
        >
            {{ pageTitle }}
        </div>

        <div v-if="loading" class="q-pa-xl text-center">
            <q-spinner color="primary" size="2em" />
        </div>

        <template v-else-if="!canViewPage">
            <q-banner dense rounded class="bg-orange-1 text-orange-10">
                {{ $t('aiIntegration.noPermissionBanner', { page: pageTitle }) }}
            </q-banner>
        </template>

        <template v-else>
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
                                        :label="$t(qaChecks[check.key] ? 'aiIntegration.prompts.enabled' : 'aiIntegration.prompts.disabled')"
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
                <div id="ai-checks-heading" class="text-subtitle1 text-weight-bold q-mb-sm row items-center no-wrap">
                    <span>{{ $t('aiIntegration.tabAiChecks') }}</span>
                    <q-chip v-if="!aiEnabled" dense square :ripple="false" class="q-ml-sm qa-ai-disabled-chip">
                        {{ $t('aiIntegration.qa.aiChecksDisabledChip') }}
                    </q-chip>
                </div>
                <q-banner v-if="!aiEnabled" dense rounded class="qa-ai-disabled-banner q-mb-sm">
                    <template v-slot:avatar>
                        <q-icon name="info" size="20px" class="qa-ai-disabled-banner__icon" />
                    </template>
                    {{ $t('aiIntegration.qa.aiChecksDisabledBefore') }}
                    <router-link to="/settings" class="qa-ai-disabled-banner__link">{{ $t('aiIntegration.qa.aiChecksDisabledLink') }}</router-link>
                    {{ $t('aiIntegration.qa.aiChecksDisabledAfter') }}
                </q-banner>
                <div class="row q-col-gutter-sm">
                        <div v-for="check in aiQaCheckOptions" :key="check.key" class="col-12">
                            <q-card v-if="check.key !== 'instructions'" bordered flat class="q-pa-md ai-integration-card" :class="{ 'qa-ai-card--disabled': !aiEnabled }">
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
                                        :label="$t(qaChecks[check.key] ? 'aiIntegration.prompts.enabled' : 'aiIntegration.prompts.disabled')"
                                        :disable="!canEditQa || savingQaSettings || !aiEnabled"
                                        @update:model-value="toggleQaCheck(check.key, $event)"
                                        />
                                    </div>
                                </div>
                            </q-card>

                            <q-card v-else bordered flat class="ai-integration-card" :class="{ 'qa-ai-card--disabled': !aiEnabled }">
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
                                                :label="$t(qaChecks[check.key] ? 'aiIntegration.prompts.enabled' : 'aiIntegration.prompts.disabled')"
                                                :disable="!canEditQa || savingQaSettings || !aiEnabled"
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
                            :readonly="!canEditQa"
                            :hint="$t('aiIntegration.qa.instructionsHint')"
                            />
                                        </div>
                                        <div class="row justify-end q-mt-md">
                                            <q-btn
                                            color="secondary"
                                            unelevated
                                            no-caps
                                            :label="$t('aiIntegration.qa.saveInstructions')"
                                            :disable="!canEditQa || !hasQaInstructionChanges"
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
        </template>
    </div>
</template>

<script src="./quality-assurance.js"></script>

<style scoped>
.ai-integration-card {
    background: white;
}

.qa-check-avatar--builtin {
    background: rgba(0, 77, 64, 0.09);
    color: #00695c;
}

.qa-check-avatar--ai {
    color: var(--ai-gradient-end);
}

.qa-instructions-editor :deep(textarea) {
    line-height: 1.5;
}

/* AI-disabled state: light grey info banner + faded, non-interactive AI cards. */
.qa-ai-disabled-chip {
    background: rgba(0, 0, 0, 0.06);
    color: #616161;
    font-weight: 500;
}

.qa-ai-disabled-banner {
    background: #f5f6f8;
    border: 1px solid rgba(0, 0, 0, 0.08);
    color: #55606e;
}

.qa-ai-disabled-banner__icon {
    color: var(--q-primary);
}

.qa-ai-disabled-banner__link {
    color: var(--q-primary);
    text-decoration: none;
}

.qa-ai-disabled-banner__link:hover {
    text-decoration: underline;
}

.qa-ai-card--disabled {
    opacity: 0.55;
}
</style>

<style>
.body--dark .ai-integration-card {
    background: #1d1d1d;
}

.body--dark .qa-ai-disabled-banner {
    background: #26282c;
    border-color: rgba(255, 255, 255, 0.09);
    color: #b0b6c0;
}

.body--dark .qa-ai-disabled-chip {
    background: rgba(255, 255, 255, 0.1);
    color: #c0c4cc;
}
</style>
