import { describe, it, expect, vi } from 'vitest'
import { createTestWrapper } from '../../test-utils'
import { useQaRunsStore } from '@/stores/qa-runs'
import { useAuditQaStore } from '@/stores/audit-qa'

vi.mock('@/boot/i18n', () => ({
  $t: (key) => key
}))

// audit-qa.js pulls in AiService, which pulls in boot/axios, which calls useUserStore() at
// module scope — mocking it here avoids that import chain running before any pinia is active.
vi.mock('@/services/ai', () => ({
  default: {
    runAuditQa: vi.fn()
  }
}))

import AuditQaSidebar from '@/components/audit-qa-sidebar.vue'

// q-scroll-area is the panel's real scroll container in the app (an inner overflow div never
// gets a definite height once nested inside it), so the stub must expose a fake
// setScrollPosition and let tests fire its `scroll` event, mirroring Quasar's real API.
function createWrapper(props = {}) {
  const setScrollPosition = vi.fn()

  const wrapper = createTestWrapper(AuditQaSidebar, {
    props: {
      auditId: 'audit-1',
      height: 'calc(100vh - 104px)',
      ...props
    },
    global: {
      stubs: {
        'qa-results-panel': true,
        'q-scroll-area': {
          template: '<div><slot /></div>',
          methods: { setScrollPosition }
        }
      }
    }
  })

  // The store instance created inside createTestWrapper's fresh pinia is only reachable
  // through the mounted component from here on — resolve it the same way the component does.
  useAuditQaStore().auditId = 'audit-1'

  return { wrapper, setScrollPosition }
}

describe('AuditQaSidebar scroll position', () => {
  it('restores the persisted scroll position', async () => {
    const { wrapper, setScrollPosition } = createWrapper()
    useQaRunsStore().setScrollTop('audit:audit-1', 240)

    wrapper.vm.restoreScrollPosition()
    await wrapper.vm.$nextTick()

    expect(setScrollPosition).toHaveBeenCalledWith('vertical', 240, 0)
  })

  it('does not attempt to restore when nothing was persisted', async () => {
    const { wrapper, setScrollPosition } = createWrapper()

    wrapper.vm.restoreScrollPosition()
    await wrapper.vm.$nextTick()

    expect(setScrollPosition).not.toHaveBeenCalled()
  })

  it('persists the scroll position when the scroll area reports one', () => {
    const { wrapper } = createWrapper()

    wrapper.vm.onScroll({ verticalPosition: 180 })

    expect(useQaRunsStore().scrollTop('audit:audit-1')).toBe(180)
  })

  it('re-applies the restore once the report finishes loading', async () => {
    const { wrapper, setScrollPosition } = createWrapper()
    useQaRunsStore().setScrollTop('audit:audit-1', 300)

    useQaRunsStore().getRun('audit:audit-1').report = { issues: [], hasReport: true }
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(setScrollPosition).toHaveBeenCalledWith('vertical', 300, 0)
  })
})

describe('AuditQaSidebar navigation', () => {
  it('pushes the resolved route for a finding location', () => {
    const { wrapper } = createWrapper({
      findings: [{ _id: '507f1f77bcf86cd799439011', title: 'XSS' }]
    })
    wrapper.vm.$router.push = vi.fn().mockResolvedValue()

    wrapper.vm.navigateTo('finding:507f1f77bcf86cd799439011::XSS')

    expect(wrapper.vm.$router.push).toHaveBeenCalledWith('/audits/audit-1/findings/507f1f77bcf86cd799439011')
  })

  it('pushes the general page for a general location', () => {
    const { wrapper } = createWrapper()
    wrapper.vm.$router.push = vi.fn().mockResolvedValue()

    wrapper.vm.navigateTo('general')

    expect(wrapper.vm.$router.push).toHaveBeenCalledWith('/audits/audit-1/general')
  })
})
