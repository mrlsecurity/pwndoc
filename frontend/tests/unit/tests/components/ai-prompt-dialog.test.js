import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import AiPromptDialog from '@/components/AiPromptDialog.vue'

describe('AiPromptDialog Component', () => {
  const dialogStub = {
    template: '<div class="q-dialog"><slot /></div>',
    emits: ['hide'],
    methods: {
      show() {},
      hide() { this.$emit('hide') }
    }
  }

  const createWrapper = (overrides = {}) => {
    return createTestWrapper(AiPromptDialog, {
      global: {
        stubs: {
          'q-dialog': dialogStub,
          'q-card': { template: '<div class="q-card"><slot /></div>' },
          'q-bar': { template: '<div class="q-bar"><slot /></div>' },
          'q-card-section': { template: '<div class="q-card-section"><slot /></div>' },
          'q-card-actions': { template: '<div class="q-card-actions"><slot /></div>' },
          'q-separator': true,
          'q-space': true,
          'q-icon': true,
          'q-input': {
            template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
            props: ['modelValue'],
            emits: ['update:modelValue']
          },
          'q-btn': {
            template: '<button @click="$attrs.onClick"><slot />{{ $attrs.label }}</button>',
            inheritAttrs: false
          },
          ...(overrides.stubs || {})
        }
      }
    })
  }

  it('should render without errors', () => {
    const wrapper = createWrapper()
    expect(wrapper.exists()).toBe(true)
  })

  it('should expose open method', () => {
    const wrapper = createWrapper()
    expect(typeof wrapper.vm.open).toBe('function')
  })

  it('should resolve with userPrompt when Run is clicked', async () => {
    const wrapper = createWrapper()
    const promise = wrapper.vm.open('Rephrase')

    // Find the textarea and type a value
    const textarea = wrapper.find('textarea')
    await textarea.setValue('make it formal')

    // Find the Run button and click
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn.trigger('click')

    const result = await promise
    expect(result).toEqual({ userPrompt: 'make it formal' })
  })

  it('should resolve with null userPrompt when Skip is clicked', async () => {
    const wrapper = createWrapper()
    const promise = wrapper.vm.open('Rephrase')

    const buttons = wrapper.findAll('button')
    const skipBtn = buttons.find(b => b.text().includes('Skip'))
    await skipBtn.trigger('click')

    const result = await promise
    expect(result).toEqual({ userPrompt: null })
  })

  it('should resolve with null when Cancel is clicked', async () => {
    const wrapper = createWrapper()
    const promise = wrapper.vm.open('Rephrase')

    const buttons = wrapper.findAll('button')
    const cancelBtn = buttons.find(b => b.text().includes('Cancel'))
    await cancelBtn.trigger('click')

    const result = await promise
    expect(result).toBeNull()
  })

  it('should trim whitespace from userPrompt', async () => {
    const wrapper = createWrapper()
    const promise = wrapper.vm.open('Rephrase')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('   make it shorter   ')

    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn.trigger('click')

    const result = await promise
    expect(result).toEqual({ userPrompt: 'make it shorter' })
  })

  it('should resolve userPrompt as null when Run clicked with empty input', async () => {
    const wrapper = createWrapper()
    const promise = wrapper.vm.open('Rephrase')

    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn.trigger('click')

    const result = await promise
    expect(result).toEqual({ userPrompt: null })
  })
})
