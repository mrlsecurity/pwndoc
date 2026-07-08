<template>
  <div class="ai-chat-drawer__panel column full-height" v-if="sessionConfig">
    <q-toolbar class="bg-grey-3">
      <q-icon name="auto_awesome" size="sm" class="q-mr-sm" />
      <q-toolbar-title class="text-subtitle1">{{ sessionConfig.title }}</q-toolbar-title>
      <q-btn icon="close" flat round dense @click="requestClose" />
    </q-toolbar>

    <q-separator v-if="!isFieldMode" />

    <div ref="messagesContainer" class="ai-chat-conversation col q-pa-sm">
      <q-card-section v-if="!isFieldMode" class="q-pa-none q-pb-sm">
        <div class="text-caption text-grey-7 q-mb-xs">{{ $t('aiChat.selectedText') }}</div>
        <div class="ai-chat-context text-body2">{{ sessionConfig.selectedText }}</div>
      </q-card-section>

      <div v-if="!conversation.messages.length" class="text-grey-6 text-center q-pa-md">
        {{ isFieldMode ? $t('aiChat.reviewDefaultPrompt') : $t('aiChat.startPrompt') }}
      </div>
      <div
      v-for="(message, index) in conversation.messages"
      :key="`${sessionId}:${index}`"
      class="q-mb-sm"
      :class="message.role === 'user' ? 'text-right' : 'text-left'"
      >
        <q-chat-message
        :name="message.role === 'user' ? $t('aiChat.you') : $t('aiChat.assistant')"
        :text="[message.content]"
        :sent="message.role === 'user'"
        :bg-color="message.role === 'user' ? 'primary' : 'grey-3'"
        :text-color="message.role === 'user' ? 'white' : 'black'"
        />
        <div
        v-if="message.role === 'assistant' && message.draftPreview"
        class="q-mt-xs q-pa-sm bg-blue-grey-1 rounded-borders text-body2 ai-chat-assistant-response"
        >
          <div class="ProseMirror draft-rendered-diff ai-chat-draft-preview" v-html="message.draftPreview" />
          <div class="q-mt-sm row q-gutter-sm">
            <q-btn
            unelevated
            dense
            no-caps
            :label="isFieldMode ? $t('aiChat.applyField') : $t('aiChat.apply')"
            color="primary"
            :disable="loading"
            @click="applyDraft(message.draft)"
            />
            <q-btn
            v-if="sessionConfig.diffContext"
            outline
            dense
            no-caps
            :label="$t('aiChat.previewChanges')"
            color="primary"
            :disable="loading"
            @click="previewChanges(message.draft)"
            />
          </div>
        </div>
      </div>
      <div v-if="loading" class="text-center q-pa-sm">
        <q-spinner-dots color="primary" size="2em" />
        <div class="text-caption text-grey-7 q-mt-sm">{{ $t('aiChat.generating') }}</div>
      </div>
    </div>

    <q-separator />

    <q-card-section class="q-pt-sm col-auto">
      <q-input
      v-model="conversation.userInput"
      type="textarea"
      autogrow
      outlined
      dense
      class="ai-chat-input"
      :placeholder="isFieldMode ? $t('aiChat.defaultPromptPlaceholder') : $t('aiChat.inputPlaceholder')"
      :disable="loading"
      @keydown.ctrl.enter.prevent="sendMessage"
      @keydown.meta.enter.prevent="sendMessage"
      >
        <template #append>
          <div class="ai-chat-input__actions row items-end no-wrap">
            <q-btn
            v-if="showPromptSelect"
            flat
            dense
            round
            icon="arrow_drop_down"
            class="ai-chat-input__prompt-toggle"
            :aria-label="$t('aiChat.promptSelectLabel')"
            :disable="loading"
            >
              <q-menu anchor="top right" self="bottom right">
                <q-list dense class="ai-chat-prompt-menu">
                  <q-item
                  v-for="option in promptOptions"
                  :key="option.id"
                  clickable
                  v-close-popup
                  :active="selectedPromptId === option.id"
                  active-class="text-primary"
                  @click="selectPrompt(option.id)"
                  >
                    <q-item-section>{{ option.label }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
            <q-btn
            round
            dense
            unelevated
            icon="send"
            color="primary"
            :disable="!canSend"
            :loading="loading"
            :aria-label="$t('aiChat.send')"
            @click="sendMessage"
            />
          </div>
        </template>
      </q-input>
      <div class="text-caption text-grey-6 q-mt-xs">{{ $t('aiChat.sendHint') }}</div>
    </q-card-section>
  </div>
</template>

<script>
import { Dialog } from 'quasar'
import { mapState, mapActions } from 'pinia'
import { useAiGenerationStore } from '@/stores/ai-generation'
import AiService from '@/services/ai'
import AiFieldHelper from '@/services/ai-field-helper'
import { normalizeEditorHtml } from '@/services/editor-html-renderer'
import DraftRecoveryDialog from '@/components/draft-recovery-dialog.vue'
import { $t } from '@/boot/i18n'

export default {
  name: 'AiChatDrawer',

  data() {
    return {
      selectedPromptId: '__default__'
    }
  },

  computed: {
    ...mapState(useAiGenerationStore, {
      sessionConfig: 'sessionConfig',
      sessionId: 'sessionId',
      loading: 'loading',
      conversation: 'conversation'
    }),

    isFieldMode() {
      return !String(this.sessionConfig?.selectedText || '').trim()
    },

    canSend() {
      return !this.loading && !!String(this.conversation.userInput || '').trim()
    },

    promptOptions() {
      if (!this.isFieldMode)
        return []

      const options = [{
        id: '__default__',
        label: this.$t('aiChat.defaultPromptOption'),
        prompt: String(this.sessionConfig?.defaultPrompt || '')
      }]

      const globalPrompts = this.$settings?.ai?.public?.globalPrompts || []
      globalPrompts.forEach((entry) => {
        if (entry?.enabled === false)
          return

        const label = String(entry?.label || '').trim()
        const prompt = String(entry?.prompt || '').trim()
        if (!label || !prompt)
          return

        options.push({
          id: String(entry.id || label),
          label,
          prompt
        })
      })

      return options
    },

    showPromptSelect() {
      return this.promptOptions.length > 1
    }
  },

  watch: {
    sessionId() {
      this.selectedPromptId = '__default__'
    },

    'conversation.messages.length'() {
      this.scrollMessagesToBottom()
    },

    loading(value) {
      if (!value)
        this.scrollMessagesToBottom()
    }
  },

  methods: {
    ...mapActions(useAiGenerationStore, {
      setStoreLoading: 'setLoading',
      completeSession: 'completeSession',
      cancelSession: 'cancelSession',
      closeDrawer: 'closeDrawer'
    }),

    scrollMessagesToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer
        if (container)
          container.scrollTop = container.scrollHeight
      })
    },

    formatDraftPreview(draft) {
      const outputType = this.sessionConfig?.outputType || 'html'

      if (outputType === 'array') {
        const entries = Array.isArray(draft) ? draft : String(draft || '').split('\n')
        return entries
          .map((line) => String(line || '').trim())
          .filter(Boolean)
          .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
          .join('<br/>')
      }

      if (outputType === 'html')
        return normalizeEditorHtml(draft)

      return String(draft || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    },

    selectPrompt(promptId) {
      const option = this.promptOptions.find((entry) => entry.id === promptId)
      if (!option)
        return

      const store = useAiGenerationStore()
      this.selectedPromptId = promptId
      store.conversation.userInput = option.prompt
      store.conversation.confirmedPromptInstruction = ''
    },

    async sendMessage() {
      const store = useAiGenerationStore()
      const prompt = String(store.conversation.userInput || '').trim()
      if (!prompt || this.loading || !this.sessionConfig)
        return

      store.conversation.messages.push({ role: 'user', content: prompt })
      store.conversation.userInput = ''
      this.setStoreLoading(true)

      try {
        const context = { ...(this.sessionConfig.requestParams.context || {}) }
        if (this.isFieldMode) {
          delete context.selectedText
          delete context.selectedHtml
        }

        if (this.isFieldMode && !store.conversation.confirmedPromptInstruction)
          store.conversation.confirmedPromptInstruction = prompt

        const payload = {
          ...this.sessionConfig.requestParams,
          context,
          messages: store.conversation.messages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(0, -1)
            .map((message) => ({
              role: message.role,
              content: message.content
            }))
        }

        if (this.isFieldMode) {
          payload.promptInstruction = store.conversation.confirmedPromptInstruction
          payload.userPrompt = store.conversation.messages.length > 1 ? prompt : ''
        } else {
          payload.userPrompt = prompt
        }

        const response = await AiService.generateFieldDraft(payload)

        const draft = response.data?.datas?.draft
        const reply = String(response.data?.datas?.reply || '').trim()
        if (draft === null || draft === undefined || (typeof draft === 'string' && !draft.trim()) || (Array.isArray(draft) && draft.length === 0))
          throw new Error(this.$t('aiChat.emptyDraft'))

        store.conversation.messages.push({
          role: 'assistant',
          content: reply || this.$t('aiChat.updatedDraft'),
          draft,
          draftPreview: this.formatDraftPreview(draft)
        })
      } catch (err) {
        store.conversation.messages.pop()
        store.conversation.userInput = prompt
        this.$q.notify({
          message: err.response?.data?.datas || err.message || this.$t('aiChat.requestFailed'),
          color: 'negative',
          textColor: 'white',
          position: 'top-right'
        })
      } finally {
        this.setStoreLoading(false)
      }
    },

    applyDraft(draft) {
      if (draft === null || draft === undefined)
        return
      this.completeSession(draft)
    },

    previewChanges(draft) {
      const diffContext = this.sessionConfig?.diffContext
      if (!diffContext)
        return

      const draftData = AiFieldHelper.buildAiDiffDraft(diffContext, draft)
      if (!draftData)
        return

      Dialog.create({
        component: DraftRecoveryDialog,
        componentProps: {
          draft: {
            data: draftData,
            updatedAt: Date.now()
          },
          current: diffContext.current,
          languages: diffContext.languages || []
        }
      })
    },

    requestClose() {
      if (this.loading) {
        Dialog.create({
          title: $t('aiChat.leaveWhileGeneratingTitle'),
          message: $t('aiChat.closeWhileGeneratingMessage'),
          ok: { label: $t('btn.close'), color: 'negative' },
          cancel: { label: $t('btn.stay'), color: 'white' },
          focus: 'cancel'
        })
        .onOk(() => {
          this.cancelSession({ force: true })
        })
        return
      }

      this.closeDrawer()
    }
  }
}
</script>

