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
        'q-menu': true,
        'q-list': true,
        'q-item': true,
        'q-item-section': true,
        'q-spinner-dots': true
      },
      mocks: {
        $settings: {}
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
