<template>
  <div class="ai-chat-drawer__panel column full-height" v-if="sessionConfig">
    <q-toolbar class="ai-chat-toolbar">
      <q-icon name="auto_awesome" size="sm" class="q-mr-sm ai-gradient-icon" />
      <q-toolbar-title class="text-subtitle1">{{ sessionConfig.title }}</q-toolbar-title>
      <q-btn icon="close" flat round dense @click="requestClose" />
    </q-toolbar>

    <q-separator v-if="!isFieldMode" />

    <div
    ref="messagesContainer"
    class="ai-chat-conversation col q-pa-md"
    :class="{ 'ai-chat-conversation--prompt-browser': isFieldMode && !conversation.messages.length }"
    >
      <q-card-section v-if="!isFieldMode" class="q-pa-none q-pb-sm">
        <div class="text-caption text-grey-7 q-mb-xs">{{ $t('aiChat.selectedText') }}</div>
        <div class="ai-chat-context ai-soft-surface text-body2">{{ sessionConfig.selectedText }}</div>
        <div v-if="anchorStatus === 'collapsed'" class="text-caption text-warning q-mt-xs">
          {{ $t('aiChat.anchorCollapsed') }}
        </div>
        <div v-else-if="anchorStatus === 'invalid'" class="text-caption text-negative q-mt-xs">
          {{ $t('aiChat.anchorLost') }}
        </div>
      </q-card-section>

      <div v-if="!conversation.messages.length && !isFieldMode" class="text-grey-6 text-center q-pa-md">
        {{ $t('aiChat.startPrompt') }}
      </div>
      <div v-else-if="!conversation.messages.length" class="ai-chat-prompt-browser">
        <div class="ai-chat-prompt-greeting text-h6 text-weight-medium">
          {{ $t('aiChat.howCanIHelp') }}
        </div>
        <q-input
        v-model="promptSearch"
        dense
        outlined
        clearable
        class="ai-chat-prompt-search"
        :placeholder="$t('aiChat.searchPrompts')"
        :aria-label="$t('aiChat.searchPrompts')"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
        <ai-prompt-list
        fill-available
        :sections="promptSections"
        :selected-prompt-id="selectedPromptId"
        :no-results-label="$t('aiChat.noPromptsFound')"
        :default-hint="$t('aiChat.defaultPromptHint')"
        :use-label="$t('aiChat.usePrompt')"
        @select="selectPrompt"
        />
      </div>
      <div
      v-for="(message, index) in conversation.messages"
      :key="`${sessionId}:${index}`"
      class="q-mb-sm"
      :class="message.role === 'user' ? 'text-right' : 'text-left'"
      >
        <q-chat-message
        :class="message.role === 'user' ? 'ai-chat-message--user' : 'ai-chat-message--assistant'"
        :name="message.role === 'user' ? $t('aiChat.you') : $t('aiChat.assistant')"
        :text="[message.content]"
        :sent="message.role === 'user'"
        :bg-color="message.role === 'user' ? 'indigo-1' : 'transparent'"
        :text-color="message.role === 'user' ? 'indigo-10' : 'grey-10'"
        />
        <template v-if="message.role === 'assistant' && message.draftPreview">
          <div class="q-mt-sm text-body2 ai-chat-assistant-response">
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
          </div>
          <div class="ai-chat-response-actions row q-gutter-sm">
            <q-btn
            unelevated
            dense
            no-caps
            class="ai-primary-btn"
            :label="applyLabel(index)"
            :disable="applyDisabled"
            @click="applyDraft(message, index)"
            />
            <q-btn
            v-if="canInsertAtCursor"
            dense
            outline
            no-caps
            class="ai-secondary-btn"
            :label="$t('aiChat.insertAtCursor')"
            :disable="loading"
            @click="insertAtCursor(message, index)"
            />
            <q-btn
            v-if="sessionConfig.diffContext"
            outline
            dense
            no-caps
            class="ai-secondary-btn"
            :label="message.previewDiffOpen ? $t('aiChat.originalResponse') : $t('aiChat.previewChanges')"
            :disable="loading"
            @click="togglePreviewDiff(message)"
            />
          </div>
        </template>
      </div>
      <div v-if="loading" class="text-center q-pa-sm">
        <q-spinner-dots color="deep-purple-12" size="2em" />
        <div class="text-caption text-grey-7 q-mt-sm">{{ $t('aiChat.generating') }}</div>
      </div>
    </div>

    <q-separator />

    <q-card-section class="ai-chat-composer q-pt-sm col-auto">
      <q-input
      v-model="conversation.userInput"
      type="textarea"
      autogrow
      outlined
      dense
      class="ai-chat-input"
      ref="messageInput"
      :placeholder="isFieldMode ? $t('aiChat.askAnything') : $t('aiChat.inputPlaceholder')"
      :readonly="loading"
      @keydown.ctrl.enter.prevent="sendMessage"
      @keydown.meta.enter.prevent="sendMessage"
      >
        <template #append>
          <div class="ai-chat-input__actions row items-end no-wrap">
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
            icon="arrow_upward"
            class="ai-primary-btn q-pa-12"
            :disable="!canSend"
            :aria-label="$t('aiChat.send')"
            @click="sendMessage"
            />
          </div>
        </template>
      </q-input>
      <q-btn
      v-if="isFieldMode && conversation.messages.length"
      ref="promptSelector"
      outline
      no-caps
      dense
      icon="auto_awesome"
      icon-right="expand_more"
      class="ai-chat-prompt-selector full-width q-mt-sm"
      :label="$t('aiChat.browsePrompts')"
      :disable="loading"
      :aria-label="$t('aiChat.promptSelectLabel')"
      >
        <q-menu
        ref="promptMenu"
        anchor="top left"
        self="bottom left"
        class="ai-chat-prompt-menu"
        :style="promptMenuStyle"
        @before-show="preparePromptMenu"
        >
          <ai-prompt-list
          close-on-select
          :sections="promptSections"
          :selected-prompt-id="selectedPromptId"
          :no-results-label="$t('aiChat.noPromptsFound')"
          :default-hint="$t('aiChat.defaultPromptHint')"
          :use-label="$t('aiChat.usePrompt')"
          @select="selectPrompt"
          />
          <div class="q-pa-sm">
            <q-input
            v-model="promptSearch"
            dense
            outlined
            clearable
            autofocus
            class="ai-chat-prompt-search"
            :placeholder="$t('aiChat.searchPrompts')"
            :aria-label="$t('aiChat.searchPrompts')"
            >
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
        </q-menu>
      </q-btn>
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
import AiPromptList from '@/components/ai-prompt-list.vue'
import { $t } from '@/boot/i18n'

