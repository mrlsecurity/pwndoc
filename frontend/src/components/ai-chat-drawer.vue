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
        <div v-if="anchorStatus === 'collapsed'" class="text-caption text-warning q-mt-xs">
          {{ $t('aiChat.anchorCollapsed') }}
        </div>
        <div v-else-if="anchorStatus === 'invalid'" class="text-caption text-negative q-mt-xs">
          {{ $t('aiChat.anchorLost') }}
        </div>
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
          <draft-diff
          v-if="message.previewDiffOpen && message.previewDiffDraft"
          chat-preview
          :current="message.previewDiffCurrent"
          :draft="message.previewDiffDraft"
          :languages="sessionConfig.diffContext.languages || []"
          />
          <div
          v-else
          class="ProseMirror draft-rendered-diff ai-chat-draft-preview"
          :data-message-index="index"
          v-html="message.draftPreview"
          />
          <div class="q-mt-sm row q-gutter-sm">
            <q-btn
            unelevated
            dense
            no-caps
            :label="applyLabel(index)"
            color="primary"
            :disable="applyDisabled"
            @click="applyDraft(message, index)"
            />
            <q-btn
            v-if="canInsertAtCursor"
            outline
            dense
            no-caps
            :label="$t('aiChat.insertAtCursor')"
            color="primary"
            :disable="loading"
            @click="insertAtCursor(message, index)"
            />
            <q-btn
            v-if="sessionConfig.diffContext"
            outline
            dense
            no-caps
            :label="message.previewDiffOpen ? $t('aiChat.originalResponse') : $t('aiChat.previewChanges')"
            color="primary"
            :disable="loading"
            @click="togglePreviewDiff(message)"
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
      :readonly="loading"
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
            v-if="loading"
            round
            dense
            unelevated
            icon="stop"
            color="negative"
            :aria-label="$t('aiChat.stop')"
            @click="stopGeneration"
            />
            <q-btn
            v-else
            round
            dense
            unelevated
            icon="send"
            color="primary"
            :disable="!canSend"
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
import axios from 'axios'
import { mapState, mapActions } from 'pinia'
import { useAiGenerationStore } from '@/stores/ai-generation'
import AiService from '@/services/ai'
import AiFieldHelper from '@/services/ai-field-helper'
import { normalizeEditorHtml, denormalizeEditorHtml } from '@/services/editor-html-renderer'
import DraftDiff from '@/components/draft-diff.vue'
import { $t } from '@/boot/i18n'

