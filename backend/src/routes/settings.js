module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var Settings = require('mongoose').model('Settings');
    var _ = require('lodash');
    var { AI_PROVIDERS } = require('../lib/ai-prompts');
    var { invalidateLanguageToolConfigCache } = require('../lib/languagetool-config');
    var { testLanguageToolConnection } = require('../lib/languagetool-test');
    var { sanitizeSettingsForClient, mergeSettingsSecrets } = require('../lib/settings-secrets');

    // The "AI provider subtree" is governed by the dedicated `ai-settings:*` scopes rather
    // than the generic `settings:*` scopes: the provider credentials/config plus the master
    // enable toggle and default-provider selector. The remaining `ai.public.*` fields
    // (redaction guidelines, QA instructions/checks, global prompts) are managed elsewhere
    // and gated by the `ai:*` scopes, so they are intentionally left untouched here.
    const toPlainSettings = (settings) => (settings && settings.toObject ? settings.toObject() : (settings || {}));

    // Remove the AI provider subtree from an (already-sanitized) settings payload so users
    // without `ai-settings:read` never see provider config through the generic endpoint.
    const stripAiProviderSettings = (payload) => {
        _.unset(payload, 'ai.private');
        _.unset(payload, 'ai.public.defaultProvider');
        return payload;
    };

    // Isolate just the AI provider subtree for the dedicated endpoints.
    const pickAiProviderSettings = (payload) => ({
        public: {
            enabled: _.get(payload, 'ai.public.enabled'),
            defaultProvider: _.get(payload, 'ai.public.defaultProvider')
        },
        private: _.get(payload, 'ai.private')
    });

    app.get("/api/settings", acl.hasPermission('settings:read'), function(req, res) {
        Settings.getAll()
        .then(settings => {
            const payload = sanitizeSettingsForClient(settings);
            if (!acl.isAllowedToken(req.decodedToken, 'ai-settings:read'))
                stripAiProviderSettings(payload);
            Response.Ok(res, payload);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.get("/api/settings/ai", acl.hasPermission('ai-settings:read'), function(req, res) {
        Settings.getAll()
        .then(settings => Response.Ok(res, pickAiProviderSettings(sanitizeSettingsForClient(settings))))
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/settings/ai", acl.hasPermission('ai-settings:update'), async function(req, res) {
        try {
            const existing = await Settings.getAll();
            const existingObj = toPlainSettings(existing);
            const incoming = req.body || {};
            const update = {};

            if (incoming.private !== undefined) {
                // Reuse the shared secret-merge logic by shaping the payload as the settings tree.
                const merged = mergeSettingsSecrets({ ai: { private: incoming.private } }, existing);
                // Start from stored values so a partial payload never drops unrelated provider fields.
                update['ai.private'] = { ...(existingObj.ai?.private || {}), ...(merged.ai?.private || {}) };
            }

            if (incoming.public && Object.prototype.hasOwnProperty.call(incoming.public, 'enabled')) {
                if (typeof incoming.public.enabled !== 'boolean')
                    return Response.BadParameters(res, 'ai.public.enabled must be a boolean');
                update['ai.public.enabled'] = incoming.public.enabled;
            }

            if (incoming.public && incoming.public.defaultProvider !== undefined) {
                if (!AI_PROVIDERS.includes(incoming.public.defaultProvider))
                    return Response.BadParameters(res, 'Invalid AI provider');
                update['ai.public.defaultProvider'] = incoming.public.defaultProvider;
            }

            if (Object.keys(update).length === 0)
                return Response.BadParameters(res, 'No AI provider settings provided');

            const updated = await Settings.findOneAndUpdate({}, { $set: update }, { new: true, runValidators: true });
            Response.Ok(res, pickAiProviderSettings(sanitizeSettingsForClient(updated)));
        } catch (err) {
            Response.Internal(res, err);
        }
    });

    app.get("/api/settings/public", acl.hasPermission('settings:read-public'), function(req, res) {
        Settings.getPublic()
        .then(settings => Response.Ok(res, settings))
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/settings", acl.hasPermission('settings:update'), async function(req, res) {
        const existing = await Settings.getAll();
        req.body = mergeSettingsSecrets(req.body, existing);

        // The generic settings endpoint must never let a `settings:update`-only user change the
        // AI provider subtree — that requires `ai-settings:update` (see PUT /api/settings/ai).
        // Restore the provider fields to their stored values while preserving the surrounding
        // `ai.public.*` config the caller is otherwise allowed to edit.
        if (req.body.ai && !acl.isAllowedToken(req.decodedToken, 'ai-settings:update')) {
            const existingObj = toPlainSettings(existing);
            req.body.ai.private = existingObj.ai?.private || {};
            req.body.ai.public = { ...(existingObj.ai?.public || {}), ...(req.body.ai.public || {}) };
            req.body.ai.public.enabled = existingObj.ai?.public?.enabled;
            req.body.ai.public.defaultProvider = existingObj.ai?.public?.defaultProvider;
        }

        const spellcheckEnabled = req.body?.report?.public?.enableSpellCheck;
        const ltUrl = req.body?.report?.private?.languageToolUrl;

        if (spellcheckEnabled) {
            // Only validate and save LT fields when spellcheck is being enabled
            if (ltUrl) {
                const result = await testLanguageToolConnection(ltUrl);
                if (result.error) return Response.BadParameters(res, result.error);
                if (!result.isLanguageTool) return Response.BadParameters(res, 'languageToolUrl is not a valid LanguageTool endpoint');
            }
        } else if (req.body?.report?.private) {
            // Spellcheck disabled: restore existing LT values from DB so they are not overwritten
            const existingPrivate = existing?.report?.private;
            if (existingPrivate) {
                req.body.report.private.languageToolUrl = existingPrivate.languageToolUrl ?? '';
                req.body.report.private.languageToolApiKey = existingPrivate.languageToolApiKey ?? '';
                req.body.report.private.languageToolUsername = existingPrivate.languageToolUsername ?? '';
            }
        }

        Settings.update(req.body)
        .then(msg => {
            invalidateLanguageToolConfigCache();
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/settings/revert", acl.hasPermission('settings:update'), function(req, res) {
        Settings.restoreDefaults()
        .then(msg => {
            invalidateLanguageToolConfigCache();
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.get("/api/settings/export", acl.hasPermission("settings:read"), function(req, res) {
        Settings.getAll()
        .then(settings => Response.SendFile(res, "app-settings.json", sanitizeSettingsForClient(settings)))
        .catch(err => Response.Internal(res, err))
    });
}
