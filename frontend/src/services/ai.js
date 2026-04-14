import { api } from 'boot/axios'

export default {
    executeAction: function(data) {
        return api.post('ai/execute', data)
    },

    getActions: function() {
        return api.get('ai/actions')
    },

    createAction: function(data) {
        return api.post('ai/actions', data)
    },

    updateAction: function(id, data) {
        return api.put(`ai/actions/${id}`, data)
    },

    deleteAction: function(id) {
        return api.delete(`ai/actions/${id}`)
    },

    getSettings: function() {
        return api.get('ai/settings')
    },

    testConnection: function(data) {
        return api.post('ai/test-connection', data)
    }
}
