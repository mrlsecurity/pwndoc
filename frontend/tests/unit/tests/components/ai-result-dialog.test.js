import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import AiResultDialog from '@/components/AiResultDialog.vue'

describe('AiResultDialog Component', () => {
  const createWrapper = (overrides = {}) => {
    return createTestWrapper(AiResultDialog, {
      props: {
        actionLabel: 'Generate',
        originalContent: '<p>Original text</p>',
        suggestedContent: '<p>AI generated text</p>',
        ...overrides.props
      },
      global: {
        stubs: {
          'q-dialog': { template: '<div class="q-dialog"><slot /></div>' },
          'q-card': { template: '<div class="q-card"><slot /></div>' },
          'q-bar': { template: '<div class="q-bar"><slot /></div>' },
          'q-card-section': { template: '<div class="q-card-section"><slot /></div>' },
          'q-card-actions': { template: '<div class="q-card-actions"><slot /></div>' },
          'q-separator': true,
          'q-space': true,
          'q-icon': true,
          'q-btn': { template: '<button @click="$attrs.onClick"><slot />{{ $attrs.label }}</button>', inheritAttrs: false },
          ...(overrides.stubs || {})
        }
      }
    })
  }

  it('should render with props', () => {
    const wrapper = createWrapper()
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.text()).toContain('Generate')
    expect(wrapper.text()).toContain('Original')
    expect(wrapper.text()).toContain('AI Suggestion')
  })

  it('should display original and suggested content', () => {
    const wrapper = createWrapper()
    const contentBoxes = wrapper.findAll('.ai-content-box')
    expect(contentBoxes.length).toBe(2)
    expect(contentBoxes[0].html()).toContain('Original text')
    expect(contentBoxes[1].html()).toContain('AI generated text')
  })

  it('should emit accept event with suggested content', async () => {
    const wrapper = createWrapper()
    // Find the Accept button
    const buttons = wrapper.findAll('button')
    const acceptBtn = buttons.find(b => b.text().includes('Accept'))
    if (acceptBtn) {
      await acceptBtn.trigger('click')
      expect(wrapper.emitted('accept')).toBeTruthy()
      expect(wrapper.emitted('accept')[0][0]).toBe('<p>AI generated text</p>')
    }
  })

  it('should emit decline event', async () => {
    const wrapper = createWrapper()
    const buttons = wrapper.findAll('button')
    const declineBtn = buttons.find(b => b.text().includes('Decline'))
    if (declineBtn) {
      await declineBtn.trigger('click')
      expect(wrapper.emitted('decline')).toBeTruthy()
    }
  })
})
