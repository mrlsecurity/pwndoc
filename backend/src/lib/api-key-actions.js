// Maps an authenticated API request to a human-readable action label for the access log.
// Keep this file purely functional — no DB, no I/O.

function labelFor(req) {
    var method = (req.method || '').toUpperCase();
    var routePath = (req.route && req.route.path) || req.originalUrl || '';
    var p = req.params || {};

    // Audits
    if (method === 'GET'    && routePath === '/')                                    return 'listed audits';
    if (method === 'POST'   && routePath === '/')                                    return 'created audit';
    if (method === 'GET'    && routePath === '/:auditId')                            return 'viewed audit ' + p.auditId;
    if (method === 'DELETE' && routePath === '/:auditId')                            return 'deleted audit ' + p.auditId;
    if (method === 'PUT'    && routePath === '/:auditId/general')                   return 'updated audit ' + p.auditId + ' (general)';
    if (method === 'GET'    && routePath === '/:auditId/findings')                  return 'listed findings of audit ' + p.auditId;
    if (method === 'POST'   && routePath === '/:auditId/findings')                  return 'created finding in audit ' + p.auditId;
    if (method === 'GET'    && routePath === '/:auditId/findings/:findingId')       return 'viewed finding ' + p.findingId;
    if (method === 'PUT'    && routePath === '/:auditId/findings/:findingId')       return 'edited finding ' + p.findingId;
    if (method === 'DELETE' && routePath === '/:auditId/findings/:findingId')       return 'deleted finding ' + p.findingId;

    // Users / profile
    if (method === 'GET' && routePath === '/me')                                     return 'viewed own profile';

    // Fallback
    return method + ' ' + (req.originalUrl || routePath);
}

module.exports = { labelFor };
