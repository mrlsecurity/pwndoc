import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

// Must mock the user store before importing the page - ai-integration.js calls
// useUserStore() at module scope (`const userStore = useUserStore();`).
const { mockUserStore } = vi.hoisted(() => ({
  mockUserStore: {
    isAllowed: vi.fn(() => true)
  }
}))
vi.mock('@/stores/user', () => ({
  useUserStore: vi.fn(() => mockUserStore)
}))

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

vi.mock('quasar', async () => {
  const actual = await vi.importActual('quasar')
  return {
    ...actual,
    Notify: { create: vi.fn() },
    Dialog: { create: vi.fn(() => ({ onOk: vi.fn(() => ({ onCancel: vi.fn() })) })) }
  }
})

vi.mock('@/services/data', () => ({
  default: {
    getAiIntegration: vi.fn(),
    updateAiIntegration: vi.fn()
  }
}))

import AiIntegrationPage from '@/pages/data/ai-integration/index.vue'
import DataService from '@/services/data'
import { Notify, Dialog } from 'quasar'

describe('AI Integration Page', () => {
  let router, pinia, i18n

  const mockPromptMappings = () => ([
    {
      entityType: 'finding',
      fieldKey: 'description',
      fieldLabel: 'Description',
      outputType: 'html',
      enabled: true,
      prompt: 'Describe the finding thoroughly.'
    },
    {
      entityType: 'finding',
      fieldKey: 'custom-field:abc123',
      fieldLabel: 'Finding Custom Field: Severity Rationale',
      outputType: 'text',
      enabled: true,
      prompt: 'Explain why this severity was chosen.'
    }
  ])

  const mockGlobalPrompts = () => ([
    { id: 'g1', label: 'Tone', prompt: 'Write in a formal, professional tone.', enabled: true },
    { id: 'g2', label: 'Audience', prompt: 'Write for a technical audience.', enabled: true }
  ])

  const mockPayload = () => ({
    aiEnabled: true,
    promptMappings: mockPromptMappings(),
    globalPrompts: mockGlobalPrompts(),
    redactionGuidelines: { delivery: 'inline', content: '', bedrockPromptCache: { cacheReference: '', region: '' } },
    qaInstructions: { delivery: 'inline', content: '', bedrockPromptCache: { cacheReference: '', region: '' } },
    qaChecks: {
      completeness: true,
      references: true,
      imageCaptions: true,
      duplicates: true,
      aiDuplicates: true,
      aiUnlinkedTranslations: true,
      redaction: true,
      customer: true,
      instructions: true
    }
  })

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/data/ai-integration', name: 'ai-integration', component: AiIntegrationPage }
      ]
    })

    i18n = createI18n({
      legacy: false,
      globalInjection: true,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages: { 'en-US': {} }
    })

    vi.clearAllMocks()
    mockUserStore.isAllowed.mockReturnValue(true)

    DataService.getAiIntegration.mockResolvedValue({ data: { datas: mockPayload() } })
    DataService.updateAiIntegration.mockResolvedValue({ data: { datas: mockPayload() } })
  })

  const createWrapper = (options = {}) => {
    return mount(AiIntegrationPage, {
      props: { section: 'writing', ...(options.props || {}) },
      global: {
        plugins: [pinia, router, i18n],
        stubs: {
          'q-card': true,
          'q-card-section': true,
          'q-card-actions': true,
          'q-spinner': true,
          'q-banner': true,
          'q-tabs': true,
          'q-tab': true,
          'q-separator': true,
          'q-tab-panels': true,
          'q-tab-panel': true,
          'q-list': true,
          'q-expansion-item': true,
          'q-input': true,
          'q-toggle': true,
          'q-btn': true,
          'q-item-section': true,
          'q-chip': true,
          'q-icon': true,
          ...(options.stubs || {})
        },
        mocks: {
          $t: (key) => key,
          ...(options.mocks || {})
        }
      }
    })
  }

  describe('Initialization', () => {
    it('should fetch AI integration data on mount', async () => {
      createWrapper()
      await wrapper_flushPromises()

      expect(DataService.getAiIntegration).toHaveBeenCalled()
    })

    it('should populate promptMappings and globalPrompts from the response', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      expect(wrapper.vm.promptMappings).toHaveLength(2)
      expect(wrapper.vm.globalPrompts).toHaveLength(2)
    })
  })

  describe('filteredGroupedPromptSections', () => {
    it('should return all groups unchanged when promptFilter is empty', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptFilter = ''
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.filteredGroupedPromptSections).toEqual(wrapper.vm.groupedPromptSections)
      expect(wrapper.vm.filteredGroupedPromptSections.length).toBeGreaterThan(0)
    })

    it('should match case-insensitively against the custom field display label and drop empty groups', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptFilter = 'SEVERITY'
      await wrapper.vm.$nextTick()

      const groups = wrapper.vm.filteredGroupedPromptSections
      expect(groups).toHaveLength(1)
      expect(groups[0].key).toBe('finding-custom')
      expect(groups[0].mappings).toHaveLength(1)
      expect(groups[0].mappings[0].fieldLabel).toBe('Finding Custom Field: Severity Rationale')
    })

    it('should match a builtin field label such as "Description"', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptFilter = 'description'
      await wrapper.vm.$nextTick()

      const groups = wrapper.vm.filteredGroupedPromptSections
      expect(groups).toHaveLength(1)
      expect(groups[0].key).toBe('definition')
      expect(groups[0].mappings).toHaveLength(1)
      expect(groups[0].mappings[0].fieldKey).toBe('description')
    })

    it('should return no groups when nothing matches the filter', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptFilter = 'no-such-field-xyz'
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.filteredGroupedPromptSections).toEqual([])
    })
  })

  describe('fieldDisplayLabel', () => {
    it('should strip the "Finding Custom Field: " prefix', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      const mapping = { fieldLabel: 'Finding Custom Field: Severity Rationale' }
      expect(wrapper.vm.fieldDisplayLabel(mapping)).toBe('Severity Rationale')
    })

    it('should strip the "Section Custom Field: " prefix', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      const mapping = { fieldLabel: 'Section Custom Field: Executive Summary' }
      expect(wrapper.vm.fieldDisplayLabel(mapping)).toBe('Executive Summary')
    })

    it('should leave builtin field labels untouched', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      const mapping = { fieldLabel: 'Description' }
      expect(wrapper.vm.fieldDisplayLabel(mapping)).toBe('Description')
    })
  })

  describe('outputTypeLabel', () => {
    it.each([
      ['html', 'aiIntegration.prompts.outputTypeHtml'],
      ['array', 'aiIntegration.prompts.outputTypeList'],
      ['text', 'aiIntegration.prompts.outputTypeText']
    ])('should map %s to its i18n key', async (outputType, expected) => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      expect(wrapper.vm.outputTypeLabel(outputType)).toBe(expected)
    })

    it('should fall back to the raw output type for anything else', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      expect(wrapper.vm.outputTypeLabel('markdown')).toBe('markdown')
      expect(wrapper.vm.outputTypeLabel(undefined)).toBe(undefined)
    })
  })

  describe('isGroupExpanded / setGroupExpanded', () => {
    it('should default to expanded when no state has been stored and there is no filter', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      expect(wrapper.vm.isGroupExpanded({ key: 'definition' })).toBe(true)
    })

    it('should collapse a group once explicitly set to false', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.setGroupExpanded('definition', false)

      expect(wrapper.vm.openPromptGroups.definition).toBe(false)
      expect(wrapper.vm.isGroupExpanded({ key: 'definition' })).toBe(false)
    })

    it('should re-expand a group once explicitly set to true', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.setGroupExpanded('definition', false)
      wrapper.vm.setGroupExpanded('definition', true)

      expect(wrapper.vm.isGroupExpanded({ key: 'definition' })).toBe(true)
    })

    it('should always report expanded while promptFilter is non-empty, even if collapsed', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.setGroupExpanded('definition', false)
      wrapper.vm.promptFilter = 'description'
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.isGroupExpanded({ key: 'definition' })).toBe(true)
    })

    it('should treat a whitespace-only filter as empty', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.setGroupExpanded('definition', false)
      wrapper.vm.promptFilter = '   '
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.isGroupExpanded({ key: 'definition' })).toBe(false)
    })
  })

  describe('promptDirtyCount', () => {
    it('should be 0 when nothing has changed', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      expect(wrapper.vm.promptDirtyCount).toBe(0)
    })

    it('should count an edited mapping prompt', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptMappings[0].prompt = 'A brand new prompt.'
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.promptDirtyCount).toBe(1)
    })

    it('should count an edited mapping enabled toggle', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptMappings[0].enabled = false
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.promptDirtyCount).toBe(1)
    })

    it('should count an added global prompt', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.globalPrompts.push({ id: 'g3', label: 'NewLabel', prompt: 'NewPrompt', enabled: true })
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.promptDirtyCount).toBe(1)
    })

    it('should count a removed global prompt', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.globalPrompts.splice(0, 1)
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.promptDirtyCount).toBe(1)
    })

    it('should count an edited global prompt', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.globalPrompts[0].prompt = 'A different tone entirely.'
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.promptDirtyCount).toBe(1)
    })

    it('should sum multiple simultaneous changes independently', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptMappings[0].prompt = 'Edited mapping prompt.'
      wrapper.vm.globalPrompts.push({ id: 'g3', label: 'NewLabel', prompt: 'NewPrompt', enabled: true })
      wrapper.vm.globalPrompts.splice(0, 1)
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.promptDirtyCount).toBe(3)
    })
  })

  describe('QA tab scope/dirty tracking', () => {
    it('should label check scopes for audit-vs-vulnerability', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.scopeLabel('audit')).toBe('aiIntegration.qa.scopeAudit')
      expect(wrapper.vm.scopeLabel('vulnerability')).toBe('aiIntegration.qa.scopeVulnerability')
    })

    it('should mark only duplicate-detection checks as vulnerability-only', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      const byKey = Object.fromEntries(
        [...wrapper.vm.programmaticQaCheckOptions, ...wrapper.vm.aiQaCheckOptions].map((check) => [check.key, check.scopes])
      )

      expect(byKey.duplicates).toEqual(['vulnerability'])
      expect(byKey.aiDuplicates).toEqual(['vulnerability'])
      expect(byKey.aiUnlinkedTranslations).toEqual(['vulnerability'])
      expect(byKey.completeness).toEqual(['audit', 'vulnerability'])
      expect(byKey.redaction).toEqual(['audit', 'vulnerability'])
      expect(byKey.customer).toEqual(['audit', 'vulnerability'])
      expect(byKey.instructions).toEqual(['audit', 'vulnerability'])
    })

    it('should be clean with no changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      expect(wrapper.vm.programmaticQaTabDirty).toBe(false)
      expect(wrapper.vm.aiQaTabDirty).toBe(false)
      expect(wrapper.vm.qaDirtyCount).toBe(0)
    })

    it('should flag the programmatic tab when a programmatic check changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.qaChecks.completeness = false
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.programmaticQaTabDirty).toBe(true)
      expect(wrapper.vm.aiQaTabDirty).toBe(false)
      expect(wrapper.vm.qaDirtyCount).toBe(1)
    })

    it('should flag the AI tab when an AI check changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.qaChecks.redaction = false
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.aiQaTabDirty).toBe(true)
      expect(wrapper.vm.programmaticQaTabDirty).toBe(false)
      expect(wrapper.vm.qaDirtyCount).toBe(1)
    })

    it('should flag the AI tab when only the QA instructions textarea changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.qaInstructions.content = 'Always check the retest section.'
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.aiQaTabDirty).toBe(true)
      expect(wrapper.vm.programmaticQaTabDirty).toBe(false)
      expect(wrapper.vm.qaDirtyCount).toBe(1)
    })
  })

  describe('isGlobalPromptIncomplete', () => {
    it('should be false when both label and prompt are empty', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.isGlobalPromptIncomplete({ label: '', prompt: '' })).toBe(false)
    })

    it('should be false when both label and prompt are filled', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.isGlobalPromptIncomplete({ label: 'Tone', prompt: 'Be formal' })).toBe(false)
    })

    it('should be true when only label is filled', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.isGlobalPromptIncomplete({ label: 'Tone', prompt: '' })).toBe(true)
    })

    it('should be true when only prompt is filled', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.isGlobalPromptIncomplete({ label: '', prompt: 'Be formal' })).toBe(true)
    })

    it('should treat whitespace-only values as empty', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.isGlobalPromptIncomplete({ label: '   ', prompt: '' })).toBe(false)
      expect(wrapper.vm.isGlobalPromptIncomplete({ label: '   x  ', prompt: '' })).toBe(true)
    })
  })

  describe('savePrompts', () => {
    it('should notify with an error and not save when a global prompt is incomplete', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.globalPrompts.push({ id: 'g3', label: 'OnlyLabel', prompt: '', enabled: true })
      await wrapper.vm.$nextTick()

      wrapper.vm.savePrompts()
      await wrapper.vm.$nextTick()

      expect(Notify.create).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'negative' })
      )
      expect(DataService.updateAiIntegration).not.toHaveBeenCalled()
    })

    it('should save when all global prompts are complete', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptMappings[0].prompt = 'Updated prompt text.'
      await wrapper.vm.$nextTick()

      wrapper.vm.savePrompts()
      await wrapper_flushPromises()

      expect(DataService.updateAiIntegration).toHaveBeenCalledTimes(1)
      expect(Notify.create).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'positive' })
      )
    })

    it('should filter out fully-empty global prompts before saving', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.globalPrompts.push({ id: 'g3', label: '', prompt: '', enabled: true })
      await wrapper.vm.$nextTick()

      wrapper.vm.savePrompts()
      await wrapper_flushPromises()

      expect(DataService.updateAiIntegration).toHaveBeenCalledTimes(1)
      const payload = DataService.updateAiIntegration.mock.calls[0][0]
      expect(payload.globalPrompts).toHaveLength(2)
      expect(payload.globalPrompts.some((entry) => entry.id === 'g3')).toBe(false)
    })

    it('should not save when the user lacks edit permission', async () => {
      mockUserStore.isAllowed.mockReturnValue(false)
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.savePrompts()
      await wrapper.vm.$nextTick()

      expect(DataService.updateAiIntegration).not.toHaveBeenCalled()
    })
  })

  describe('beforeRouteLeave', () => {
    it('should call next() immediately when there are no unsaved changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      const next = vi.fn()
      wrapper.vm.$options.beforeRouteLeave.call(wrapper.vm, { name: 'to' }, { name: 'from' }, next)

      expect(Dialog.create).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalledTimes(1)
    })

    it('should open a confirm dialog and only call next() once onOk fires when there are unsaved prompt changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.promptMappings[0].prompt = 'Unsaved edit.'
      await wrapper.vm.$nextTick()

      let confirmLeave
      Dialog.create.mockImplementationOnce(() => ({
        onOk(cb) {
          confirmLeave = cb
          return this
        }
      }))

      const next = vi.fn()
      wrapper.vm.$options.beforeRouteLeave.call(wrapper.vm, { name: 'to' }, { name: 'from' }, next)

      expect(Dialog.create).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()

      confirmLeave()

      expect(next).toHaveBeenCalledTimes(1)
    })

    it('should open a confirm dialog when there are unsaved guideline changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.redactionGuidelines.content = 'New redaction guidance.'
      await wrapper.vm.$nextTick()

      const next = vi.fn()
      wrapper.vm.$options.beforeRouteLeave.call(wrapper.vm, { name: 'to' }, { name: 'from' }, next)

      expect(Dialog.create).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()
    })

    it('should open a confirm dialog when there are unsaved QA changes', async () => {
      const wrapper = createWrapper()
      await wrapper_flushPromises()

      wrapper.vm.qaChecks.completeness = false
      await wrapper.vm.$nextTick()

      const next = vi.fn()
      wrapper.vm.$options.beforeRouteLeave.call(wrapper.vm, { name: 'to' }, { name: 'from' }, next)

      expect(Dialog.create).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()
    })
  })
})

// Helper to flush all pending promises
function wrapper_flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 50))
}
