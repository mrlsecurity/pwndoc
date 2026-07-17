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

  startVulnerabilityQaRun: function(params = {}) {
    return api.post('ai/vulnerabilities/qa/run', params)
  },

  getVulnerabilityQaStatus: function(locale) {
    return api.get('ai/vulnerabilities/qa/status', {
      params: { locale }
    })
  },

  cancelVulnerabilityQaRun: function(locale) {
    return api.post('ai/vulnerabilities/qa/cancel', { locale })
  },

  setVulnerabilityQaIssueDismissed: function(params = {}) {
    return api.post('ai/vulnerabilities/qa/dismiss', params)
  },

  resolveVulnerabilityQa: function(params = {}) {
    return api.post('ai/vulnerabilities/qa/resolve', params)
  },

  testProvider: function(params = {}) {
    return api.post('ai/test', params)
  },
}