const PROMPT_USAGE_STORAGE_KEY = 'ai_prompt_usage'
const DEFAULT_PROMPT_ID = '__default__'
const MOST_USED_PROMPT_LIMIT = 5

export default {
  name: 'AiChatDrawer',

  components: {
    DraftDiff,
    AiPromptList
  },

  data() {
    return {
      selectedPromptId: null,
      promptSearch: '',
      promptMenuWidth: null,
      promptUsage: {},
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
        id: DEFAULT_PROMPT_ID,
        label: this.$t('aiChat.defaultPromptOption'),
        prompt: String(this.sessionConfig?.defaultPrompt || ''),
        isDefault: true,
        configuredIndex: -1
      }]

      const globalPrompts = this.$settings?.ai?.public?.globalPrompts || []
      globalPrompts.forEach((entry, configuredIndex) => {
        if (entry?.enabled === false)
          return

        const label = String(entry?.label || '').trim()
        const prompt = String(entry?.prompt || '').trim()
        if (!label || !prompt)
          return

        options.push({
          id: String(entry.id || label),
          label,
          prompt,
          isDefault: false,
          configuredIndex
        })
      })

      return options
    },

    rankedGlobalPrompts() {
      return this.promptOptions
        .filter((option) => !option.isDefault)
        .sort((left, right) => {
          const usageDifference = this.promptUsageCount(right.id) - this.promptUsageCount(left.id)
          return usageDifference || left.configuredIndex - right.configuredIndex
        })
    },

    promptSections() {
      const query = String(this.promptSearch || '').trim().toLocaleLowerCase()
      if (query) {
        const matches = this.promptOptions.filter((option) => {
          return `${option.label}\n${option.prompt}`.toLocaleLowerCase().includes(query)
        })
        return matches.length ? [{ id: 'results', label: this.$t('aiChat.searchResults'), icon: 'search', options: matches }] : []
      }

      const defaultPrompt = this.promptOptions.find((option) => option.isDefault)
      const mostUsed = this.rankedGlobalPrompts.slice(0, MOST_USED_PROMPT_LIMIT)
      const remaining = this.rankedGlobalPrompts.slice(MOST_USED_PROMPT_LIMIT)
      return [
        { id: 'default', label: this.$t('aiChat.fieldPrompt'), options: defaultPrompt ? [defaultPrompt] : [] },
        { id: 'most-used', label: this.$t('aiChat.recentPrompts'), icon: 'history', options: mostUsed },
        { id: 'all', label: this.$t('aiChat.allPrompts'), icon: 'format_list_bulleted', options: remaining }
      ].filter((section) => section.options.length)
    },

    promptMenuStyle() {
      if (!this.promptMenuWidth)
        return undefined

      const width = `${this.promptMenuWidth}px`
      return { width, minWidth: width, maxWidth: width }
    }
  },

  watch: {
    sessionId() {
      this.selectedPromptId = null
      this.promptSearch = ''
      this.previewSelection = null
    },

    'conversation.messages.length'() {
      this.scrollMessagesToBottom()
      this.previewSelection = null
    },

    loading(value) {
      if (!value)
        this.scrollMessagesToBottom()
    },

    promptSearch() {
      this.$nextTick(() => this.$refs.promptMenu?.updatePosition?.())
    }
  },

  mounted() {
    this.loadPromptUsage()
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

    loadPromptUsage() {
      try {
        const parsed = JSON.parse(localStorage.getItem(PROMPT_USAGE_STORAGE_KEY) || '{}')
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          this.promptUsage = {}
          return
        }

        this.promptUsage = Object.fromEntries(Object.entries(parsed).filter(([, count]) => {
          return Number.isInteger(count) && count >= 0
        }))
      } catch (_err) {
        this.promptUsage = {}
      }
    },

    promptUsageCount(promptId) {
      return Number(this.promptUsage[promptId]) || 0
    },

    recordPromptUsage(promptId) {
      if (!promptId || promptId === DEFAULT_PROMPT_ID)
        return

      const option = this.promptOptions.find((entry) => entry.id === promptId && !entry.isDefault)
      if (!option)
        return

      this.promptUsage = {
        ...this.promptUsage,
        [promptId]: this.promptUsageCount(promptId) + 1
      }

      try {
        localStorage.setItem(PROMPT_USAGE_STORAGE_KEY, JSON.stringify(this.promptUsage))
      } catch (_err) {
        // Prompt selection must keep working when browser storage is unavailable.
      }
    },

    resetPromptSearch() {
      this.promptSearch = ''
    },

    preparePromptMenu() {
      this.resetPromptSearch()
      const selector = this.$refs.promptSelector?.$el || this.$refs.promptSelector
      const width = selector?.getBoundingClientRect?.().width
      this.promptMenuWidth = Number.isFinite(width) && width > 0 ? Math.floor(width) : null
    },

    selectPrompt(promptId) {
      const option = this.promptOptions.find((entry) => entry.id === promptId)
      if (!option)
        return

      const store = useAiGenerationStore()
      this.selectedPromptId = promptId
      store.conversation.userInput = option.prompt
      store.conversation.confirmedPromptInstruction = ''
      this.$nextTick(() => this.$refs.messageInput?.focus?.())
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
      const requestPromptId = this.selectedPromptId

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
        this.recordPromptUsage(requestPromptId)
        this.selectedPromptId = null
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
  background: #fcfcff;
  color: #17152f;
}

