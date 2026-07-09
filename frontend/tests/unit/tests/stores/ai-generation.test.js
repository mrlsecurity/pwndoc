import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiGenerationStore } from '@/stores/ai-generation'

vi.mock('@/stores/audit-qa', () => ({
  useAuditQaStore: () => ({
    close: vi.fn()
  })
}))

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('Apply does not end the session', () => {
  it('applyFieldValue invokes onApply as many times as it is called, without closing the drawer', () => {
    const onApply = vi.fn()
    const store = useAiGenerationStore()
    store.openSession({ title: 'AI - Description', lockKey: 'finding:1:description', mode: 'field', onApply }).catch(() => {})

    store.applyFieldValue('<p>first</p>')
    store.applyFieldValue('<p>second</p>')

    expect(onApply).toHaveBeenNthCalledWith(1, '<p>first</p>')
    expect(onApply).toHaveBeenNthCalledWith(2, '<p>second</p>')
    expect(store.drawerOpen).toBe(true)
    expect(store.sessionConfig).not.toBeNull()
    expect(store.isActive).toBe(true)
  })

  it('applyPartialDraft invokes onPartialApply repeatedly without closing the drawer', () => {
    const onPartialApply = vi.fn()
    const store = useAiGenerationStore()
    store.openSession({ title: 'AI', lockKey: 'finding:1:description', mode: 'selection', selectedText: 'ref', onPartialApply })

    store.applyPartialDraft('fragment one')
    store.applyPartialDraft('fragment two')

    expect(onPartialApply).toHaveBeenCalledTimes(2)
    expect(store.drawerOpen).toBe(true)
    expect(store.isFieldSessionActive('finding:1:description')).toBe(true)
  })

  it('the field stays locked for its sparkle button the whole time the drawer is open, apply or not', () => {
    const store = useAiGenerationStore()
    store.openSession({ title: 'AI', lockKey: 'finding:1:description', mode: 'field', onApply: vi.fn() })

    expect(store.isFieldSessionActive('finding:1:description')).toBe(true)

    store.applyFieldValue('<p>New</p>')

    expect(store.isFieldSessionActive('finding:1:description')).toBe(true)
  })
})

describe('openSession promise', () => {
  it('only settles (by rejecting) when the drawer is closed, never on apply', async () => {
    const store = useAiGenerationStore()
    const promise = store.openSession({ title: 'AI', lockKey: 'finding:1:description', mode: 'field', onApply: vi.fn() })
    const rejection = expect(promise).rejects.toThrow('cancelled')

    // Still pending - applying never settles it.
    store.applyFieldValue('<p>New</p>')
    store.applyFieldValue('<p>Newer</p>')
    store.closeDrawer()

    await rejection
  })
})

describe('closing/cancelling fully resets the store', () => {
  it('closeDrawer resets drawerOpen, sessionConfig and lockKey', () => {
    const store = useAiGenerationStore()
    store.openSession({ title: 'AI', lockKey: 'finding:1:description', mode: 'field', onApply: vi.fn() }).catch(() => {})

    store.closeDrawer()

    expect(store.drawerOpen).toBe(false)
    expect(store.sessionConfig).toBeNull()
    expect(store.lockKey).toBeNull()
    expect(store.isFieldSessionActive('finding:1:description')).toBe(false)
  })

  it('starting a new session for the same field clears the previous conversation', () => {
    const store = useAiGenerationStore()
    store.openSession({ title: 'AI', lockKey: 'finding:1:description', mode: 'field', onApply: vi.fn() }).catch(() => {})
    store.conversation.messages.push({ role: 'assistant', content: 'Old', draft: '<p>old</p>' })

    store.openSession({ title: 'AI', lockKey: 'finding:1:description', mode: 'field', onApply: vi.fn() }).catch(() => {})

    expect(store.conversation.messages.length).toBe(0)
  })
})
