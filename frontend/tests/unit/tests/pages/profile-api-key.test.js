import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import ProfilePage from '@/pages/profile/index.vue'
import UserService from '@/services/user'

// Mock all UserService methods used by the profile page
vi.mock('@/services/user', () => ({
  default: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    refreshToken: vi.fn(),
    getTotpQrCode: vi.fn(),
    setupTotp: vi.fn(),
    cancelTotp: vi.fn(),
    getApiKey: vi.fn(),
    createApiKey: vi.fn(),
    revokeApiKey: vi.fn()
  }
}))

vi.mock('@/services/utils', () => ({
  default: {
    strongPassword: vi.fn()
  }
}))

vi.mock('quasar', async () => {
  const actual = await vi.importActual('quasar')
  return {
    ...actual,
    Notify: {
      create: vi.fn()
    }
  }
})

vi.mock('@/boot/i18n', () => {
  const messages = {
    'msg.apiKeyNameRequired': 'API key name is required',
    'msg.apiKeyRevoked': 'API key revoked',
    'msg.copiedToClipboard': 'Copied to clipboard',
    'msg.profileUpdateOk': 'Profile updated successfully',
    'msg.usernameRequired': 'Username required',
    'msg.firstnameRequired': 'First name required',
    'msg.lastnameRequired': 'Last name required',
    'msg.currentPasswordRequired': 'Current password required',
    'msg.confirmPasswordDifferents': 'Passwords do not match',
    'msg.passwordComplexity': 'Password does not meet complexity requirements'
  }
  return {
    $t: (key) => messages[key] || key
  }
})

const i18nMessages = {
  'en-US': {
    updateUserInformation: 'Update User Information',
    role: 'Role',
    username: 'Username',
    firstname: 'First Name',
    lastname: 'Last Name',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password',
    currentPassword: 'Current Password',
    apiKeys: 'API Key',
    apiKeyIntro: 'Create an API key to authenticate scripts and integrations as yourself.',
    apiKeyName: 'Key name',
    apiKeyPrefix: 'Prefix',
    apiKeyCreatedTitle: 'API key created',
    apiKeyCopyWarning: 'Copy this key now. It will not be shown again.',
    apiKeyRecentAccesses: 'Recent accesses',
    apiKeyNoAccesses: 'No recorded accesses yet.',
    lastUsed: 'Last used',
    never: 'Never',
    ipAddress: 'IP',
    userAgent: 'User-Agent',
    action: 'Action',
    time: 'Time',
    created: 'Created',
    name: 'Name',
    btn: {
      update: 'Update',
      create: 'Create',
      revoke: 'Revoke',
      copy: 'Copy',
      close: 'Close'
    },
    msg: {
      apiKeyNameRequired: 'API key name is required',
      apiKeyRevoked: 'API key revoked',
      copiedToClipboard: 'Copied to clipboard',
      usernameRequired: 'Username required',
      firstnameRequired: 'First name required',
      lastnameRequired: 'Last name required',
      currentPasswordRequired: 'Current password required',
      confirmPasswordDifferents: 'Passwords do not match',
      passwordComplexity: 'Password does not meet complexity requirements',
      profileUpdateOk: 'Profile updated successfully'
    }
  }
}