.ai-chat-toolbar {
  min-height: 52px;
  background: #fafaff;
  border-bottom: 1px solid #e8eaf6;
}

.ai-chat-context {
  border: 1px solid #dfe3f8;
  border-radius: 8px;
  padding: 10px 12px;
  white-space: pre-wrap;
  background: #f4f5ff !important;
}

.ai-chat-conversation {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: #fcfcff;
}

.ai-chat-conversation--prompt-browser {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-chat-conversation :deep(.q-message-text),
.ai-chat-conversation :deep(.q-message-text-content) {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.ai-chat-message--user :deep(.q-message-text-content) {
  color: #24204f !important;
  border-radius: 10px;
}

.ai-chat-message--assistant :deep(.q-message-text),
.ai-chat-message--assistant :deep(.q-message-text-content) {
  padding-left: 0;
  background: transparent !important;
  box-shadow: none;
  color: #29263f !important;
}

.ai-chat-message--assistant :deep(.q-message-text:last-child::before) {
  display: none;
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
  padding: 10px 12px;
  border: 1px solid #dfe3f8;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 1px 2px rgba(49, 46, 129, 0.035);
}

.ai-chat-draft-preview :deep(> :first-child) {
  margin-top: 0;
}

.ai-chat-draft-preview :deep(> :last-child) {
  margin-bottom: 0;
}

.ai-chat-response-actions {
  margin-top: 12px;
  margin-bottom: 4px;
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

.ai-chat-input :deep(.q-field__control) {
  background: white;
}

.ai-chat-input.q-field--focused :deep(.q-field__control::after) {
  border-color: #7c4dff;
}

.ai-chat-input :deep(.q-field__append) {
  align-self: flex-end;
  height: auto;
  padding: 6px 0;
}

.ai-chat-input__actions {
  gap: 2px;
}

.ai-chat-prompt-browser {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

.ai-chat-prompt-greeting {
  margin: 4px 0 14px;
  color: #30275d;
}

.ai-chat-prompt-search :deep(.q-field__control) {
  background: white;
}

.ai-chat-prompt-selector {
  color: #512da8;
  border-color: #d4cced;
  background: #f8f7ff;
}

.ai-chat-prompt-menu {
  max-width: calc(100vw - 32px);
  max-height: min(70vh, 560px);
  background: #fcfcff;
}

.ai-chat-composer {
  background: #fafaff;
  border-top: 1px solid #ececf6;
}
</style>

<style>
.ai-chat-prompt-section + .ai-chat-prompt-section {
  margin-top: 8px;
}

.ai-chat-prompt-section__label {
  padding: 4px 8px;
}

.ai-chat-prompt-item--active {
  color: #4527a0;
  background: #ede7f6;
}

.body--dark .ai-chat-context {
  border-color: #4b4b6b;
  background: #303047 !important;
}

.body--dark .ai-chat-drawer__panel,
.body--dark .ai-chat-conversation {
  background: #242333;
  color: #f3f1ff;
}

.body--dark .ai-chat-toolbar,
.body--dark .ai-chat-composer {
  background: #29283b;
  border-color: #41405a;
}

.body--dark .ai-chat-message--user .q-message-text,
.body--dark .ai-chat-message--user .q-message-text-content {
  background: #383755 !important;
  border-color: #4b4a70;
  color: #f4f2ff !important;
}

.body--dark .ai-chat-message--user .q-message-text--sent:last-child::before {
  border-bottom-color: #383755;
}

.body--dark .ai-chat-message--assistant .q-message-text-content {
  color: #efedff !important;
}

.body--dark .ai-chat-assistant-response {
  border-color: #484765;
  background: #2d2c41;
}

.body--dark .ai-chat-input .q-field__control {
  background: #29283b !important;
}

.body--dark .ai-chat-prompt-menu {
  border-color: #484765;
  background: #2d2c41;
}

.body--dark .ai-chat-prompt-greeting {
  color: #f3f1ff;
}

.body--dark .ai-chat-prompt-search .q-field__control {
  background: #29283b !important;
}

.body--dark .ai-chat-prompt-selector {
  color: #d8ccff;
  border-color: #555172;
  background: #302e45;
}

.body--dark .ai-chat-prompt-item--active {
  color: #d9ccff;
  background: #3b3855;
}
</style>
