import { Notify } from 'quasar';
import DataService from '@/services/data';
import { useUserStore } from '@/stores/user';
import { $t } from '@/boot/i18n';
import {
    QA_PROGRAMMATIC_CHECK_KEYS,
    QA_AI_CHECK_KEYS
} from '@/services/qa-checks';

const userStore = useUserStore();

const defaultMarkdownInstructions = () => ({
    delivery: 'inline',
    content: '',
    bedrockPromptCache: {
        cacheReference: '',
        region: ''
    }
});

const defaultQaChecks = () => ({
    completeness: true,
    references: true,
    imageCaptions: true,
    duplicates: true,
    aiDuplicates: true,
    aiUnlinkedTranslations: true,
    redaction: true,
    customer: true,
    instructions: true
});

const QA_CHECK_I18N_KEYS = {
    completeness: 'checkCompleteness',
    references: 'checkReferences',
    imageCaptions: 'checkImageCaptions',
    duplicates: 'checkDuplicates',
    aiDuplicates: 'checkAiDuplicates',
    aiUnlinkedTranslations: 'checkAiUnlinkedTranslations',
    redaction: 'checkRedaction',
    customer: 'checkCustomer',
    instructions: 'checkInstructions'
};

const buildQaCheckOptions = (keys) => {
    return keys.map((key) => ({
        key: key,
        label: $t(`aiIntegration.qa.${QA_CHECK_I18N_KEYS[key]}Label`),
        description: $t(`aiIntegration.qa.${QA_CHECK_I18N_KEYS[key]}Description`)
    }));
};

const PROMPT_FIELD_SECTIONS = () => [
    {
        key: 'definition',
        label: $t('aiIntegration.prompts.sectionDefinition'),
        match: (mapping) => {
            return mapping.entityType === 'finding' &&
                ['description', 'observation', 'remediation', 'references'].includes(mapping.fieldKey);
        }
    },
    {
        key: 'proofs',
        label: $t('aiIntegration.prompts.sectionProofs'),
        match: (mapping) => mapping.entityType === 'finding' && mapping.fieldKey === 'poc'
    },
    {
        key: 'finding-custom',
        label: $t('aiIntegration.prompts.sectionFindingCustom'),
        match: (mapping) => mapping.entityType === 'finding' && String(mapping.fieldKey || '').startsWith('custom-field:')
    },
    {
        key: 'sections',
        label: $t('aiIntegration.prompts.sectionSections'),
        match: (mapping) => mapping.entityType === 'section'
    }
];

const serializePromptMappings = (mappings = []) => {
    return mappings
    .map((mapping) => ({
        entityType: String(mapping.entityType || ''),
        fieldKey: String(mapping.fieldKey || ''),
        enabled: mapping.enabled !== false,
        prompt: String(mapping.prompt || '')
    }))
    .sort((a, b) => `${a.entityType}:${a.fieldKey}`.localeCompare(`${b.entityType}:${b.fieldKey}`));
};

