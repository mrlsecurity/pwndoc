import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import AiChatDrawer from '@/components/ai-chat-drawer.vue'
import { useAiGenerationStore } from '@/stores/ai-generation'
import AiService from '@/services/ai'

vi.mock('@/services/ai', () => ({
  default: {
    generateFieldDraft: vi.fn()
  }
}))

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

function createWrapper({ notify } = {}) {
  return createTestWrapper(AiChatDrawer, {
    global: {
      stubs: {
        'q-chat-message': true,
        'q-icon': true,
        'q-toolbar-title': true,
        'q-toolbar': true,
        'q-separator': true,
        'q-card-section': {
          template: '<div><slot /></div>'
        },
        'q-input': {
          props: ['readonly', 'disable'],
          template: '<div><textarea :readonly="readonly" :disabled="disable" /><slot name="append" /></div>'
        },
        'q-btn-toggle': true,
        'q-btn': {
          props: ['label'],
          template: '<button @click="$emit(\'click\')">{{ label }}</button>'
        },
        'q-menu': true,
        'q-list': true,
        'q-item': true,
        'q-item-section': true,
        'q-spinner-dots': true
      },
      directives: {
        'close-popup': {}
      },
      mocks: {
        $settings: {},
        // The shared test setup doesn't install Quasar's Notify plugin, so $q.notify
        // isn't a real function unless a test needs to assert on it.
        ...(notify ? { $q: { notify } } : {})
      }
    },
    messages: {
      'en-US': {
        aiChat: {
          assistant: 'Assistant',
          apply: 'Apply',
          applyField: 'Apply to field',
          applySelection: 'Apply selection',
          insertAtCursor: 'Insert at cursor',
          anchorCollapsed: 'The selected text was removed. The draft will be inserted at its original position.',
          anchorLost: 'The original selection could not be tracked.',
          defaultPromptPlaceholder: 'Ask the AI to update this field...',
          inputPlaceholder: 'Ask the AI to rewrite the selection...',
          originalResponse: 'Original response',
          previewChanges: 'Preview changes',
          reviewDefaultPrompt: 'Ask the AI to help with this field.',
          selectedText: 'Selected text',
          send: 'Send',
          sendHint: 'Tip: Press Ctrl+Enter to send.',
          startPrompt: 'Ask the AI to rewrite or improve the selected text.',
          you: 'You'
        }
      }
    }
  })
}

describe('AiChatDrawer formatDraftPreview', () => {
  it('uses the shared gradient treatment for assisted-writing chrome and primary actions', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'text', requestParams: {} }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ai-chat-toolbar').exists()).toBe(true)
    expect(wrapper.find('.ai-primary-btn').exists()).toBe(true)
  })

  it('renders an HTML draft as formatted HTML, not escaped source', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', requestParams: {} }

    const preview = wrapper.vm.formatDraftPreview('<p>Hello <b>world</b></p>')

    expect(preview).toBe('<p>Hello <b>world</b></p>')
    expect(preview).not.toContain('&lt;')
  })

  it('normalizes editor image ids to downloadable image URLs with captions', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const imageId = '0123456789abcdef01234567'
    store.sessionConfig = { title: 'AI', outputType: 'html', requestParams: {} }

    const preview = wrapper.vm.formatDraftPreview(`<p>Before</p><img src="${imageId}" alt="Figure caption"><p>After</p>`)

    expect(preview).toContain(`src="/api/images/download/${imageId}"`)
    expect(preview).toContain('<figure class="draft-image">')
    expect(preview).toContain('<figcaption>Figure caption</figcaption>')
    expect(preview).toContain('<p>After</p>')
  })

  it('renders editor HTML previews with the editor-style wrapper classes', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', requestParams: {} }
    store.conversation.messages.push({
      role: 'assistant',
      content: 'Updated',
      draft: '<pre><code class="language-js">const value = 1</code></pre>',
      draftPreview: '<pre><code class="language-js">const value = 1</code></pre>'
    })
    await wrapper.vm.$nextTick()

    const preview = wrapper.find('.ai-chat-draft-preview')
    expect(preview.classes()).toEqual(expect.arrayContaining(['ProseMirror', 'draft-rendered-diff']))
    expect(preview.find('pre code.language-js').exists()).toBe(true)
    const response = wrapper.find('.ai-chat-assistant-response')
    const actions = wrapper.find('.ai-chat-response-actions')
    expect(response.find('.ai-chat-response-actions').exists()).toBe(false)
    expect(response.element.nextElementSibling).toBe(actions.element)
  })

  it('strips disallowed tags from an HTML draft (no script injection)', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', requestParams: {} }

    const preview = wrapper.vm.formatDraftPreview('<script>alert(1)</script><p>safe</p>')

    expect(preview).not.toContain('<script>')
    expect(preview).toContain('<p>safe</p>')
  })

  it('HTML-escapes each line for array output', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'array', requestParams: {} }

    const preview = wrapper.vm.formatDraftPreview(['<b>one</b>', 'two'])

    expect(preview).toBe('&lt;b&gt;one&lt;/b&gt;<br/>two')
  })

  it('HTML-escapes plain text output', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'text', requestParams: {} }

    const preview = wrapper.vm.formatDraftPreview('<b>bold</b>')

    expect(preview).toBe('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('renders the sanitized HTML preview via v-html in the conversation', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', requestParams: {} }
    store.conversation.messages.push({
      role: 'assistant',
      content: 'Updated',
      draft: '<p>Formatted content</p>',
      draftPreview: '<p>Formatted content</p>'
    })
    await wrapper.vm.$nextTick()

    const preview = wrapper.find('.ai-chat-draft-preview')
    expect(preview.html()).toContain('<p>Formatted content</p>')
  })
})

