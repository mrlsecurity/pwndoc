import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import AiActionButton from '@/components/AiActionButton.vue'

// Mock the AI service
vi.mock('src/services/ai', () => ({
  default: {
    getActions: vi.fn(),
    executeAction: vi.fn()
  }
}))

import AIService from 'src/services/ai'

describe('AiActionButton Component', () => {
  const mockActions = [
    { id: 'rephrase', name: 'Rephrase', type: 'builtin', builtinAction: 'rephrase', isEnabled: true, targetFields: [] },
    { id: 'summarize', name: 'Summarize', type: 'builtin', builtinAction: 'summarize', isEnabled: true, targetFields: [] },
    { id: 'translate', name: 'Translate', type: 'builtin', builtinAction: 'translate', isEnabled: true, targetFields: [] }
  ]

  // A stub for AiPromptDialog that we can control per-test
  let promptDialogStub
  // A stub for AiResultDialog
  const resultDialogStub = {
    template: '<div class="ai-result-dialog"></div>',
    methods: { show: vi.fn(), hide: vi.fn() },
    emits: ['accept', 'decline', 'refine']
  }

  beforeEach(() => {
    vi.clearAllMocks()
    AIService.getActions.mockResolvedValue({ data: { datas: mockActions } })
    AIService.executeAction.mockResolvedValue({ data: { datas: { result: 'AI result text' } } })
  })

  const createWrapper = (promptResolveWith) => {
    promptDialogStub = {
      template: '<div class="ai-prompt-dialog"></div>',
      methods: {
        open: vi.fn().mockResolvedValue(promptResolveWith)
      }
    }

    return createTestWrapper(AiActionButton, {
      props: {
        fieldName: 'description',
        fieldContent: 'original content',
        findingContext: {},
        aiEnabled: true
      },
      global: {
        stubs: {
          'q-btn': {
            template: '<button @click="$attrs.onClick" :data-loading="$attrs.loading"><slot />{{ $attrs.label }}</button>',
            inheritAttrs: false
          },
          'q-menu': { template: '<div class="q-menu"><slot /></div>' },
          'q-list': { template: '<div class="q-list"><slot /></div>' },
          'q-item': {
            template: '<div class="q-item" @click="$attrs.onClick"><slot /></div>',
            inheritAttrs: false
          },
          'q-item-section': { template: '<div class="q-item-section"><slot /></div>' },
          'q-icon': true,
          'q-tooltip': true,
          'q-separator': true,
          'q-select': { template: '<select @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>', emits: ['update:modelValue'] },
          'q-template': true,
          AiPromptDialog: promptDialogStub,
          AiResultDialog: resultDialogStub
        }
      }
    })
  }

  it('sends options.userPrompt when user provides a prompt', async () => {
    const wrapper = createWrapper({ userPrompt: 'be concise' })
    await wrapper.vm.$nextTick()

    // Trigger executeAction directly with a mock action
    await wrapper.vm.executeAction(mockActions[0])

    expect(AIService.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rephrase',
        options: { userPrompt: 'be concise' }
      })
    )
  })

  it('sends no options when userPrompt is null (Skip)', async () => {
    const wrapper = createWrapper({ userPrompt: null })
    await wrapper.vm.$nextTick()

    await wrapper.vm.executeAction(mockActions[0])

    expect(AIService.executeAction).toHaveBeenCalledWith(
      expect.not.objectContaining({ options: expect.objectContaining({ userPrompt: expect.anything() }) })
    )
    // Also ensure the call happened (skipped, not cancelled)
    expect(AIService.executeAction).toHaveBeenCalledTimes(1)
  })

  it('does not call executeAction when prompt is cancelled (null result)', async () => {
    const wrapper = createWrapper(null)
    await wrapper.vm.$nextTick()

    await wrapper.vm.executeAction(mockActions[0])

    expect(AIService.executeAction).not.toHaveBeenCalled()
  })

  it('stores the last payload for refine', async () => {
    const wrapper = createWrapper({ userPrompt: 'emphasize risk' })
    await wrapper.vm.$nextTick()

    await wrapper.vm.executeAction(mockActions[0])

    expect(wrapper.vm.lastActionPayload).toEqual(
      expect.objectContaining({
        action: 'rephrase',
        options: { userPrompt: 'emphasize risk' }
      })
    )
  })

  it('onRefine re-runs executeAction with suggested content and new userPrompt', async () => {
    const wrapper = createWrapper({ userPrompt: null })
    await wrapper.vm.$nextTick()

    // Manually set state to simulate a completed action
    wrapper.vm.aiResult = 'previous suggestion'
    wrapper.vm.lastActionPayload = {
      action: 'rephrase',
      content: 'original',
      targetField: 'description'
    }

    await wrapper.vm.onRefine({ userPrompt: 'now make it shorter' })

    expect(AIService.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rephrase',
        content: 'previous suggestion',
        options: { userPrompt: 'now make it shorter' }
      })
    )
  })

  it('clears lastActionPayload on accept', async () => {
    const wrapper = createWrapper({ userPrompt: null })
    wrapper.vm.lastActionPayload = { action: 'rephrase' }

    wrapper.vm.onAccept('accepted content')
    expect(wrapper.vm.lastActionPayload).toBeNull()
  })

  it('clears lastActionPayload on decline', async () => {
    const wrapper = createWrapper({ userPrompt: null })
    wrapper.vm.lastActionPayload = { action: 'rephrase' }

    wrapper.vm.onDecline()
    expect(wrapper.vm.lastActionPayload).toBeNull()
  })
})
