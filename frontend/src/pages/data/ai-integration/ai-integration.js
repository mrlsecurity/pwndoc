import { Notify } from 'quasar';
import DataService from '@/services/data';
import { useUserStore } from '@/stores/user';
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

const QA_CHECK_OPTIONS = [
    {
        key: 'completeness',
        label: 'Report completeness',
        description: 'Minimum report requirements only: audit name, at least one finding, and finding titles. Findings still in redaction are flagged as warnings.'
    },
    {
        key: 'references',
        label: 'Reference links',
        description: 'Validate that HTTP(S) URLs listed in finding references are reachable.'
    },
    {
        key: 'imageCaptions',
        label: 'Image captions',
        description: 'Flag images and figure captions that still use the imported filename (for example screenshot.png).'
    },
    {
        key: 'duplicates',
        label: 'Duplicate templates',
        description: 'Fast structural checks for templates in the same language with the same title or identical description, observation, and remediation content.'
    },
    {
        key: 'aiDuplicates',
        label: 'AI duplicate templates',
        description: 'AI review to identify templates that describe the same underlying vulnerability even when titles differ or content is paraphrased. Uses additional tokens.'
    },
    {
        key: 'aiUnlinkedTranslations',
        label: 'AI unlinked translations',
        description: 'AI review to identify the same vulnerability template stored in separate records for different languages instead of being merged into one multilingual record. Uses additional tokens.'
    },
    {
        key: 'redaction',
        label: 'Redaction guidelines',
        description: 'AI review of report content against organization redaction guidelines.'
    },
    {
        key: 'customer',
        label: 'Customer alignment',
        description: 'AI review that the report content matches the expected customer and company.'
    },
    {
        key: 'instructions',
        label: 'QA instructions',
        description: 'AI review against organization QA instructions below, including any additional required sections or fields you define.'
    }
];

const PROMPT_FIELD_SECTIONS = [
    {
        key: 'definition',
        label: 'Findings — Definition',
        match: (mapping) => {
            return mapping.entityType === 'finding' &&
                ['description', 'observation', 'remediation', 'references'].includes(mapping.fieldKey);
        }
    },
    {
        key: 'proofs',
        label: 'Findings — Proofs',
        match: (mapping) => mapping.entityType === 'finding' && mapping.fieldKey === 'poc'
    },
    {
        key: 'finding-custom',
        label: 'Findings — Custom fields',
        match: (mapping) => mapping.entityType === 'finding' && String(mapping.fieldKey || '').startsWith('custom-field:')
    },
    {
        key: 'sections',
        label: 'Sections',
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
            qaCheckOptions: QA_CHECK_OPTIONS,
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
            return this.section === 'qa' ? 'Quality Assurance' : 'Assisted Writing';
        },

        canViewPage: function() {
            if (this.section === 'qa')
                return this.canReadQa;
            return this.canReadPrompts || this.canReadGuidelines;
        },

        programmaticQaCheckOptions: function() {
            return QA_CHECK_OPTIONS.filter((check) => QA_PROGRAMMATIC_CHECK_KEYS.includes(check.key));
        },

        aiQaCheckOptions: function() {
            return QA_CHECK_OPTIONS.filter((check) => QA_AI_CHECK_KEYS.includes(check.key));
        },

        groupedPromptSections: function() {
            const used = new Set();

            return PROMPT_FIELD_SECTIONS.map((section) => {
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
                    message: err.response?.data?.datas || 'Failed to load AI integration settings',
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
                    message: 'Assisted writing prompts updated successfully',
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || 'Failed to update assisted writing prompts',
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
                    message: 'Redaction guidelines updated successfully',
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || 'Failed to update redaction guidelines',
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
                    message: 'QA settings updated successfully',
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                });
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || 'Failed to update QA settings',
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
