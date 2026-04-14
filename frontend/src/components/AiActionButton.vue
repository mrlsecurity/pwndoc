<template>
    <span v-if="aiEnabled">
        <q-btn
            flat
            dense
            round
            icon="auto_awesome"
            color="purple-6"
            size="sm"
            :loading="loading"
        >
            <q-tooltip>AI Actions</q-tooltip>
            <q-menu>
                <q-list dense style="min-width: 150px">
                    <q-item
                        v-for="action in availableActions"
                        :key="action.id"
                        clickable
                        v-close-popup
                        @click="executeAction(action)"
                    >
                        <q-item-section avatar>
                            <q-icon :name="getActionIcon(action)" size="xs" />
                        </q-item-section>
                        <q-item-section>{{ action.name }}</q-item-section>
                    </q-item>

                    <template v-if="showTranslate">
                        <q-separator />
                        <q-item>
                            <q-item-section>
                                <q-select
                                    v-model="translateLanguage"
                                    :options="languages"
                                    label="Translate to..."
                                    dense
                                    options-dense
                                    @update:model-value="onTranslateSelect"
                                />
                            </q-item-section>
                        </q-item>
                    </template>
                </q-list>
            </q-menu>
        </q-btn>

        <AiPromptDialog ref="promptDialog" />

        <AiResultDialog
            ref="resultDialog"
            :action-label="currentActionLabel"
            :original-content="fieldContent"
            :suggested-content="aiResult"
            @accept="onAccept"
            @decline="onDecline"
            @refine="onRefine"
        />
    </span>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import AIService from 'src/services/ai'
import AiResultDialog from './AiResultDialog.vue'
import AiPromptDialog from './AiPromptDialog.vue'

const $q = useQuasar()

const props = defineProps({
    fieldName: { type: String, required: true },
    fieldContent: { type: String, default: '' },
    findingContext: { type: Object, default: () => ({}) },
    aiEnabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:content'])

const loading = ref(false)
const actions = ref([])
const aiResult = ref('')
const currentActionLabel = ref('')
const translateLanguage = ref(null)
const resultDialog = ref(null)
const promptDialog = ref(null)

// State for refine: remember last action payload so we can replay with a new userPrompt
const lastActionPayload = ref(null)

const languages = [
    'English', 'French', 'German', 'Spanish', 'Italian',
    'Portuguese', 'Dutch', 'Russian', 'Chinese', 'Japanese',
    'Korean', 'Arabic'
]

const availableActions = computed(() => {
    return actions.value.filter(a => {
        if (!a.isEnabled) return false
        if (a.targetFields && a.targetFields.length > 0) {
            return a.targetFields.includes(props.fieldName)
        }
        return true
    }).filter(a => a.builtinAction !== 'translate') // translate handled separately
})

const showTranslate = computed(() => {
    var translateAction = actions.value.find(a => a.builtinAction === 'translate' && a.isEnabled)
    return !!translateAction
})

function getActionIcon(action) {
    var icons = {
        generate: 'edit_note',
        rephrase: 'refresh',
        summarize: 'compress',
        translate: 'translate'
    }
    return icons[action.builtinAction] || 'auto_awesome'
}

async function loadActions() {
    try {
        var response = await AIService.getActions()
        actions.value = response.data.datas
    }
    catch (err) {
        console.error('Failed to load AI actions:', err)
    }
}

async function executeAction(action) {
    var promptResult = await promptDialog.value.open(action.name)
    if (promptResult === null) return  // user cancelled

    loading.value = true
    currentActionLabel.value = action.name

    var payload = {
        action: action.builtinAction || action.id,
        content: props.fieldContent,
        context: props.findingContext,
        targetField: props.fieldName
    }
    if (promptResult.userPrompt) {
        payload.options = { userPrompt: promptResult.userPrompt }
    }
    lastActionPayload.value = payload

    try {
        var response = await AIService.executeAction(payload)
        aiResult.value = response.data.datas.result
        resultDialog.value.show()
    }
    catch (err) {
        $q.notify({
            type: 'negative',
            message: err.response?.data?.datas || 'AI action failed',
            position: 'top'
        })
    }
    finally {
        loading.value = false
    }
}

async function onTranslateSelect(language) {
    if (!language) return

    var promptResult = await promptDialog.value.open(`Translate to ${language}`)
    if (promptResult === null) {
        translateLanguage.value = null
        return
    }

    loading.value = true
    currentActionLabel.value = `Translate to ${language}`

    var options = { language: language }
    if (promptResult.userPrompt) {
        options.userPrompt = promptResult.userPrompt
    }

    var payload = {
        action: 'translate',
        content: props.fieldContent,
        context: props.findingContext,
        targetField: props.fieldName,
        options: options
    }
    lastActionPayload.value = payload

    try {
        var response = await AIService.executeAction(payload)
        aiResult.value = response.data.datas.result
        resultDialog.value.show()
    }
    catch (err) {
        $q.notify({
            type: 'negative',
            message: err.response?.data?.datas || 'Translation failed',
            position: 'top'
        })
    }
    finally {
        loading.value = false
        translateLanguage.value = null
    }
}

async function onRefine({ userPrompt }) {
    if (!lastActionPayload.value) return
    loading.value = true

    // Refine against the previously suggested content so refinements compound
    var payload = {
        ...lastActionPayload.value,
        content: aiResult.value,
        options: {
            ...(lastActionPayload.value.options || {}),
            userPrompt: userPrompt
        }
    }
    lastActionPayload.value = payload

    try {
        var response = await AIService.executeAction(payload)
        aiResult.value = response.data.datas.result
    }
    catch (err) {
        $q.notify({
            type: 'negative',
            message: err.response?.data?.datas || 'Refinement failed',
            position: 'top'
        })
    }
    finally {
        loading.value = false
    }
}

function onAccept(content) {
    emit('update:content', content)
    lastActionPayload.value = null
}

function onDecline() {
    aiResult.value = ''
    lastActionPayload.value = null
}

onMounted(() => {
    if (props.aiEnabled) {
        loadActions()
    }
})
</script>