describe('Profile Page — API Key panel', () => {
  let router, pinia, i18n, wrapper

  const mockUser = {
    username: 'testuser',
    firstname: 'Test',
    lastname: 'User',
    email: 'test@example.com',
    phone: '1234567890',
    roles: ['user'],
    totpEnabled: false
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/profile', component: ProfilePage }]
    })

    i18n = createI18n({
      legacy: false,
      globalInjection: true,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages: i18nMessages
    })

    vi.clearAllMocks()

    // Default: getProfile returns a user, getApiKey returns no key (null)
    UserService.getProfile.mockResolvedValue({
      data: { datas: { ...mockUser } }
    })
    UserService.getApiKey.mockResolvedValue({
      data: { datas: null }
    })
  })

  const createWrapper = () => {
    return mount(ProfilePage, {
      global: {
        plugins: [pinia, router, i18n],
        stubs: {
          // Stub out most Quasar layout components but render the meaningful ones
          'q-card': { template: '<div class="q-card"><slot /></div>' },
          'q-card-section': { template: '<div class="q-card-section"><slot /></div>' },
          'q-card-actions': { template: '<div class="q-card-actions"><slot /></div>' },
          'q-separator': true,
          'q-list': { template: '<div class="q-list"><slot /></div>' },
          'q-item': { template: '<div class="q-item"><slot /></div>' },
          'q-item-section': { template: '<span class="q-item-section"><slot /></span>' },
          'q-input': {
            props: ['modelValue', 'label', 'data-testid'],
            emits: ['update:modelValue'],
            template: `<div>
              <input
                :data-testid="$attrs['data-testid']"
                :value="modelValue"
                @input="$emit('update:modelValue', $event.target.value)"
              />
              <slot name="append" />
            </div>`
          },
          'q-btn': {
            props: ['label', 'data-testid'],
            emits: ['click'],
            template: `<button :data-testid="$attrs['data-testid']" @click="$emit('click')">{{ label }}</button>`
          },
          'q-toggle': true,
          'q-field': { template: '<div><slot /></div>' },
          'q-img': true,
          'q-chip': true,
          'q-dialog': {
            props: ['modelValue'],
            template: `<div v-if="modelValue" class="q-dialog"><slot /></div>`
          },
          'q-expansion-item': {
            props: ['label'],
            template: `<div class="q-expansion-item"><div class="expansion-label">{{ label }}</div><slot /></div>`
          },
          'q-markup-table': { template: '<table><slot /></table>' }
        },
        mocks: {
          $t: (key) => {
            // Flatten nested key lookup (e.g. 'btn.create')
            const parts = key.split('.')
            let val = i18nMessages['en-US']
            for (const part of parts) {
              val = val && val[part]
            }
            return val !== undefined ? val : key
          }
        }
      }
    })
  }

  describe('No existing key', () => {
    it('renders the name input when no API key exists', async () => {
      wrapper = createWrapper()
      // Wait for mounted() async calls to resolve
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(wrapper.find('[data-testid="api-key-name-input"]').exists()).toBe(true)
    })

    it('does NOT render the revoke button when no API key exists', async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(wrapper.find('[data-testid="api-key-revoke-btn"]').exists()).toBe(false)
    })

    it('loadApiKey calls UserService.getApiKey on mount', async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()

      expect(UserService.getApiKey).toHaveBeenCalled()
    })
  })

  describe('Create API key — reveal dialog', () => {
    it('opens the reveal dialog and shows the key text after createApiKey resolves', async () => {
      UserService.createApiKey.mockResolvedValue({
        data: {
          datas: {
            name: 'k',
            prefix: 'pwndoc_abcd1234',
            key: 'pwndoc_fullkey'
          }
        }
      })
      // After reveal, getApiKey will return the new key metadata
      UserService.getApiKey.mockResolvedValueOnce({ data: { datas: null } })
        .mockResolvedValue({
          data: {
            datas: {
              _id: 'fakeid',
              name: 'k',
              prefix: 'pwndoc_abcd1234',
              created: new Date().toISOString(),
              lastUsed: null,
              recentAccesses: []
            }
          }
        })

      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Set the key name and call createApiKey
      wrapper.vm.apiKeyNewName = 'k'
      wrapper.vm.createApiKey()

      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      // The reveal dialog should be open
      expect(wrapper.vm.apiKeyReveal.show).toBe(true)
      expect(wrapper.vm.apiKeyReveal.key).toBe('pwndoc_fullkey')

      // The key text should appear in the DOM (dialog is rendered via v-if="modelValue")
      expect(wrapper.html()).toContain('pwndoc_fullkey')
    })
  })

  describe('Existing key with recentAccesses', () => {
    const mockAccess1 = {
      at: new Date('2026-01-01T10:00:00Z').toISOString(),
      ip: '127.0.0.1',
      userAgent: 'curl/7.88.0',
      method: 'GET',
      path: '/api/audits',
      action: 'listed audits'
    }
    const mockAccess2 = {
      at: new Date('2026-01-01T11:00:00Z').toISOString(),
      ip: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      method: 'GET',
      path: '/api/audits',
      action: 'listed audits'
    }

    beforeEach(() => {
      UserService.getApiKey.mockResolvedValue({
        data: {
          datas: {
            _id: 'fakeid',
            name: 'mykey',
            prefix: 'pwndoc_abcd1234',
            created: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            recentAccesses: [mockAccess1, mockAccess2]
          }
        }
      })
    })

    it('renders two table rows for two recentAccesses entries', async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      const rows = wrapper.findAll('tbody tr')
      expect(rows.length).toBe(2)
    })

    it('each row action cell matches the entry action', async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      const rows = wrapper.findAll('tbody tr')
      // Each row has: time, ip, userAgent, action — action is 4th <td>
      const row0Cells = rows[0].findAll('td')
      const row1Cells = rows[1].findAll('td')

      expect(row0Cells[3].text()).toBe('listed audits')
      expect(row1Cells[3].text()).toBe('listed audits')
    })

    it('shows the revoke button when a key exists', async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(wrapper.find('[data-testid="api-key-revoke-btn"]').exists()).toBe(true)
    })

    it('does NOT show the name input when a key exists', async () => {
      wrapper = createWrapper()
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(wrapper.find('[data-testid="api-key-name-input"]').exists()).toBe(false)
    })
  })
})