describe('AiChatDrawer preview changes toggle', () => {
  function addAssistantMessage(store, draft = '<p>New description</p>') {
    store.conversation.messages.push({
      role: 'assistant',
      content: 'Updated',
      draft,
      draftPreview: draft,
      previewDiffOpen: false,
      previewDiffDraft: null
    })
  }

  it('toggles an assistant response between rendered draft and inline diff', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const entity = { description: '<p>Old description</p>' }
    store.sessionConfig = {
      title: 'AI - Description',
      outputType: 'html',
      mode: 'field',
      requestParams: {},
      diffContext: {
        getDiffEntity: () => entity,
        entityShape: 'finding',
        fieldKey: 'description',
        locale: 'en',
        outputType: 'html',
        mode: 'field',
        selection: null,
        getSelectionPreviewValue: null,
        languages: []
      }
    }
    addAssistantMessage(store)
    const message = store.conversation.messages[0]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ai-chat-draft-preview').exists()).toBe(true)

    wrapper.vm.togglePreviewDiff(message)
    await wrapper.vm.$nextTick()

    expect(message.previewDiffOpen).toBe(true)
    expect(message.previewDiffCurrent.description).toBe('<p>Old description</p>')
    expect(message.previewDiffDraft.description).toBe('<p>New description</p>')
    expect(wrapper.find('.draft-diff').exists()).toBe(true)
    expect(wrapper.find('.draft-diff--chat-preview').exists()).toBe(true)
    expect(wrapper.find('.diff-block__header').exists()).toBe(false)
    expect(wrapper.find('.ai-chat-draft-preview').exists()).toBe(false)
    expect(wrapper.text()).toContain('Original response')

    wrapper.vm.togglePreviewDiff(message)
    await wrapper.vm.$nextTick()

    expect(message.previewDiffOpen).toBe(false)
    expect(wrapper.find('.ai-chat-draft-preview').exists()).toBe(true)
    expect(wrapper.text()).toContain('Preview changes')
  })

  it('recomputes the diff from the live entity every time it is reopened', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const entity = { description: '<p>Old description</p>' }
    store.sessionConfig = {
      title: 'AI - Description',
      outputType: 'html',
      mode: 'field',
      requestParams: {},
      diffContext: {
        getDiffEntity: () => entity,
        entityShape: 'finding',
        fieldKey: 'description',
        locale: 'en',
        outputType: 'html',
        mode: 'field',
        selection: null,
        getSelectionPreviewValue: null,
        languages: []
      }
    }
    addAssistantMessage(store)
    const message = store.conversation.messages[0]

    wrapper.vm.togglePreviewDiff(message)
    expect(message.previewDiffCurrent.description).toBe('<p>Old description</p>')
    wrapper.vm.togglePreviewDiff(message) // close

    entity.description = '<p>Edited while the AI drawer was open</p>'
    wrapper.vm.togglePreviewDiff(message) // reopen - should reflect the edit
    expect(message.previewDiffCurrent.description).toBe('<p>Edited while the AI drawer was open</p>')
  })

  it('builds selected-text preview diff from the selected replacement using start/end offsets', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const entity = { description: 'alpha wrong omega' }
    store.sessionConfig = {
      title: 'AI - Description',
      selectedText: 'wrong',
      outputType: 'text',
      mode: 'selection',
      requestParams: {},
      diffContext: {
        getDiffEntity: () => entity,
        entityShape: 'finding',
        fieldKey: 'description',
        locale: 'en',
        outputType: 'text',
        mode: 'selection',
        selection: { start: 6, end: 11, text: 'wrong' },
        getSelectionPreviewValue: null,
        languages: []
      }
    }
    addAssistantMessage(store, 'right')
    const message = store.conversation.messages[0]

    wrapper.vm.togglePreviewDiff(message)

    expect(message.previewDiffDraft.description).toBe('alpha right omega')
  })
})

