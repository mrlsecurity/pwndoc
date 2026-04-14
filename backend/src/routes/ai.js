module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var AIAction = require('mongoose').model('AIAction');
    var Settings = require('mongoose').model('Settings');
    var aiClient = require('../lib/ai-client');
    var aiPrompts = require('../lib/ai-prompts');
    var OpenAI = require('openai');

    // Execute an AI action
    app.post("/api/ai/execute", acl.hasPermission('ai:use'), async function(req, res) {
        try {
            var settings = await Settings.getAll();
            if (!settings.ai || !settings.ai.enabled) {
                return Response.Forbidden(res, 'AI integration is disabled');
            }

            var { action, content, context, targetField, options } = req.body;

            if (!action) {
                return Response.BadParameters(res, 'Action is required');
            }

            var systemPrompt;
            var builtinActions = ['generate', 'rephrase', 'translate', 'summarize'];

            if (builtinActions.includes(action)) {
                // Built-in action — look for admin override
                var override = await AIAction.findOne({
                    type: 'builtin_override',
                    builtinAction: action,
                    isEnabled: true
                });

                var adminInstructions = override ? override.adminInstructions : '';
                systemPrompt = aiPrompts.buildSystemPrompt(
                    action,
                    { fieldName: targetField, language: options && options.language },
                    adminInstructions
                );
            }
            else {
                // Custom action — look up by ID
                var customAction = await AIAction.findById(action);
                if (!customAction || !customAction.isEnabled) {
                    return Response.NotFound(res, 'Action not found or disabled');
                }

                systemPrompt = customAction.systemPrompt || '';
                if (customAction.adminInstructions) {
                    systemPrompt += '\n\nAdditional instructions:\n' + customAction.adminInstructions;
                }
            }

            if (!systemPrompt) {
                return Response.BadParameters(res, 'Could not build system prompt for action');
            }

            var userPrompt = aiPrompts.buildUserPrompt({
                action: action,
                content: content || '',
                context: context,
                targetField: targetField,
                options: options
            });

            var result = await aiClient.complete({
                systemPrompt: systemPrompt,
                userPrompt: userPrompt,
                temperature: 0.3
            });

            Response.Ok(res, { result: result });
        }
        catch (error) {
            console.error('AI execute error:', error.message);
            Response.Internal(res, error.message);
        }
    });

    // List all actions (built-in + custom)
    app.get("/api/ai/actions", acl.hasPermission('ai:use'), async function(req, res) {
        try {
            var dbActions = await AIAction.getAll();

            // Build the full list: built-in actions + custom actions
            var builtinActions = ['generate', 'rephrase', 'translate', 'summarize'];
            var actions = builtinActions.map(function(name) {
                var override = dbActions.find(function(a) {
                    return a.type === 'builtin_override' && a.builtinAction === name;
                });
                return {
                    id: name,
                    name: name.charAt(0).toUpperCase() + name.slice(1),
                    type: 'builtin',
                    builtinAction: name,
                    adminInstructions: override ? override.adminInstructions : '',
                    targetFields: [],
                    isEnabled: override ? override.isEnabled : true,
                    position: override ? override.position : builtinActions.indexOf(name)
                };
            });

            // Add custom actions
            dbActions
                .filter(function(a) { return a.type === 'custom'; })
                .forEach(function(a) {
                    actions.push({
                        id: a._id,
                        name: a.name,
                        type: 'custom',
                        systemPrompt: a.systemPrompt,
                        adminInstructions: a.adminInstructions,
                        targetFields: a.targetFields,
                        isEnabled: a.isEnabled,
                        position: a.position
                    });
                });

            actions.sort(function(a, b) { return a.position - b.position; });

            Response.Ok(res, actions);
        }
        catch (error) {
            Response.Internal(res, error.message);
        }
    });

    // Create a custom action or builtin override
    app.post("/api/ai/actions", acl.hasPermission('ai:configure'), async function(req, res) {
        try {
            var action = await AIAction.createAction(req.body);
            Response.Created(res, action);
        }
        catch (error) {
            if (error.code === 11000) {
                Response.BadParameters(res, 'An action with this name already exists');
            }
            else {
                Response.Internal(res, error.message);
            }
        }
    });

    // Update an action
    app.put("/api/ai/actions/:id", acl.hasPermission('ai:configure'), async function(req, res) {
        try {
            var action = await AIAction.updateAction(req.params.id, req.body);
            if (!action) {
                return Response.NotFound(res, 'Action not found');
            }
            Response.Ok(res, action);
        }
        catch (error) {
            Response.Internal(res, error.message);
        }
    });

    // Delete a custom action
    app.delete("/api/ai/actions/:id", acl.hasPermission('ai:configure'), async function(req, res) {
        try {
            var action = await AIAction.findById(req.params.id);
            if (!action) {
                return Response.NotFound(res, 'Action not found');
            }
            if (action.type === 'builtin_override') {
                // For builtin overrides, just delete the override (resets to defaults)
                await AIAction.deleteAction(req.params.id);
                return Response.Ok(res, 'Built-in action override removed');
            }
            await AIAction.deleteAction(req.params.id);
            Response.Ok(res, 'Action deleted');
        }
        catch (error) {
            Response.Internal(res, error.message);
        }
    });

    // Test AI provider connection with provided (unsaved) credentials
    app.post("/api/ai/test-connection", acl.hasPermission('ai:configure'), async function(req, res) {
        try {
            var { baseURL, model, apiKey: providedApiKey } = req.body;

            if (!baseURL) return Response.BadParameters(res, 'Provider URL is required');
            if (!model)   return Response.BadParameters(res, 'Model is required');

            // Resolve API key: prefer form value, then stored key, then env var
            var resolvedApiKey = providedApiKey;
            if (!resolvedApiKey) {
                var settings = await Settings.getAll();
                var storedKey = settings.ai && settings.ai.private && settings.ai.private.provider && settings.ai.private.provider.apiKey;
                resolvedApiKey = storedKey || process.env.AI_API_KEY || '';
            }
            if (!resolvedApiKey) {
                return Response.BadParameters(res, 'API key not configured. Enter one in the form or set the AI_API_KEY environment variable.');
            }

            var start = Date.now();
            var client = new OpenAI({ baseURL, apiKey: resolvedApiKey });
            await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1
            });
            var latencyMs = Date.now() - start;

            Response.Ok(res, { success: true, model, latencyMs });
        }
        catch (error) {
            // Return a structured failure so the UI can display the message instead of a 500
            Response.Ok(res, { success: false, error: error.message });
        }
    });

    // Get AI settings (provider config + apiKeySource)
    app.get("/api/ai/settings", acl.hasPermission('ai:configure'), async function(req, res) {
        try {
            var settings = await Settings.getAll();
            var aiSettings = settings.ai || {};
            var provider = (aiSettings.private && aiSettings.private.provider) || {};

            Response.Ok(res, {
                enabled: aiSettings.enabled || false,
                provider: {
                    baseURL: provider.baseURL || 'https://api.openai.com/v1',
                    model: provider.model || 'gpt-4o-mini',
                    hasApiKey: !!(provider.apiKey || process.env.AI_API_KEY),
                    apiKeySource: provider.apiKey ? 'manual' : aiClient.getApiKeySource()
                }
            });
        }
        catch (error) {
            Response.Internal(res, error.message);
        }
    });
};