const serializeGlobalPrompts = (prompts = []) => {
    return prompts
    .map((entry) => ({
        id: String(entry.id || ''),
        label: String(entry.label || ''),
        prompt: String(entry.prompt || ''),
        enabled: entry.enabled !== false
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const serializeMarkdownInstructions = (guidelines = {}) => ({
    delivery: String(guidelines.delivery || 'inline'),
    content: String(guidelines.content || ''),
    bedrockPromptCache: {
        cacheReference: String(guidelines.bedrockPromptCache?.cacheReference || ''),
        region: String(guidelines.bedrockPromptCache?.region || '')
    }
});

const serializeQaChecks = (checks = {}) => ({
    completeness: checks.completeness !== false,
    references: checks.references !== false,
    imageCaptions: checks.imageCaptions !== false,
    duplicates: checks.duplicates !== false,
    aiDuplicates: checks.aiDuplicates !== false,
    aiUnlinkedTranslations: checks.aiUnlinkedTranslations !== false,
    redaction: checks.redaction !== false,
    customer: checks.customer !== false,
    instructions: checks.instructions !== false
});

const createGlobalPromptId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    return `global-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default {
    props: {
        section: {
            type: String,
            default: 'writing',
            validator: (value) => ['writing', 'qa'].includes(value)
        }
    },

    data: () => {
        return {
            loading: true,
            savingPrompts: false,
            savingGuidelines: false,
            savingQaSettings: false,
            canEditPrompts: userStore.isAllowed('ai:prompts:update'),
            canEditGuidelines: userStore.isAllowed('ai:redaction-guidelines:update'),
            canEditQa: userStore.isAllowed('ai:qa-instructions:update'),
            canReadPrompts: userStore.isAllowed('ai:prompts:read'),
            canReadGuidelines: userStore.isAllowed('ai:redaction-guidelines:read'),
            canReadQa: userStore.isAllowed('ai:qa-instructions:read'),
            aiEnabled: true,
            promptMappings: [],
            globalPrompts: [],
            redactionGuidelines: defaultMarkdownInstructions(),
            qaInstructions: defaultMarkdownInstructions(),
            qaChecks: defaultQaChecks(),
            writingTab: 'prompts',
            qaTab: 'programmatic',
            orig: {
                promptMappings: [],
                globalPrompts: [],
                redactionGuidelines: serializeMarkdownInstructions(),
                qaInstructions: serializeMarkdownInstructions(),
                qaChecks: serializeQaChecks()
            }
        };
    },

    mounted: function() {
        this.getAiIntegration();
    },

    computed: {
        pageTitle: function() {
            return this.section === 'qa' ? this.$t('aiIntegration.pageTitleQa') : this.$t('aiIntegration.pageTitleWriting');
        },

        canViewPage: function() {
            if (this.section === 'qa')
                return this.canReadQa;
            return this.canReadPrompts || this.canReadGuidelines;
        },

        programmaticQaCheckOptions: function() {
            return buildQaCheckOptions(QA_PROGRAMMATIC_CHECK_KEYS);
        },

        aiQaCheckOptions: function() {
            return buildQaCheckOptions(QA_AI_CHECK_KEYS);
        },

        groupedPromptSections: function() {
            const used = new Set();

            return PROMPT_FIELD_SECTIONS().map((section) => {
                const mappings = this.promptMappings.filter((mapping) => {
                    if (!section.match(mapping))
                        return false;

                    const key = `${mapping.entityType}:${mapping.fieldKey}`;
                    if (used.has(key))
                        return false;

                    used.add(key);
                    return true;
                });

                return {
                    ...section,
                    mappings
                };
            }).filter((section) => section.mappings.length > 0);
        },

        hasPromptChanges: function() {
            return JSON.stringify({
                promptMappings: serializePromptMappings(this.promptMappings),
                globalPrompts: serializeGlobalPrompts(this.globalPrompts)
            }) !== JSON.stringify({
                promptMappings: this.orig.promptMappings,
                globalPrompts: this.orig.globalPrompts
            });
        },

        hasGuidelineChanges: function() {
            return JSON.stringify(
                serializeMarkdownInstructions(this.redactionGuidelines)
            ) !== JSON.stringify(this.orig.redactionGuidelines);
        },

        hasQaInstructionChanges: function() {
            return JSON.stringify(
                serializeMarkdownInstructions(this.qaInstructions)
            ) !== JSON.stringify(this.orig.qaInstructions);
        },

        hasQaCheckChanges: function() {
            return JSON.stringify(
                serializeQaChecks(this.qaChecks)
            ) !== JSON.stringify(this.orig.qaChecks);
        },

        hasQaChanges: function() {
            return this.hasQaInstructionChanges || this.hasQaCheckChanges;
        }
    },

    methods: {
        applyPayload: function(payload) {
            this.aiEnabled = payload.aiEnabled !== false;

            if (Array.isArray(payload.promptMappings)) {
                this.promptMappings = payload.promptMappings.map((mapping) => ({
                    ...mapping,
                    entityType: String(mapping.entityType || ''),
                    enabled: mapping.enabled !== false,
                    prompt: String(mapping.prompt || '')
                }));
                this.orig.promptMappings = serializePromptMappings(this.promptMappings);
            }

            if (Array.isArray(payload.globalPrompts)) {
                this.globalPrompts = payload.globalPrompts.map((entry) => ({
                    id: String(entry.id || ''),
                    label: String(entry.label || ''),
                    prompt: String(entry.prompt || ''),
                    enabled: entry.enabled !== false
                }));
                this.orig.globalPrompts = serializeGlobalPrompts(this.globalPrompts);
            }

            if (payload.redactionGuidelines) {
                const guidelines = payload.redactionGuidelines;
                this.redactionGuidelines = {
                    delivery: guidelines.delivery || 'inline',
                    content: String(guidelines.content || ''),
                    bedrockPromptCache: {
                        cacheReference: String(guidelines.bedrockPromptCache?.cacheReference || ''),
                        region: String(guidelines.bedrockPromptCache?.region || '')
                    }
                };
                this.orig.redactionGuidelines = serializeMarkdownInstructions(this.redactionGuidelines);
            }

            if (payload.qaInstructions || payload.qaChecks) {
                if (payload.qaInstructions) {
                    const qaInstructions = payload.qaInstructions;
                    this.qaInstructions = {
                        delivery: qaInstructions.delivery || 'inline',
                        content: String(qaInstructions.content || ''),
                        bedrockPromptCache: {
                            cacheReference: String(qaInstructions.bedrockPromptCache?.cacheReference || ''),
                            region: String(qaInstructions.bedrockPromptCache?.region || '')
                        }
                    };
                    this.orig.qaInstructions = serializeMarkdownInstructions(this.qaInstructions);
                }

                if (payload.qaChecks) {
                    const qaChecks = payload.qaChecks;
                    this.qaChecks = {
                        completeness: qaChecks.completeness !== false,
                        references: qaChecks.references !== false,
                        imageCaptions: qaChecks.imageCaptions !== false,
                        duplicates: qaChecks.duplicates !== false,
                        aiDuplicates: qaChecks.aiDuplicates !== false,
                        aiUnlinkedTranslations: qaChecks.aiUnlinkedTranslations !== false,
                        redaction: qaChecks.redaction !== false,
                        customer: qaChecks.customer !== false,
                        instructions: qaChecks.instructions !== false
                    };
                    this.orig.qaChecks = serializeQaChecks(this.qaChecks);
                }
            }
        },

        getAiIntegration: function() {
            this.loading = true;
            DataService.getAiIntegration()
            .then((data) => {
                this.applyPayload(data.data.datas || {});
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || this.$t('aiIntegration.loadFailed'),
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .finally(() => {
                this.loading = false;
                if (this.section === 'writing' && !this.canReadPrompts && this.canReadGuidelines)
                    this.writingTab = 'guidelines';
            });
        },

        addGlobalPrompt: function() {
            this.globalPrompts.push({
                id: createGlobalPromptId(),
                label: '',
                prompt: '',
                enabled: true
            });
        },

        removeGlobalPrompt: function(index) {
            this.globalPrompts.splice(index, 1);
        },

        savePrompts: function() {
            if (!this.canEditPrompts || this.savingPrompts)
                return;

            this.savingPrompts = true;
            const completeGlobalPrompts = this.globalPrompts.filter((entry) => {
                return String(entry.label || '').trim() && String(entry.prompt || '').trim();
            });

            DataService.updateAiIntegration({
                promptMappings: this.promptMappings.map((mapping) => ({
                    entityType: mapping.entityType,
                    fieldKey: mapping.fieldKey,
                    enabled: mapping.enabled !== false,
                    prompt: mapping.prompt
                })),
                globalPrompts: serializeGlobalPrompts(completeGlobalPrompts)
            })
            .then((data) => {
                this.applyPayload(data.data.datas || {});
                Notify.create({
                    message: this.$t('aiIntegration.prompts.saveSuccess'),
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || this.$t('aiIntegration.prompts.saveFailed'),
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .finally(() => {
                this.savingPrompts = false;
            });
        },

        saveRedactionGuidelines: function() {
            if (!this.canEditGuidelines || this.savingGuidelines)
                return;

            this.savingGuidelines = true;
            DataService.updateAiIntegration({
                redactionGuidelines: serializeMarkdownInstructions(this.redactionGuidelines)
            })
            .then((data) => {
                this.applyPayload(data.data.datas || {});
                Notify.create({
                    message: this.$t('aiIntegration.guidelines.saveSuccess'),
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || this.$t('aiIntegration.guidelines.saveFailed'),
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .finally(() => {
                this.savingGuidelines = false;
            });
        },

        refreshPublicSettings: async function() {
            if (this.$settings?.refresh)
                await this.$settings.refresh();
        },

        saveQaSettings: function() {
            if (!this.canEditQa || this.savingQaSettings || !this.hasQaChanges)
                return;

            this.savingQaSettings = true;
            const payload = {};

            if (this.hasQaCheckChanges)
                payload.qaChecks = serializeQaChecks(this.qaChecks);

            if (this.hasQaInstructionChanges)
                payload.qaInstructions = serializeMarkdownInstructions(this.qaInstructions);

            DataService.updateAiIntegration(payload)
            .then(async (data) => {
                this.applyPayload(data.data.datas || {});
                await this.refreshPublicSettings();
                Notify.create({
                    message: this.$t('aiIntegration.qa.saveSuccess'),
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || this.$t('aiIntegration.qa.saveFailed'),
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .finally(() => {
                this.savingQaSettings = false;
            });
        }
    }
};
