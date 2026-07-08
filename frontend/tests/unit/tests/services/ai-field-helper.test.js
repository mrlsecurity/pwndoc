import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import AiFieldHelper from '@/services/ai-field-helper'
import { useAiGenerationStore } from '@/stores/ai-generation'

vi.mock('@/stores/audit-qa', () => ({
  useAuditQaStore: () => ({
    close: vi.fn()
  })
}))

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AiFieldHelper.buildAiDiffDraft', () => {
  it('replaces a finding field in field mode', () => {
    const diffContext = {
      current: {
        title: 'Finding title',
        description: 'Old description'
      },
      entityShape: 'finding',
      fieldKey: 'description',
      locale: 'en',
      outputType: 'text',
      mode: 'field',
      selection: null,
      languages: []
    }

    const draftData = AiFieldHelper.buildAiDiffDraft(diffContext, 'New description')
    expect(draftData.description).toBe('New description')
    expect(diffContext.current.description).toBe('Old description')
  })

  it('replaces a selection inside a vulnerability detail', () => {
    const diffContext = {
      current: {
        details: [{
          locale: 'en',
          description: 'alpha beta gamma'
        }]
      },
      entityShape: 'vulnerability',
      fieldKey: 'description',
      locale: 'en',
      outputType: 'text',
      mode: 'selection',
      selection: { start: 6, end: 10, text: 'beta' },
      languages: []
    }

    const draftData = AiFieldHelper.buildAiDiffDraft(diffContext, 'delta')
    expect(draftData.details[0].description).toBe('alpha delta gamma')
  })
})

describe('AiFieldHelper.runFieldAiChat', () => {
  it('scopes field-mode context to the active standard field value', async () => {
    const promise = AiFieldHelper.runFieldAiChat({
      title: 'AI - Description',
      defaultPrompt: 'Proofread the text.',
      outputType: 'html',
      fieldLabel: 'Description',
      requestParams: {
        entityType: 'finding',
        field: 'description',
        locale: 'en',
        outputType: 'html',
        context: {
          title: 'Finding title',
          description: '<p>Description only</p>',
          observation: '<p>Observation must stay out</p>'
        }
      }
    })

    const store = useAiGenerationStore()
    expect(store.sessionConfig.requestParams.context).toEqual(expect.objectContaining({
      currentFieldKey: 'description',
      currentFieldLabel: 'Description',
      currentFieldValue: '<p>Description only</p>'
    }))

    store.cancelSession({ force: true })
    await expect(promise).resolves.toBeNull()
  })

  it('scopes field-mode context to the active custom field value', async () => {
    const promise = AiFieldHelper.runFieldAiChat({
      title: 'AI - Custom',
      defaultPrompt: 'Proofread the text.',
      outputType: 'html',
      fieldLabel: 'Custom',
      requestParams: {
        entityType: 'finding',
        field: 'custom-field:abc123',
        locale: 'en',
        outputType: 'html',
        context: {
          customFieldLabel: 'Custom',
          customFieldValue: '<p>Custom field only</p>',
          description: '<p>Description must stay out</p>'
        }
      }
    })

    const store = useAiGenerationStore()
    expect(store.sessionConfig.requestParams.context).toEqual(expect.objectContaining({
      currentFieldKey: 'custom-field:abc123',
      currentFieldLabel: 'Custom',
      currentFieldValue: '<p>Custom field only</p>'
    }))

    store.cancelSession({ force: true })
    await expect(promise).resolves.toBeNull()
  })
})