describe('AiChatDrawer partial apply from a preview selection', () => {
  function addAssistantMessage(store, draft = '<p>Paragraph one</p><p>Paragraph two</p>') {
    store.conversation.messages.push({
      role: 'assistant',
      content: 'Updated',
      draft,
      draftPreview: draft,
      previewDiffOpen: false,
      previewDiffDraft: null,
      previewDiffCurrent: null
    })
  }

  it('selection mode: applies only the selected fragment to the anchored range and keeps the session open', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const onPartialApply = vi.fn()
    store.sessionConfig = {
      title: 'AI - Description',
      selectedText: 'wrong',
      outputType: 'html',
      mode: 'selection',
      requestParams: {},
      onPartialApply
    }
    addAssistantMessage(store)

    wrapper.vm.previewSelection = { messageIndex: 0, html: '<p>Paragraph one</p>', text: 'Paragraph one' }
    expect(wrapper.vm.applyLabel(0)).toBe('Apply selection')

    wrapper.vm.applyDraft(store.conversation.messages[0], 0)

    expect(onPartialApply).toHaveBeenCalledWith('<p>Paragraph one</p>')
    expect(store.isActive).toBe(true)
    expect(wrapper.vm.previewSelection).toBeNull()
  })

  it('field mode: applies the selected fragment as the whole field value without ending the session', () => {
    // Field mode has no original range to preserve - "Apply" with a fragment
    // selected writes it as the whole field (via onApply), same mechanism as
    // the no-selection case, but never ends the session.
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const onApply = vi.fn()
    store.sessionConfig = { title: 'AI - Description', outputType: 'html', mode: 'field', requestParams: {}, onApply }
    addAssistantMessage(store)

    wrapper.vm.previewSelection = { messageIndex: 0, html: '<p>Paragraph one</p>', text: 'Paragraph one' }
    expect(wrapper.vm.applyLabel(0)).toBe('Apply selection')

    wrapper.vm.applyDraft(store.conversation.messages[0], 0)

    expect(onApply).toHaveBeenCalledWith('<p>Paragraph one</p>')
    expect(store.isActive).toBe(true)
    expect(wrapper.vm.previewSelection).toBeNull()
  })

  it('field mode: applies the whole draft when nothing is selected, without ending the session', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const onApply = vi.fn()
    store.sessionConfig = { title: 'AI', outputType: 'html', mode: 'field', requestParams: {}, onApply }
    addAssistantMessage(store, '<p>Whole draft</p>')

    wrapper.vm.applyDraft(store.conversation.messages[0], 0)

    expect(onApply).toHaveBeenCalledWith('<p>Whole draft</p>')
    expect(store.isActive).toBe(true)
  })

  it('field mode: applying again after already applying still works (repeatable, not a one-shot)', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const onApply = vi.fn()
    store.sessionConfig = { title: 'AI', outputType: 'html', mode: 'field', requestParams: {}, onApply }
    addAssistantMessage(store, '<p>First draft</p>')

    wrapper.vm.applyDraft(store.conversation.messages[0], 0)
    wrapper.vm.applyDraft(store.conversation.messages[0], 0)

    expect(onApply).toHaveBeenCalledTimes(2)
    expect(wrapper.vm.applyDisabled).toBe(false)
  })

  it('inserts the selected fragment at cursor without ending the session', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    const onInsertAtCursor = vi.fn()
    store.sessionConfig = {
      title: 'AI',
      outputType: 'html',
      mode: 'field',
      requestParams: {},
      onInsertAtCursor
    }
    addAssistantMessage(store)

    wrapper.vm.previewSelection = { messageIndex: 0, html: '<p>Paragraph two</p>', text: 'Paragraph two' }
    wrapper.vm.insertAtCursor(store.conversation.messages[0], 0)

    expect(onInsertAtCursor).toHaveBeenCalledWith('<p>Paragraph two</p>')
    expect(store.isActive).toBe(true)
  })
})

