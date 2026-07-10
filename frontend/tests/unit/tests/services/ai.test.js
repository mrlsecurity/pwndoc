import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('boot/axios', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

import { api } from 'boot/axios'
import AiService from '@/services/ai'

describe('AiService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateFieldDraft', () => {
    it('posts the payload with no config by default', async () => {
      api.post.mockResolvedValue({ data: { datas: {} } })

      await AiService.generateFieldDraft({ userPrompt: 'hi' })

      expect(api.post).toHaveBeenCalledWith('ai/generate', { userPrompt: 'hi' }, {})
    })

    it('forwards a request config (e.g. a cancelToken) to axios', async () => {
      api.post.mockResolvedValue({ data: { datas: {} } })
      const cancelToken = { promise: Promise.resolve() }

      await AiService.generateFieldDraft({ userPrompt: 'hi' }, { cancelToken })

      expect(api.post).toHaveBeenCalledWith('ai/generate', { userPrompt: 'hi' }, { cancelToken })
    })
  })
})
