<template>
<div>
    <q-select
    outlined
    emit-value
    map-options
    options-sanitize
    :label="$t('aiIntegration.provider.defaultProviderLabel')"
    class="col-md-4 col-12"
    v-model="settings.ai.public.defaultProvider"
    :options="providerOptions"
    :readonly="!canEdit"
    />

    <q-card-section v-if="canEdit && settings.ai.public.defaultProvider === 'openai'" class="q-gutter-md q-px-none">
        <q-input
        outlined
        :label="$t('aiIntegration.provider.openaiBaseUrl')"
        v-model="settings.ai.private.openaiBaseUrl"
        :readonly="!canEdit"
        />
        <q-input
        outlined
        :label="$t('aiIntegration.provider.openaiModel')"
        v-model="settings.ai.private.openaiModel"
        :readonly="!canEdit"
        />
        <q-input
        outlined
        :type="showOpenAIApiKey ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.openaiApiKey')"
        v-model="openaiApiKeyInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showOpenAIApiKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showOpenAIApiKey = !showOpenAIApiKey"
                />
            </template>
        </q-input>
        <div>
            <q-btn
            outline
            no-caps
            color="primary"
            :label="$t('aiIntegration.provider.testConnection')"
            :loading="testingProvider === 'openai'"
            :disable="testingProvider !== null"
            @click="testConnection('openai')"
            />
            <div v-if="testResults.openai" :class="testResults.openai.ok ? 'text-positive' : 'text-negative'" class="q-mt-xs">
                {{ testResults.openai.message }}
            </div>
        </div>
    </q-card-section>

    <q-card-section v-if="canEdit && settings.ai.public.defaultProvider === 'anthropic'" class="q-gutter-md q-px-none">
        <q-input outlined :label="$t('aiIntegration.provider.anthropicBaseUrl')" v-model="settings.ai.private.anthropicBaseUrl" :readonly="!canEdit" />
        <q-input outlined :label="$t('aiIntegration.provider.anthropicModel')" v-model="settings.ai.private.anthropicModel" :readonly="!canEdit" />
        <q-input outlined :label="$t('aiIntegration.provider.anthropicVersion')" v-model="settings.ai.private.anthropicVersion" :readonly="!canEdit" />
        <q-input
        outlined
        :type="showAnthropicApiKey ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.anthropicApiKey')"
        v-model="anthropicApiKeyInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showAnthropicApiKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showAnthropicApiKey = !showAnthropicApiKey"
                />
            </template>
        </q-input>
        <div>
            <q-btn
            outline
            no-caps
            color="primary"
            :label="$t('aiIntegration.provider.testConnection')"
            :loading="testingProvider === 'anthropic'"
            :disable="testingProvider !== null"
            @click="testConnection('anthropic')"
            />
            <div v-if="testResults.anthropic" :class="testResults.anthropic.ok ? 'text-positive' : 'text-negative'" class="q-mt-xs">
                {{ testResults.anthropic.message }}
            </div>
        </div>
    </q-card-section>

    <q-card-section v-if="canEdit && settings.ai.public.defaultProvider === 'deepseek'" class="q-gutter-md q-px-none">
        <q-input outlined :label="$t('aiIntegration.provider.deepseekBaseUrl')" v-model="settings.ai.private.deepseekBaseUrl" :readonly="!canEdit" />
        <q-input outlined :label="$t('aiIntegration.provider.deepseekModel')" v-model="settings.ai.private.deepseekModel" :readonly="!canEdit" />
        <q-input
        outlined
        :type="showDeepseekApiKey ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.deepseekApiKey')"
        v-model="deepseekApiKeyInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showDeepseekApiKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showDeepseekApiKey = !showDeepseekApiKey"
                />
            </template>
        </q-input>
        <div>
            <q-btn
            outline
            no-caps
            color="primary"
            :label="$t('aiIntegration.provider.testConnection')"
            :loading="testingProvider === 'deepseek'"
            :disable="testingProvider !== null"
            @click="testConnection('deepseek')"
            />
            <div v-if="testResults.deepseek" :class="testResults.deepseek.ok ? 'text-positive' : 'text-negative'" class="q-mt-xs">
                {{ testResults.deepseek.message }}
            </div>
        </div>
    </q-card-section>

    <q-card-section v-if="canEdit && settings.ai.public.defaultProvider === 'ollama'" class="q-gutter-md q-px-none">
        <q-input outlined :label="$t('aiIntegration.provider.ollamaBaseUrl')" v-model="settings.ai.private.ollamaBaseUrl" :readonly="!canEdit" />
        <q-input outlined :label="$t('aiIntegration.provider.ollamaModel')" v-model="settings.ai.private.ollamaModel" :readonly="!canEdit" />
        <q-input
        outlined
        :type="showOllamaApiKey ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.ollamaApiKey')"
        v-model="ollamaApiKeyInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showOllamaApiKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showOllamaApiKey = !showOllamaApiKey"
                />
            </template>
        </q-input>
        <div>
            <q-btn
            outline
            no-caps
            color="primary"
            :label="$t('aiIntegration.provider.testConnection')"
            :loading="testingProvider === 'ollama'"
            :disable="testingProvider !== null"
            @click="testConnection('ollama')"
            />
            <div v-if="testResults.ollama" :class="testResults.ollama.ok ? 'text-positive' : 'text-negative'" class="q-mt-xs">
                {{ testResults.ollama.message }}
            </div>
        </div>
    </q-card-section>

    <q-card-section v-if="canEdit && settings.ai.public.defaultProvider === 'bedrock'" class="q-gutter-md q-px-none">
        <q-input outlined :label="$t('aiIntegration.provider.awsRegion')" v-model="settings.ai.private.bedrockRegion" :readonly="!canEdit" />
        <q-input outlined :label="$t('aiIntegration.provider.bedrockModelId')" v-model="settings.ai.private.bedrockModel" :readonly="!canEdit" />
        <div v-if="!hasBedrockApiKey && !hasBedrockIamCredentials" class="text-caption text-grey-7">
            {{ $t('aiIntegration.provider.bedrockCredentialsHint') }}
        </div>
        <q-input
        outlined
        :type="showBedrockApiKey ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.bedrockApiKey')"
        v-model="bedrockApiKeyInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showBedrockApiKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showBedrockApiKey = !showBedrockApiKey"
                />
            </template>
        </q-input>
        <q-input
        outlined
        :type="showBedrockAccessKeyId ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.awsAccessKeyId')"
        v-model="bedrockAccessKeyIdInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showBedrockAccessKeyId ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showBedrockAccessKeyId = !showBedrockAccessKeyId"
                />
            </template>
        </q-input>
        <q-input
        outlined
        :type="showBedrockSecretAccessKey ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.awsSecretAccessKey')"
        v-model="bedrockSecretAccessKeyInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showBedrockSecretAccessKey ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showBedrockSecretAccessKey = !showBedrockSecretAccessKey"
                />
            </template>
        </q-input>
        <q-input
        outlined
        :type="showBedrockSessionToken ? 'text' : 'password'"
        :label="$t('aiIntegration.provider.awsSessionToken')"
        v-model="bedrockSessionTokenInput"
        :readonly="!canEdit"
        >
            <template v-slot:append>
                <q-icon
                :name="showBedrockSessionToken ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showBedrockSessionToken = !showBedrockSessionToken"
                />
            </template>
        </q-input>
        <div>
            <q-btn
            outline
            no-caps
            color="primary"
            :label="$t('aiIntegration.provider.testConnection')"
            :loading="testingProvider === 'bedrock'"
            :disable="testingProvider !== null"
            @click="testConnection('bedrock')"
            />
            <div v-if="testResults.bedrock" :class="testResults.bedrock.ok ? 'text-positive' : 'text-negative'" class="q-mt-xs">
                {{ testResults.bedrock.message }}
            </div>
        </div>
    </q-card-section>
