<template>
    <q-dialog ref="dialog" persistent>
        <q-card style="width: 900px; max-width: 95vw;">
            <q-bar class="bg-fixed-primary text-white">
                <q-icon name="auto_awesome" />
                <span class="q-ml-sm">AI Suggestion — {{ actionLabel }}</span>
                <q-space />
                <q-btn dense flat icon="close" @click="decline" />
            </q-bar>

            <q-card-section class="row q-gutter-md" style="max-height: 60vh; overflow-y: auto;">
                <div class="col">
                    <div class="text-subtitle2 q-mb-sm text-grey-7">Original</div>
                    <div class="ai-content-box" v-html="originalContent"></div>
                </div>
                <q-separator vertical />
                <div class="col">
                    <div class="text-subtitle2 q-mb-sm text-positive">AI Suggestion</div>
                    <div class="ai-content-box" v-html="suggestedContent"></div>
                </div>
            </q-card-section>

            <q-separator />

            <q-card-actions align="right">
                <q-btn color="negative" outline @click="decline" label="Decline" />
                <q-btn color="positive" unelevated @click="accept" label="Accept" />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<script setup>
import { ref, defineProps, defineEmits, defineExpose } from 'vue'

const props = defineProps({
    actionLabel: { type: String, default: '' },
    originalContent: { type: String, default: '' },
    suggestedContent: { type: String, default: '' }
})

const emit = defineEmits(['accept', 'decline'])

const dialog = ref(null)

function show() {
    dialog.value.show()
}

function hide() {
    dialog.value.hide()
}

function accept() {
    emit('accept', props.suggestedContent)
    hide()
}

function decline() {
    emit('decline')
    hide()
}

defineExpose({ show, hide })
</script>

<style scoped>
.ai-content-box {
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    min-height: 100px;
    background: #fafafa;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
}
</style>
