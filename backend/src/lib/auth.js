// Dynamic generation of JWT Secret if not exist (different for each environnment)
var fs = require('fs')
var env = process.env.NODE_ENV || 'dev'
var config = require('../config/config.json')
var permissionsCatalog = require('./permissions-catalog')

if (!config[env].jwtSecret) {
    config[env].jwtSecret = require('crypto').randomBytes(32).toString('hex')
    var configString = JSON.stringify(config, null, 4)
    fs.writeFileSync(`${__basedir}/config/config.json`, configString)
}
if (!config[env].jwtRefreshSecret) {
    config[env].jwtRefreshSecret = require('crypto').randomBytes(32).toString('hex')
    var configString = JSON.stringify(config, null, 4)
    fs.writeFileSync(`${__basedir}/config/config.json`, configString)
}

var jwtSecret = config[env].jwtSecret
exports.jwtSecret = jwtSecret

var jwtRefreshSecret = config[env].jwtRefreshSecret
exports.jwtRefreshSecret = jwtRefreshSecret

/*  ROLES LOGIC

    role_name: {
        allows: [],
        inherits: []
    }
    allows: allowed permissions to access | use * for all
    inherits: inherits other users "allows"
*/

const CORE_PERMISSIONS = permissionsCatalog.core()
exports.CORE_PERMISSIONS = CORE_PERMISSIONS
const SYSTEM_ROLES = ['admin', 'user']

class ACL {
    constructor(roles) {
        if(typeof roles !== 'object') {
            throw new TypeError('Expected an object as input')
        }
        this.roles = roles
    }

    async reload() {
        const Role = require('mongoose').model('Role')
        const dbRoles = await Role.getAll()
        const roles = {
            admin: {allows: '*'},
            user: {allows: CORE_PERMISSIONS}
        }
        dbRoles.forEach(role => {
            if (SYSTEM_ROLES.includes(role.name))
                return
            roles[role.name] = {allows: role.allows || []}
        })
        this.roles = roles
    }

    normalizeRoleNames(roleNames) {
        if (typeof roleNames === 'string')
            roleNames = [roleNames]
        if (!Array.isArray(roleNames))
            roleNames = []
        const known = roleNames.filter(roleName => this.roles[roleName])
        if (known.length === 0)
            return ['user']
        return known
    }

    roleAllows(roleName, permission) {
        const role = this.roles[roleName]
        if (!role || !role.allows)
            return false
        return role.allows === '*' || role.allows.indexOf(permission) !== -1 || role.allows.indexOf(`${permission}-all`) !== -1
    }

    isAllowedPermissions(permissions, permission) {
        if (permissions === '*')
            return true
        if (!Array.isArray(permissions))
            return false
        return permissions.includes(permission) || permissions.includes(`${permission}-all`)
    }

    isAllowed(roleNames, permission) {
        return this.normalizeRoleNames(roleNames).some(roleName => this.roleAllows(roleName, permission))
    }

    isAllowedToken(decoded, permission) {
        return this.isAllowedPermissions(decoded.permissions, permission) ||
            this.isAllowed(decoded.roles, permission)
    }

    hasPermission (permission) {
        var Response = require('./httpResponse')
        var jwt = require('jsonwebtoken')
        var mongoose = require('mongoose')
        var actionLabels = require('./api-key-actions')
        var self = this

        return (req, res, next) => {
            var authHeader = req.headers['authorization']
            if (authHeader && authHeader.startsWith('Bearer pwndoc_')) {
                var raw = authHeader.slice('Bearer '.length)
                var User = mongoose.model('User')
                User.findByApiKey(raw).then(match => {
                    if (!match) return Response.Unauthorized(res, 'Invalid API key')
                    var user = match.user
                    if (user.enabled === false) return Response.Unauthorized(res, 'Invalid API key')

                    // Mirror the JWT payload built in models/user.js so that every downstream
                    // acl.isAllowedToken()/hasPermission() check sees the same shape:
                    // `roles` = role names, `permissions` = the expanded scope list.
                    var roles = user.roles || []
                    var decodedToken = {
                        id: user._id,
                        username: user.username,
                        roles: roles,
                        permissions: self.getRoles(roles),
                        firstname: user.firstname,
                        lastname: user.lastname,
                        email: user.email,
                        phone: user.phone,
                        jobTitle: user.jobTitle
                    }

                    if (permission !== 'validtoken' && !self.isAllowedToken(decodedToken, permission))
                        return Response.Forbidden(res, 'Insufficient privileges')

                    req.decodedToken = decodedToken
                    req.apiKeyId = match.apiKeyId

                    // Fire-and-forget access log write. IMPORTANT: never trust X-Forwarded-For.
                    var entry = {
                        at: new Date(),
                        ip: req.ip || (req.connection && req.connection.remoteAddress) || '',
                        userAgent: req.headers['user-agent'] || '',
                        method: req.method,
                        path: req.originalUrl,
                        action: actionLabels.labelFor(req)
                    }
                    User.recordApiKeyAccess(user._id, entry).catch(err => {
                        console.warn('Failed to record API key access log:', err && err.message)
                    })
                    return next()
                }).catch(() => Response.Internal(res, { message: 'API key auth error' }))
                return
            }

            // ---- Cookie-JWT branch ----
            if (!req.cookies['token']) {
                Response.Unauthorized(res, 'No token provided')
                return;
            }
    
            var cookie = req.cookies['token'].split(' ')
            if (cookie.length !== 2 || cookie[0] !== 'JWT') {
                Response.Unauthorized(res, 'Bad token type')
                return
            }
    
            var token = cookie[1]
            jwt.verify(token, jwtSecret, (err, decoded) => {
                if (err) {
                    if (err.name === 'TokenExpiredError')
                        Response.Unauthorized(res, 'Expired token')
                    else
                        Response.Unauthorized(res, 'Invalid token')
                    return
                }

                // Tokens issued before the roles/permissions payload migration lack `permissions`
                // and have `roles` populated with permission strings instead of role names.
                // Reject them so the client immediately refreshes instead of running with
                // permissions silently resolved from those stale, mismatched roles.
                if (decoded.permissions === undefined) {
                    Response.Unauthorized(res, 'Invalid token')
                    return
                }

                if ( permission === "validtoken" || this.isAllowedToken(decoded, permission)) {
                    req.decodedToken = decoded
                    return next()
                }
                else {
                    Response.Forbidden(res, 'Insufficient privileges')
                    return
                }
            })
        }
    }

    getRoles(roleNames) {
        const normalizedRoleNames = this.normalizeRoleNames(roleNames)
        if (normalizedRoleNames.includes('admin'))
            return '*'

        let result = []
        normalizedRoleNames.forEach(roleName => {
            const role = this.roles[roleName]
            if (role && Array.isArray(role.allows))
                result = [...new Set([...result, ...role.allows])]
        })
        
        return result
    }
}

exports.acl = new ACL({
    admin: {allows: '*'},
    user: {allows: CORE_PERMISSIONS}
})
