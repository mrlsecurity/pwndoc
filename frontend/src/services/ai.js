import { api } from 'boot/axios'

export default {
  getEnabledFields: function(entityType) {
    return api.get('ai/enabled-fields', {
      params: { entityType }
    })
  },

  generateFieldDraft: function(params, config = {}) {
    return api.post('ai/generate', params, config)
  },

  runAuditQa: function(auditId, params = {}) {
    return api.post('ai/qa', {
      auditId: auditId,
      ...params
    })
  },

  runVulnerabilityQa: function(params = {}) {
    return api.post('ai/vulnerabilities/qa', params)
  },

  testProvider: function(params = {}) {
    return api.post('ai/test', params)
  },
}