<style scoped>
.ai-chat-drawer__panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ai-chat-context {
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  padding: 8px;
  white-space: pre-wrap;
  background: #fafafa;
}

.ai-chat-conversation {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.ai-chat-conversation :deep(.q-message-text),
.ai-chat-conversation :deep(.q-message-text-content) {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-chat-draft-preview {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-chat-assistant-response {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.ai-chat-draft-preview :deep(pre) {
  background: black;
  border-radius: 0.5rem;
  color: white;
  font-family: 'JetBrainsMono', monospace;
  margin: 1rem 0;
  max-width: 100%;
  overflow-x: auto;
  padding: 0.75rem 1rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-chat-draft-preview :deep(pre code) {
  background: none;
  color: inherit;
  font-size: 0.8rem;
  padding: 0;
  white-space: inherit;
}

.ai-chat-draft-preview :deep(pre:last-child) {
  margin-bottom: 1rem;
}

.ai-chat-draft-preview :deep(.draft-image) {
  margin: 8px 0;
  text-align: center;
}

.ai-chat-draft-preview :deep(.draft-image img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.ai-chat-draft-preview :deep(.draft-image figcaption),
.ai-chat-draft-preview :deep(legend) {
  display: block;
  width: 100%;
  margin-top: 4px;
  text-align: center;
  font-style: italic;
}

.ai-chat-input :deep(textarea) {
  max-height: 30vh;
  overflow-y: auto;
}

.ai-chat-input :deep(.q-field__append) {
  align-self: flex-end;
  padding-bottom: 2px;
}

.ai-chat-input__actions {
  gap: 2px;
}

.ai-chat-prompt-menu {
  min-width: 180px;
  max-width: 280px;
}
</style>

<style>
.body--dark .ai-chat-context {
  border-color: #444;
  background: #2a2a2a;
}
</style>
