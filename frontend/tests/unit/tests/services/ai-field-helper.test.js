import { describe, expect, it } from 'vitest'
import AiFieldHelper from '@/services/ai-field-helper'

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
