import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('boot/axios', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

import { api } from 'boot/axios'
import AIService from '@/services/ai'

describe('AIService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('executeAction', () => {
    it('should call the correct API endpoint with action data', async () => {
      const actionData = { action: 'generate', content: 'test', targetField: 'description' }
      const mockResponse = { data: { datas: { result: 'Generated content' } } }
      api.post.mockResolvedValue(mockResponse)

      const result = await AIService.executeAction(actionData)

      expect(api.post).toHaveBeenCalledWith('ai/execute', actionData)
      expect(result).toEqual(mockResponse)
    })

    it('should handle errors', async () => {
      const mockError = new Error('AI execution failed')
      api.post.mockRejectedValue(mockError)

      await expect(AIService.executeAction({})).rejects.toEqual(mockError)
    })
  })

  describe('getActions', () => {
    it('should call the correct API endpoint', async () => {
      const mockResponse = { data: { datas: [{ id: 'generate', name: 'Generate', type: 'builtin' }] } }
      api.get.mockResolvedValue(mockResponse)

      const result = await AIService.getActions()

      expect(api.get).toHaveBeenCalledWith('ai/actions')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('createAction', () => {
    it('should call the correct API endpoint with action data', async () => {
      const actionData = { name: 'Custom', type: 'custom', systemPrompt: 'test' }
      const mockResponse = { data: { datas: { _id: '123', ...actionData } } }
      api.post.mockResolvedValue(mockResponse)

      const result = await AIService.createAction(actionData)

      expect(api.post).toHaveBeenCalledWith('ai/actions', actionData)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('updateAction', () => {
    it('should call the correct API endpoint with id and data', async () => {
      const mockResponse = { data: { datas: { _id: '123', name: 'Updated' } } }
      api.put.mockResolvedValue(mockResponse)

      const result = await AIService.updateAction('123', { name: 'Updated' })

      expect(api.put).toHaveBeenCalledWith('ai/actions/123', { name: 'Updated' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('deleteAction', () => {
    it('should call the correct API endpoint with id', async () => {
      const mockResponse = { data: { datas: 'Action deleted' } }
      api.delete.mockResolvedValue(mockResponse)

      const result = await AIService.deleteAction('123')

      expect(api.delete).toHaveBeenCalledWith('ai/actions/123')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getSettings', () => {
    it('should call the correct API endpoint', async () => {
      const mockResponse = { data: { datas: { enabled: true, provider: { baseURL: 'http://test' } } } }
      api.get.mockResolvedValue(mockResponse)

      const result = await AIService.getSettings()

      expect(api.get).toHaveBeenCalledWith('ai/settings')
      expect(result).toEqual(mockResponse)
    })
  })
})