</div>
</template>
<script>
import AiService from '@/services/ai'

// Must stay byte-for-byte identical to MASKED_SECRET in
// backend/src/lib/settings-secrets.js - see that file for why. Covered by a literal-value
// test in both suites (ai-provider-settings.test.js / settings-secrets.test.js).
const MASKED_SECRET = '••••••••••••••••'

export default {
    name: 'AiProviderSettings',

    props: {
        settings: {
            type: Object,
            required: true
        },
        canEdit: {
            type: Boolean,
            default: false
        }
    },

    data() {
        return {
            providerOptions: [
                {label: 'OpenAI', value: 'openai'},
                {label: 'Anthropic', value: 'anthropic'},
                {label: 'DeepSeek', value: 'deepseek'},
                {label: 'Ollama', value: 'ollama'},
                {label: 'AWS Bedrock', value: 'bedrock'}
            ],
            openaiApiKeyInput: '',
            showOpenAIApiKey: false,
            anthropicApiKeyInput: '',
            showAnthropicApiKey: false,
            deepseekApiKeyInput: '',
            showDeepseekApiKey: false,
            ollamaApiKeyInput: '',
            showOllamaApiKey: false,
            bedrockApiKeyInput: '',
            showBedrockApiKey: false,
            bedrockAccessKeyIdInput: '',
            showBedrockAccessKeyId: false,
            bedrockSecretAccessKeyInput: '',
            showBedrockSecretAccessKey: false,
            bedrockSessionTokenInput: '',
            showBedrockSessionToken: false,
            testingProvider: null,
            testResults: {}
        }
    },

    computed: {
        hasOpenAIApiKey() {
            return this.hasStoredSecret('openaiApiKey')
        },
        hasAnthropicApiKey() {
            return this.hasStoredSecret('anthropicApiKey')
        },
        hasDeepseekApiKey() {
            return this.hasStoredSecret('deepseekApiKey')
        },
        hasOllamaApiKey() {
            return this.hasStoredSecret('ollamaApiKey')
        },
        hasBedrockApiKey() {
            return this.hasStoredSecret('bedrockApiKey')
        },
        hasBedrockIamCredentials() {
            return this.hasStoredSecret('bedrockAccessKeyId') &&
                this.hasStoredSecret('bedrockSecretAccessKey')
        },
        hasBedrockSessionToken() {
            return this.hasStoredSecret('bedrockSessionToken')
        }
    },

    mounted() {
        this.initializeSecretFields()
    },

    methods: {
        hasStoredSecret(field) {
            return Boolean(this.settings?.ai?.private?.[`${field}Configured`])
        },

        maskedValue(stored) {
            return stored ? MASKED_SECRET : ''
        },

        initializeSecretFields() {
            this.openaiApiKeyInput = this.maskedValue(this.hasOpenAIApiKey)
            this.anthropicApiKeyInput = this.maskedValue(this.hasAnthropicApiKey)
            this.deepseekApiKeyInput = this.maskedValue(this.hasDeepseekApiKey)
            this.ollamaApiKeyInput = this.maskedValue(this.hasOllamaApiKey)
            this.bedrockApiKeyInput = this.maskedValue(this.hasBedrockApiKey)
            this.bedrockAccessKeyIdInput = this.maskedValue(this.hasStoredSecret('bedrockAccessKeyId'))
            this.bedrockSecretAccessKeyInput = this.maskedValue(this.hasStoredSecret('bedrockSecretAccessKey'))
            this.bedrockSessionTokenInput = this.maskedValue(this.hasBedrockSessionToken)
        },

        applyPendingKeyUpdates() {
            this.applyKeyUpdate('openaiApiKey', this.openaiApiKeyInput, this.hasOpenAIApiKey)
            this.applyKeyUpdate('anthropicApiKey', this.anthropicApiKeyInput, this.hasAnthropicApiKey)
            this.applyKeyUpdate('deepseekApiKey', this.deepseekApiKeyInput, this.hasDeepseekApiKey)
            this.applyKeyUpdate('ollamaApiKey', this.ollamaApiKeyInput, this.hasOllamaApiKey)
            this.applyKeyUpdate('bedrockApiKey', this.bedrockApiKeyInput, this.hasBedrockApiKey)
            this.applyKeyUpdate(
                'bedrockAccessKeyId',
                this.bedrockAccessKeyIdInput,
                this.hasStoredSecret('bedrockAccessKeyId')
            )
            this.applyKeyUpdate(
                'bedrockSecretAccessKey',
                this.bedrockSecretAccessKeyInput,
                this.hasStoredSecret('bedrockSecretAccessKey')
            )
            this.applyKeyUpdate(
                'bedrockSessionToken',
                this.bedrockSessionTokenInput,
                this.hasBedrockSessionToken
            )
        },

        applyKeyUpdate(field, inputValue, stored) {
            const value = String(inputValue || '')

            if (!stored) {
                if (value.trim())
                    this.settings.ai.private[field] = value.trim()
                return
            }

            if (value === MASKED_SECRET) {
                this.settings.ai.private[field] = MASKED_SECRET
                return
            }

            this.settings.ai.private[field] = value.trim()
        },

        resetKeyInputs() {
            this.initializeSecretFields()
        },

        buildTestPayload(provider) {
            const payloads = {
                openai: () => ({
                    openaiApiKey: this.openaiApiKeyInput,
                    openaiBaseUrl: this.settings.ai.private.openaiBaseUrl,
                    openaiModel: this.settings.ai.private.openaiModel
                }),
                anthropic: () => ({
                    anthropicApiKey: this.anthropicApiKeyInput,
                    anthropicBaseUrl: this.settings.ai.private.anthropicBaseUrl,
                    anthropicModel: this.settings.ai.private.anthropicModel,
                    anthropicVersion: this.settings.ai.private.anthropicVersion
                }),
                deepseek: () => ({
                    deepseekApiKey: this.deepseekApiKeyInput,
                    deepseekBaseUrl: this.settings.ai.private.deepseekBaseUrl,
                    deepseekModel: this.settings.ai.private.deepseekModel
                }),
                ollama: () => ({
                    ollamaApiKey: this.ollamaApiKeyInput,
                    ollamaBaseUrl: this.settings.ai.private.ollamaBaseUrl,
                    ollamaModel: this.settings.ai.private.ollamaModel
                }),
                bedrock: () => ({
                    bedrockApiKey: this.bedrockApiKeyInput,
                    bedrockAccessKeyId: this.bedrockAccessKeyIdInput,
                    bedrockSecretAccessKey: this.bedrockSecretAccessKeyInput,
                    bedrockSessionToken: this.bedrockSessionTokenInput,
                    bedrockRegion: this.settings.ai.private.bedrockRegion,
                    bedrockModel: this.settings.ai.private.bedrockModel
                })
            }

            return payloads[provider] ? payloads[provider]() : {}
        },

        async testConnection(provider) {
            this.testingProvider = provider
            this.testResults = { ...this.testResults, [provider]: null }

            try {
                const response = await AiService.testProvider({
                    provider,
                    ...this.buildTestPayload(provider)
                })
                const model = response.data?.datas?.model
                this.testResults = {
                    ...this.testResults,
                    [provider]: {
                        ok: true,
                        message: model ?
                            this.$t('aiIntegration.provider.testSuccessWithModel', { model }) :
                            this.$t('aiIntegration.provider.testSuccess')
                    }
                }
            } catch (err) {
                this.testResults = {
                    ...this.testResults,
                    [provider]: { ok: false, message: err.response?.data?.datas || this.$t('aiIntegration.provider.testFailed') }
                }
            } finally {
                this.testingProvider = null
            }
        }
    }
}
</script>

