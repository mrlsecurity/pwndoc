<template>
    <q-dialog ref="dialog" persistent @hide="onHide">
        <q-card style="width: 600px; max-width: 95vw;">
            <q-bar class="bg-fixed-primary text-white">
                <q-icon name="auto_awesome" />
                <span class="q-ml-sm">{{ actionLabel || 'AI Action' }}</span>
                <q-space />
                <q-btn dense flat icon="close" @click="cancel" />
            </q-bar>

            <q-card-section>
                <div class="text-subtitle2 q-mb-sm text-grey-7">
                    Optional instructions for the AI
                </div>
                <q-input
                    v-model="userPrompt"
                    type="textarea"
                    autogrow
                    outlined
                    dense
                    autofocus
                    placeholder="e.g. make it more concise, emphasize impact on confidentiality, use a formal tone..."
                    @keydown.ctrl.enter="run"
                    @keydown.meta.enter="run"
                />
                <div class="text-caption text-grey-6 q-mt-xs">
                    Leave blank and click Skip to run the action with no extra instructions.
                </div>
            </q-card-section>

            <q-separator />

            <q-card-actions align="right">
                <q-btn flat color="grey-7" @click="cancel" label="Cancel" />
                <q-btn outline color="secondary" @click="skip" label="Skip" />
                <q-btn color="primary" unelevated @click="run" label="Run" icon="auto_awesome" />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<script setup>
import { ref, defineExpose } from 'vue'

const dialog = ref(null)
const actionLabel = ref('')
const userPrompt = ref('')

var resolver = null
var settled = false

function open(label) {
    actionLabel.value = label || 'AI Action'
    userPrompt.value = ''
    settled = false
    dialog.value.show()
    return new Promise(function(resolve) {
        resolver = resolve
    })
}

function run() {
    settle({ userPrompt: userPrompt.value.trim() || null })
    dialog.value.hide()
}

function skip() {
    settle({ userPrompt: null })
    dialog.value.hide()
}

function cancel() {
    settle(null)
    dialog.value.hide()
}

function onHide() {
    // If hidden without a settle (e.g. ESC), treat as cancel
    settle(null)
}

function settle(value) {
    if (settled) return
    settled = true
    if (resolver) {
        var r = resolver
        resolver = null
        r(value)
    }
}

defineExpose({ open })
</script>