export default {
  name: 'AiChatDrawer',

  components: {
    DraftDiff
  },

  data() {
    return {
      selectedPromptId: '__default__',
      previewSelection: null,
      cancelTokenSource: null
    }
  },

  computed: {
    ...mapState(useAiGenerationStore, {
      sessionConfig: 'sessionConfig',
      sessionId: 'sessionId',
      loading: 'loading',
      conversation: 'conversation',
      selectionAnchor: 'selectionAnchor'
    }),

    isFieldMode() {
      return !String(this.sessionConfig?.selectedText || '').trim()
    },

    mode() {
      return this.sessionConfig?.mode || (this.isFieldMode ? 'field' : 'selection')
    },

    anchorStatus() {
      if (this.mode !== 'selection')
        return null
      return this.selectionAnchor?.status || null
    },

    canInsertAtCursor() {
      return this.isFieldMode && typeof this.sessionConfig?.onInsertAtCursor === 'function'
    },

    applyDisabled() {
      // anchorStatus is already null outside selection mode, so this alone
      // captures "loading, or the tracked selection was lost".
      return this.loading || this.anchorStatus === 'invalid'
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
      this.previewSelection = null
    },

    'conversation.messages.length'() {
      this.scrollMessagesToBottom()
      this.previewSelection = null
    },

    loading(value) {
      if (!value)
        this.scrollMessagesToBottom()
    }
  },

  mounted() {
    document.addEventListener('selectionchange', this.captureDraftSelection)
  },

  beforeUnmount() {
    document.removeEventListener('selectionchange', this.captureDraftSelection)
  },

  methods: {
    ...mapActions(useAiGenerationStore, {
      setStoreLoading: 'setLoading',
      cancelSession: 'cancelSession',
      closeDrawer: 'closeDrawer',
      applyFieldValue: 'applyFieldValue',
      applyPartialDraft: 'applyPartialDraft',
      insertDraftAtCursor: 'insertDraftAtCursor'
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

      // Guards every store mutation below: if the drawer is closed/cancelled or a new
      // session starts while this request is in flight (including via Stop), a late
      // response or the abort itself must not touch a conversation that has moved on.
      const requestSessionId = store.sessionId

      store.conversation.messages.push({ role: 'user', content: prompt })
      store.conversation.userInput = ''
      this.setStoreLoading(true)
      this.cancelTokenSource = axios.CancelToken.source()

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

        const response = await AiService.generateFieldDraft(payload, { cancelToken: this.cancelTokenSource.token })

        if (store.sessionId !== requestSessionId)
          return

        const draft = response.data?.datas?.draft
        const reply = String(response.data?.datas?.reply || '').trim()
        if (draft === null || draft === undefined || (typeof draft === 'string' && !draft.trim()) || (Array.isArray(draft) && draft.length === 0))
          throw new Error(this.$t('aiChat.emptyDraft'))

        store.conversation.messages.push({
          role: 'assistant',
          content: reply || this.$t('aiChat.updatedDraft'),
          draft,
          draftPreview: this.formatDraftPreview(draft),
          previewDiffOpen: false,
          previewDiffDraft: null,
          previewDiffCurrent: null
        })
      } catch (err) {
        if (store.sessionId !== requestSessionId)
          return

        store.conversation.messages.pop()
        store.conversation.userInput = prompt

        // A user-initiated Stop is not a failure - restore the input silently, no error toast.
        if (!axios.isCancel(err)) {
          this.$q.notify({
            message: err.response?.data?.datas || err.message || this.$t('aiChat.requestFailed'),
            color: 'negative',
            textColor: 'white',
            position: 'top-right'
          })
        }
      } finally {
        if (store.sessionId === requestSessionId) {
          this.setStoreLoading(false)
          this.cancelTokenSource = null
        }
      }
    },

    stopGeneration() {
      if (this.cancelTokenSource)
        this.cancelTokenSource.cancel()
    },

    hasPreviewSelection(index) {
      return !!this.previewSelection && this.previewSelection.messageIndex === index
    },

    applyLabel(index) {
      if (this.hasPreviewSelection(index))
        return this.$t('aiChat.applySelection')
      return this.isFieldMode ? this.$t('aiChat.applyField') : this.$t('aiChat.apply')
    },

    captureDraftSelection() {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        this.previewSelection = null
        return
      }

      const range = selection.getRangeAt(0)
      const anchorNode = range.commonAncestorContainer

      // Cheap bail-out before any DOM walk: selectionchange is document-global,
      // so most events fire for selections made elsewhere on the page.
      if (!this.$refs.messagesContainer?.contains(anchorNode)) {
        this.previewSelection = null
        return
      }

      const anchorEl = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement
      const previewEl = anchorEl?.closest?.('.ai-chat-draft-preview')

      if (!previewEl) {
        this.previewSelection = null
        return
      }

      const messageIndex = Number(previewEl.dataset.messageIndex)
      if (Number.isNaN(messageIndex)) {
        this.previewSelection = null
        return
      }

      const wrapper = document.createElement('div')
      wrapper.appendChild(range.cloneContents())

      this.previewSelection = {
        messageIndex,
        html: wrapper.innerHTML,
        text: selection.toString()
      }
    },

    buildSelectionContent() {
      const outputType = this.sessionConfig?.outputType || 'html'
      const selection = this.previewSelection

      if (outputType === 'html')
        return denormalizeEditorHtml(selection.html)

      if (outputType === 'array') {
        return selection.text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      }

      return selection.text
    },

    // Resolves what a click should act on - the selected fragment if the user
    // highlighted part of the preview, otherwise the whole draft - and clears
    // the selection so it doesn't linger onto the next click.
    resolveDraftContent(message, index) {
      const content = this.hasPreviewSelection(index) ? this.buildSelectionContent() : message.draft
      this.previewSelection = null
      return content
    },

    // "Apply" never ends the session - it writes the current draft (or just
    // the selected fragment) to the field/anchor and the drawer stays open,
    // so the user can keep chatting and apply again as many times as they want.
    applyDraft(message, index) {
      if (message.draft === null || message.draft === undefined)
        return

      const content = this.resolveDraftContent(message, index)

      if (this.isFieldMode)
        this.applyFieldValue(content)
      else
        this.applyPartialDraft(content)
    },

    insertAtCursor(message, index) {
      this.insertDraftAtCursor(this.resolveDraftContent(message, index))
    },

    togglePreviewDiff(message) {
      if (!message.previewDiffOpen) {
        const diffContext = this.sessionConfig?.diffContext
        // Sync editors and clone the entity once, then reuse that single clone
        // for both the "current" side of the diff and as the base buildAiDiffDraft
        // mutates into the "draft" side - avoids syncing/cloning twice per click.
        const current = diffContext?.getDiffEntity ? AiFieldHelper.cloneEntity(diffContext.getDiffEntity()) : null
        message.previewDiffCurrent = current
        message.previewDiffDraft = current ? AiFieldHelper.buildAiDiffDraft(diffContext, message.draft, current) : null
      }

      if (!message.previewDiffDraft || !message.previewDiffCurrent)
        return

      message.previewDiffOpen = !message.previewDiffOpen
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
          this.stopGeneration()
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
