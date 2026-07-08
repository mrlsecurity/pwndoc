import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import AiProviderSettings from '@/components/ai-provider-settings.vue'

vi.mock('@/services/ai', () => ({
  default: {
    testProvider: vi.fn()
  }
}))

import AiService from '@/services/ai'

function buildSettings() {
  return {
    ai: {
      public: {
        defaultProvider: 'openai'
      },
      private: {
        openaiApiKey: '',
        openaiApiKeyConfigured: false,
        openaiBaseUrl: 'https://api.openai.com/v1',
        openaiModel: 'gpt-5.4-mini',
        anthropicApiKey: '',
        anthropicApiKeyConfigured: false,
        anthropicBaseUrl: 'https://api.anthropic.com/v1',
        anthropicModel: 'claude-opus-4-8',
        anthropicVersion: '2023-06-01',
        deepseekApiKey: '',
        deepseekApiKeyConfigured: false,
        deepseekBaseUrl: 'https://api.deepseek.com/v1',
        deepseekModel: 'deepseek-v4-flash',
        ollamaApiKey: '',
        ollamaApiKeyConfigured: false,
        ollamaBaseUrl: 'http://localhost:11434/v1',
        ollamaModel: 'llama3.1',
        bedrockApiKey: '',
        bedrockApiKeyConfigured: false,
        bedrockAccessKeyId: '',
        bedrockAccessKeyIdConfigured: false,
        bedrockSecretAccessKey: '',
        bedrockSecretAccessKeyConfigured: false,
        bedrockSessionToken: '',
        bedrockSessionTokenConfigured: false,
        bedrockRegion: 'us-east-1',
        bedrockModel: 'global.anthropic.claude-opus-4-8'
      }
    }
  }
}

const messages = {
  'en-US': {
    aiIntegration: {
      provider: {
        defaultProviderLabel: 'Default Provider',
        openaiBaseUrl: 'OpenAI Base URL',
        openaiModel: 'OpenAI Model',
        openaiApiKey: 'OpenAI API Key',
        testConnection: 'Test connection',
        testSuccess: 'Connection successful',
        testSuccessWithModel: 'Connection successful (model: {model})',
        testFailed: 'Connection failed'
      }
    }
  }
}

function createWrapper(settings = buildSettings()) {
  return createTestWrapper(AiProviderSettings, {
    messages,
    props: {
      settings,
      canEdit: true
    }
  })
}

describe('AiProviderSettings test connection', () => {
  it('sends the current form values (including an unsaved API key) to the test endpoint', async () => {
    AiService.testProvider.mockResolvedValue({ data: { datas: { ok: true, provider: 'openai', model: 'gpt-5.4-mini' } } })
    const wrapper = createWrapper()
    wrapper.vm.openaiApiKeyInput = 'sk-newly-typed-key'

    await wrapper.vm.testConnection('openai')

    expect(AiService.testProvider).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      openaiApiKey: 'sk-newly-typed-key',
      openaiBaseUrl: 'https://api.openai.com/v1',
      openaiModel: 'gpt-5.4-mini'
    }))
    expect(wrapper.vm.testResults.openai.ok).toBe(true)
    expect(wrapper.vm.testResults.openai.message).toContain('gpt-5.4-mini')
  })

  it('shows a clear inline error when the test fails', async () => {
    AiService.testProvider.mockRejectedValue({
      response: { data: { datas: 'OpenAI provider is not configured. Set API key.' } }
    })
    const wrapper = createWrapper()

    await wrapper.vm.testConnection('openai')

    expect(wrapper.vm.testResults.openai.ok).toBe(false)
    expect(wrapper.vm.testResults.openai.message).toBe('OpenAI provider is not configured. Set API key.')
  })

  it('clears the loading state after the test completes', async () => {
    AiService.testProvider.mockResolvedValue({ data: { datas: { ok: true, model: 'gpt-5.4-mini' } } })
    const wrapper = createWrapper()

    const promise = wrapper.vm.testConnection('openai')
    expect(wrapper.vm.testingProvider).toBe('openai')
    await promise

    expect(wrapper.vm.testingProvider).toBeNull()
  })
})
