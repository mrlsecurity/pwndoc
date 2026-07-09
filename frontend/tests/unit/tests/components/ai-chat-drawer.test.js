import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import AiChatDrawer from '@/components/ai-chat-drawer.vue'
import { useAiGenerationStore } from '@/stores/ai-generation'

vi.mock('@/services/ai', () => ({
  default: {
    generateFieldDraft: vi.fn()
  }
}))

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

function createWrapper() {
  return createTestWrapper(AiChatDrawer, {
    global: {
      stubs: {
        'q-chat-message': true,
        'q-icon': true,
        'q-toolbar-title': true,
        'q-toolbar': true,
        'q-separator': true,
        'q-card-section': true,
        'q-input': true,
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
        $settings: {}
      }
    },
    messages: {
      'en-US': {
        aiChat: {
          assistant: 'Assistant',
          apply: 'Apply',
          applyField: 'Apply to field',
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
    store.sessionConfig = {
      title: 'AI - Description',
      outputType: 'html',
      requestParams: {},
      diffContext: {
        current: { description: '<p>Old description</p>' },
        entityShape: 'finding',
        fieldKey: 'description',
        locale: 'en',
        outputType: 'html',
        mode: 'field',
        selection: null,
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

  it('builds selected-text preview diff from the selected replacement', () => {
    const wrapper = createWrapper()
    const store = useAiGenerationStore()
    store.sessionConfig = {
      title: 'AI - Description',
      selectedText: 'wrong',
      outputType: 'text',
      requestParams: {},
      diffContext: {
        current: { description: 'alpha wrong omega' },
        entityShape: 'finding',
        fieldKey: 'description',
        locale: 'en',
        outputType: 'text',
        mode: 'selection',
        selection: { start: 6, end: 11, text: 'wrong' },
        languages: []
      }
    }
    addAssistantMessage(store, 'right')
    const message = store.conversation.messages[0]

    wrapper.vm.togglePreviewDiff(message)

    expect(message.previewDiffDraft.description).toBe('alpha right omega')
  })
})
