// Maps an authenticated API request to a human-readable action label for the access log.
// Keep this file purely functional — no DB, no I/O.

function labelFor(req) {
    var method = (req.method || '').toUpperCase();
    var routePath = (req.route && req.route.path) || req.originalUrl || '';
    var p = req.params || {};

    // Audits (routes are registered directly on app, so req.route.path is the full /api/... path)
    if (method === 'GET'    && routePath === '/api/audits')                                          return 'listed audits';
    if (method === 'POST'   && routePath === '/api/audits')                                          return 'created audit';
    if (method === 'GET'    && routePath === '/api/audits/:auditId')                                 return 'viewed audit ' + p.auditId;
    if (method === 'DELETE' && routePath === '/api/audits/:auditId')                                 return 'deleted audit ' + p.auditId;
    if (method === 'PUT'    && routePath === '/api/audits/:auditId/general')                         return 'updated audit ' + p.auditId + ' (general)';
    if (method === 'GET'    && routePath === '/api/audits/:auditId/findings')                        return 'listed findings of audit ' + p.auditId;
    if (method === 'POST'   && routePath === '/api/audits/:auditId/findings')                        return 'created finding in audit ' + p.auditId;
    if (method === 'GET'    && routePath === '/api/audits/:auditId/findings/:findingId')             return 'viewed finding ' + p.findingId;
    if (method === 'PUT'    && routePath === '/api/audits/:auditId/findings/:findingId')             return 'edited finding ' + p.findingId;
    if (method === 'DELETE' && routePath === '/api/audits/:auditId/findings/:findingId')             return 'deleted finding ' + p.findingId;

    // Users / profile
    if (method === 'GET' && routePath === '/api/users/me')                                           return 'viewed own profile';

    // Fallback
    return method + ' ' + (req.originalUrl || routePath);
}

module.exports = { labelFor };