describe('AiChatDrawer send/stop generation', () => {
  it('keeps the stop button interactive while making the prompt read-only', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', mode: 'field', requestParams: {} }
    store.loading = true
    await wrapper.vm.$nextTick()

    const input = wrapper.find('.ai-chat-input textarea')
    const stopButton = wrapper.find('button[aria-label="aiChat.stop"]')
    const cancel = vi.fn()
    wrapper.vm.cancelTokenSource = { cancel }

    expect(input.attributes('readonly')).toBeDefined()
    expect(input.attributes('disabled')).toBeUndefined()
    expect(stopButton.exists()).toBe(true)

    await stopButton.trigger('click')

    expect(cancel).toHaveBeenCalled()
  })

  it('passes a cancelToken to AiService.generateFieldDraft while a request is in flight', async () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', mode: 'field', requestParams: {} }
    store.conversation.userInput = 'do it'

    let resolveResponse
    AiService.generateFieldDraft.mockReturnValue(new Promise((resolve) => { resolveResponse = resolve }))

    const sendPromise = wrapper.vm.sendMessage()
    await wrapper.vm.$nextTick()

    expect(store.loading).toBe(true)
    const [, config] = AiService.generateFieldDraft.mock.calls[0]
    expect(config.cancelToken).toBeDefined()

    resolveResponse({ data: { datas: { draft: '<p>ok</p>', reply: '' } } })
    await sendPromise
  })

  it('stopGeneration cancels the in-flight request, restores the input, and shows no error notify', async () => {
    const notify = vi.fn()
    const wrapper = createWrapper({ notify })
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', mode: 'field', requestParams: {} }
    store.conversation.userInput = 'do it'

    AiService.generateFieldDraft.mockImplementation((payload, config) => {
      return new Promise((_resolve, reject) => {
        config.cancelToken.promise.then((cancel) => reject(cancel))
      })
    })

    const sendPromise = wrapper.vm.sendMessage()
    await wrapper.vm.$nextTick()

    expect(store.conversation.messages).toHaveLength(1)

    wrapper.vm.stopGeneration()
    await sendPromise

    expect(store.loading).toBe(false)
    expect(store.conversation.messages).toHaveLength(0)
    expect(store.conversation.userInput).toBe('do it')
    expect(notify).not.toHaveBeenCalled()
  })

  it('shows an error notify and restores the input for a real request failure (not a cancel)', async () => {
    const notify = vi.fn()
    const wrapper = createWrapper({ notify })
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', outputType: 'html', mode: 'field', requestParams: {} }
    store.conversation.userInput = 'do it'

    AiService.generateFieldDraft.mockRejectedValue(new Error('boom'))

    await wrapper.vm.sendMessage()

    expect(store.conversation.messages).toHaveLength(0)
    expect(store.conversation.userInput).toBe('do it')
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ color: 'negative' }))
  })

})

describe('AiChatDrawer selection anchor status', () => {
  it('exposes the collapsed anchor status for the caption', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', selectedText: 'wrong', outputType: 'text', mode: 'selection', requestParams: {} }
    store.selectionAnchor = { from: 4, to: 4, status: 'collapsed' }

    expect(wrapper.vm.anchorStatus).toBe('collapsed')
  })

  it('disables Apply when the tracked selection was lost', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = { title: 'AI', selectedText: 'wrong', outputType: 'text', mode: 'selection', requestParams: {} }
    store.selectionAnchor = { from: 0, to: 0, status: 'invalid' }

    expect(wrapper.vm.applyDisabled).toBe(true)
  })
})
