const Response = require('../lib/httpResponse.js');
const acl = require('../lib/auth').acl;
const Settings = require('mongoose').model('Settings');
const Audit = require('mongoose').model('Audit');
const Vulnerability = require('mongoose').model('Vulnerability');
const CustomField = require('mongoose').model('CustomField');
const AiPrompt = require('mongoose').model('AiPrompt');
const { generateWithProvider, testProviderConnection } = require('../lib/ai-client');
const { MASKED_SECRET } = require('../lib/settings-secrets');
const { runAuditQa } = require('../lib/ai-qa');
const {
    runVulnerabilityQa,
    runAllVulnerabilitiesQa,
    getVulnerabilityDetail
} = require('../lib/ai-vuln-qa');

const DRAFT_VULNERABILITY_ID = '__draft__';

const normalizeDraftVulnerability = (raw = {}) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;

    return {
        ...raw,
        _id: DRAFT_VULNERABILITY_ID
    };
};
const {
    computeAuditQaFingerprint,
    normalizeStoredQaReport,
    getCachedQaReport,
    getOutdatedQaReport,
    buildQaReportCache,
    formatQaReportResponse
} = require('../lib/ai-qa-cache');
const {
    computeVulnerabilityQaFingerprint,
    computeAllVulnerabilitiesQaFingerprint,
    getLatestVulnerabilityQaReport,
    getLatestAllVulnerabilitiesQaReport,
    buildVulnerabilityQaReportCache,
    formatVulnerabilityQaReportResponse
} = require('../lib/ai-vuln-qa-cache');
const {
    normalizeQaScope,
    mergeQaIssues,
    emptyQaCounts,
    finalizeMergedQaResult
} = require('../lib/ai-qa-checks');
const {
    AI_PROVIDERS,
    AI_DEFAULT_PROVIDER,
    normalizePromptValue,
    toPromptCompositeKey,
    buildAiFieldCatalog,
    buildEnabledFieldPrompts
} = require('../lib/ai-prompts');

const ALLOWED_ENTITY_TYPES = ['finding', 'section'];

const normalizeContextValue = (value) => {
    if (value === null || value === undefined)
        return '';
    if (Array.isArray(value))
        return value.join(', ');
    if (typeof value === 'object')
        return JSON.stringify(value);
    return String(value);
};

const renderPromptTemplate = (template = '', context = {}) => {
    const source = String(template || '');
    return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        return normalizeContextValue(context[key]);
    }).trim();
};

const normalizeProvider = (provider) => {
    if (!provider || typeof provider !== 'string')
        return null;
    return provider.toLowerCase().trim();
};

const isAllowedEntityType = (entityType) => {
    return ALLOWED_ENTITY_TYPES.includes(entityType);
};

const handleAiGenerate = async function(req, res) {
    try {
        const entityType = String(req.body.entityType || 'finding').trim().toLowerCase();
        if (!isAllowedEntityType(entityType)) {
            Response.BadParameters(res, 'Unsupported entityType. Allowed entity types: finding, section');
            return;
        }

        const field = String(req.body.field || '').trim();
        if (!field) {
            Response.BadParameters(res, 'Missing required parameter: field');
            return;
        }

        let settings = null;
        try {
            settings = await Settings.getAll();
        } catch (_) {
            settings = null;
        }

        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const customFields = await CustomField.getAll();
        const fieldCatalog = buildAiFieldCatalog(customFields);
        const fieldByCompositeKey = new Map(
            fieldCatalog.map((entry) => [toPromptCompositeKey(entry.entityType, entry.fieldKey), entry])
        );
        const fieldConfig = fieldByCompositeKey.get(toPromptCompositeKey(entityType, field));

        if (!fieldConfig) {
            Response.BadParameters(res, 'Unsupported field for the requested entityType');
            return;
        }

        const promptDoc = await AiPrompt.findOne({
            entityType: fieldConfig.entityType,
            fieldKey: fieldConfig.fieldKey
        }).select('enabled prompt').lean();
        if (promptDoc && promptDoc.enabled === false) {
            Response.Forbidden(res, 'AI generation is disabled for the requested field');
            return;
        }

        const promptTemplate = normalizePromptValue(promptDoc?.prompt) || fieldConfig.defaultPrompt;
        let promptInstruction = renderPromptTemplate(promptTemplate, req.body.context || {});

        const provider = normalizeProvider(req.body.provider) ||
            normalizeProvider(settings?.ai?.public?.defaultProvider) ||
            AI_DEFAULT_PROVIDER;

        if (!AI_PROVIDERS.includes(provider)) {
            Response.BadParameters(res, 'Unsupported provider');
            return;
        }

        const context = req.body.context || {};
        const selectedText = String(context.selectedText || '').trim();
        const userPrompt = String(req.body.userPrompt || '').trim();
        const selectionMode = Boolean(selectedText);

        if (selectionMode && !userPrompt) {
            Response.BadParameters(res, 'Missing required parameter: userPrompt');
            return;
        }

        const chatMessages = req.body.messages || [];

        if (!selectionMode) {
            const promptOverride = String(req.body.promptInstruction || '').trim();
            if (promptOverride)
                promptInstruction = promptOverride;
            else if (userPrompt && chatMessages.length === 0)
                promptInstruction = userPrompt;
        }

        if (!selectionMode && !promptInstruction) {
            Response.BadParameters(res, 'Missing required parameter: userPrompt');
            return;
        }

        const result = await generateWithProvider({
            provider: provider,
            settings: settings,
            outputType: fieldConfig.outputType,
            context: context,
            promptInstruction: promptInstruction,
            userPrompt: userPrompt,
            messages: chatMessages
        });

        Response.Ok(res, {
            entityType: fieldConfig.entityType,
            field: field,
            outputType: fieldConfig.outputType,
            draft: result.draft,
            reply: result.reply || '',
            provider: provider,
            model: result.model
        });
    } catch (err) {
        Response.Internal(res, err);
    }
};

const emptyAuditQaResponse = () => ({
    summary: '',
    issues: [],
    aiAnalysis: false,
    provider: null,
    model: null,
    counts: emptyQaCounts(),
    cached: false,
    outdated: false,
    ranAt: null,
    programmaticRanAt: null,
    aiRanAt: null,
    hasReport: false
});

const handleAiQa = async function(req, res) {
    try {
        const auditId = String(req.body.auditId || '').trim();
        if (!auditId) {
            Response.BadParameters(res, 'Missing required parameter: auditId');
            return;
        }

        let settings = null;
        try {
            settings = await Settings.getAll();
        } catch (_) {
            settings = null;
        }

        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const audit = await Audit.getAudit(
            acl.isAllowed(req.decodedToken.roles, 'audits:read-all'),
            auditId,
            req.decodedToken.id
        );

        const auditObject = typeof audit.toObject === 'function' ? audit.toObject() : audit;

        if (req.body.loadOnly) {
            const report = getCachedQaReport(auditObject) || getOutdatedQaReport(auditObject);
            Response.Ok(res, {
                auditId: auditId,
                hasReport: Boolean(report),
                ...(report || emptyAuditQaResponse())
            });
            return;
        }

        const scope = normalizeQaScope(req.body.scope);
        if (!scope) {
            Response.BadParameters(res, 'Missing or invalid scope');
            return;
        }

        const provider = normalizeProvider(req.body.provider) ||
            normalizeProvider(settings?.ai?.public?.defaultProvider) ||
            AI_DEFAULT_PROVIDER;

        if (!AI_PROVIDERS.includes(provider)) {
            Response.BadParameters(res, 'Unsupported provider');
            return;
        }

        const existingStored = normalizeStoredQaReport(auditObject) || {};
        const partialResult = await runAuditQa({
            audit: auditObject,
            settings: settings,
            provider: provider,
            scope: scope
        });
        const mergedIssues = mergeQaIssues(existingStored.issues || [], partialResult.issues || [], scope);
        const mergedResult = finalizeMergedQaResult(existingStored, partialResult, mergedIssues);
        const fingerprint = computeAuditQaFingerprint(auditObject);
        const qaReport = buildQaReportCache(fingerprint, mergedResult, {
            existing: existingStored,
            scope: scope
        });
        await Audit.saveLatestQaReport(auditId, qaReport);

        Response.Ok(res, {
            auditId: auditId,
            hasReport: true,
            ...formatQaReportResponse(qaReport, {
                cached: false,
                outdated: false
            })
        });
    } catch (err) {
        Response.Internal(res, err);
    }
};

const emptyVulnerabilityQaResponse = (mode = 'single') => ({
    summary: '',
    issues: [],
    aiAnalysis: false,
    provider: null,
    model: null,
    counts: emptyQaCounts(),
    cached: false,
    outdated: false,
    ranAt: null,
    programmaticRanAt: null,
    aiRanAt: null,
    hasReport: false,
    mode: mode,
    locale: '',
    vulnerabilityId: null,
    title: '',
    vulnerabilityCount: 0
});

const respondVulnerabilityQaReport = (report, options = {}) => (
    report ? { hasReport: true, ...report } : emptyVulnerabilityQaResponse(options.mode || 'single')
);

const handleVulnerabilityQa = async function(req, res) {
    try {
        const locale = String(req.body.locale || '').trim();
        if (!locale) {
            Response.BadParameters(res, 'Missing required parameter: locale');
            return;
        }

        let settings = null;
        try {
            settings = await Settings.getAll();
        } catch (_) {
            settings = null;
        }

        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const allVulnerabilities = await Vulnerability.getAll();
        const vulnerabilityId = String(req.body.vulnerabilityId || '').trim();
        const vulnerabilityObjects = allVulnerabilities.map((entry) => {
            return typeof entry.toObject === 'function' ? entry.toObject() : entry;
        });
        const settingsObject = typeof settings.toObject === 'function' ? settings.toObject() : settings;
        const draftVulnerability = normalizeDraftVulnerability(req.body.vulnerability);
        const mode = vulnerabilityId || draftVulnerability ? 'single' : 'all';

        if (req.body.loadOnly) {
            if (vulnerabilityId) {
                const vulnerability = vulnerabilityObjects.find((entry) => String(entry._id) === vulnerabilityId);
                if (!vulnerability) {
                    Response.NotFound(res, 'Vulnerability not found');
                    return;
                }

                const report = getLatestVulnerabilityQaReport(vulnerability, locale);
                Response.Ok(res, respondVulnerabilityQaReport(report, { mode: 'single' }));
                return;
            }

            if (draftVulnerability) {
                Response.Ok(res, emptyVulnerabilityQaResponse('single'));
                return;
            }

            const report = getLatestAllVulnerabilitiesQaReport(settingsObject, vulnerabilityObjects, locale);
            Response.Ok(res, respondVulnerabilityQaReport(report, { mode: 'all' }));
            return;
        }

        const scope = normalizeQaScope(req.body.scope);
        if (!scope) {
            Response.BadParameters(res, 'Missing or invalid scope');
            return;
        }

        const provider = normalizeProvider(req.body.provider) ||
            normalizeProvider(settings?.ai?.public?.defaultProvider) ||
            AI_DEFAULT_PROVIDER;

        if (!AI_PROVIDERS.includes(provider)) {
            Response.BadParameters(res, 'Unsupported provider');
            return;
        }

        if (vulnerabilityId) {
            const vulnerability = vulnerabilityObjects.find((entry) => String(entry._id) === vulnerabilityId);
            if (!vulnerability) {
                Response.NotFound(res, 'Vulnerability not found');
                return;
            }

            const existingReport = getLatestVulnerabilityQaReport(vulnerability, locale) || {};
            const partialResult = await runVulnerabilityQa({
                vulnerability: vulnerability,
                locale: locale,
                settings: settings,
                provider: provider,
                allVulnerabilities: vulnerabilityObjects,
                scope: scope
            });
            const mergedIssues = mergeQaIssues(existingReport.issues || [], partialResult.issues || [], scope);
            const mergedResult = finalizeMergedQaResult(existingReport, partialResult, mergedIssues);
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const qaReport = buildVulnerabilityQaReportCache(fingerprint, mergedResult, {
                locale: locale,
                mode: 'single',
                vulnerabilityId: partialResult.vulnerabilityId,
                title: partialResult.title
            }, {
                existing: existingReport,
                scope: scope
            });
            await Vulnerability.saveQaReportForLocale(vulnerabilityId, locale, qaReport);

            Response.Ok(res, respondVulnerabilityQaReport(
                formatVulnerabilityQaReportResponse(qaReport, { cached: false, outdated: false }),
                { mode: 'single' }
            ));
            return;
        }

        if (draftVulnerability) {
            const detail = getVulnerabilityDetail(draftVulnerability, locale);
            if (!detail) {
                Response.BadParameters(res, 'Draft vulnerability has no content for this language');
                return;
            }

            const comparisons = vulnerabilityObjects.filter((entry) => {
                return String(entry._id || entry.id || '') !== DRAFT_VULNERABILITY_ID;
            });

            const result = await runVulnerabilityQa({
                vulnerability: draftVulnerability,
                locale: locale,
                settings: settings,
                provider: provider,
                allVulnerabilities: [...comparisons, draftVulnerability],
                scope: scope
            });

            Response.Ok(res, respondVulnerabilityQaReport(
                formatVulnerabilityQaReportResponse(
                    buildVulnerabilityQaReportCache(
                        computeVulnerabilityQaFingerprint(draftVulnerability, locale),
                        result,
                        {
                            locale: locale,
                            mode: 'single',
                            vulnerabilityId: null,
                            title: result.title
                        },
                        { scope: scope }
                    ),
                    { cached: false, outdated: false }
                ),
                { mode: 'single' }
            ));
            return;
        }

        const existingReport = getLatestAllVulnerabilitiesQaReport(
            settingsObject,
            vulnerabilityObjects,
            locale
        ) || {};
        const partialResult = await runAllVulnerabilitiesQa({
            vulnerabilities: vulnerabilityObjects,
            locale: locale,
            settings: settings,
            provider: provider,
            scope: scope
        });
        const mergedIssues = mergeQaIssues(existingReport.issues || [], partialResult.issues || [], scope);
        const mergedResult = finalizeMergedQaResult(existingReport, partialResult, mergedIssues);
        const fingerprint = computeAllVulnerabilitiesQaFingerprint(vulnerabilityObjects, locale);
        const qaReport = buildVulnerabilityQaReportCache(fingerprint, mergedResult, {
            locale: locale,
            mode: 'all',
            vulnerabilityCount: partialResult.vulnerabilityCount || 0
        }, {
            existing: existingReport,
            scope: scope
        });
        await Settings.saveVulnerabilityQaReportForLocale(locale, qaReport);

        Response.Ok(res, respondVulnerabilityQaReport(
            formatVulnerabilityQaReportResponse(qaReport, { cached: false, outdated: false }),
            { mode: 'all' }
        ));
    } catch (err) {
        Response.Internal(res, err);
    }
};

const handleAiEnabledFields = async (req, res) => {
    try {
        const entityType = String(req.query.entityType || '').trim().toLowerCase();
        if (!isAllowedEntityType(entityType)) {
            Response.BadParameters(res, 'Unsupported entityType. Allowed entity types: finding, section');
            return;
        }

        const settings = await Settings.getAll();
        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Ok(res, { fields: [] });
            return;
        }

        const customFields = await CustomField.getAll();
        const fieldCatalog = buildAiFieldCatalog(customFields);
        const promptRows = await AiPrompt.find({}).select('entityType fieldKey enabled prompt').lean();
        const fields = buildEnabledFieldPrompts(fieldCatalog, promptRows, entityType);

        Response.Ok(res, { fields });
    } catch (err) {
        Response.Internal(res, err);
    }
};

const AI_TEST_OVERRIDE_FIELDS = {
    openai: ['openaiApiKey', 'openaiBaseUrl', 'openaiModel'],
    anthropic: ['anthropicApiKey', 'anthropicBaseUrl', 'anthropicModel', 'anthropicVersion'],
    deepseek: ['deepseekApiKey', 'deepseekBaseUrl', 'deepseekModel'],
    ollama: ['ollamaApiKey', 'ollamaBaseUrl', 'ollamaModel'],
    bedrock: [
        'bedrockApiKey',
        'bedrockAccessKeyId',
        'bedrockSecretAccessKey',
        'bedrockSessionToken',
        'bedrockRegion',
        'bedrockModel'
    ]
};

const buildAiTestOverrides = (provider, body = {}) => {
    const fields = AI_TEST_OVERRIDE_FIELDS[provider] || [];
    const overrides = {};

    fields.forEach((field) => {
        const value = body[field];
        if (value === undefined || value === null || value === MASKED_SECRET)
            return;
        overrides[field] = value;
    });

    return overrides;
};

const handleAiTestConnection = async function(req, res) {
    try {
        const provider = normalizeProvider(req.body.provider);
        if (!provider || !AI_PROVIDERS.includes(provider)) {
            Response.BadParameters(res, 'Unsupported provider');
            return;
        }

        const settings = await Settings.getAll();
        const settingsObject = typeof settings.toObject === 'function' ? settings.toObject() : settings;
        const overrides = buildAiTestOverrides(provider, req.body);
        const testSettings = {
            ...settingsObject,
            ai: {
                ...settingsObject.ai,
                private: {
                    ...settingsObject.ai?.private,
                    ...overrides
                }
            }
        };

        const result = await testProviderConnection(provider, testSettings);
        Response.Ok(res, result);
    } catch (err) {
        Response.Internal(res, err);
    }
};

const requireAiGeneratePermission = function(req, res, next) {
    if (acl.isAllowedToken(req.decodedToken, 'audits:ai-generate') ||
        acl.isAllowedToken(req.decodedToken, 'vulnerabilities:ai-generate'))
        return next();

    Response.Forbidden(res, 'Insufficient privileges');
};

const requireVulnerabilityQaPermission = function(req, res, next) {
    const vulnerabilityId = String(req.body?.vulnerabilityId || '').trim();
    const draftVulnerability = req.body?.vulnerability;
    const hasDraft = draftVulnerability &&
        typeof draftVulnerability === 'object' &&
        !Array.isArray(draftVulnerability);
    const permission = (vulnerabilityId || hasDraft) ? 'vulnerabilities:ai-qa' : 'vulnerabilities:ai-qa-all';

    if (acl.isAllowedToken(req.decodedToken, permission))
        return next();

    Response.Forbidden(res, 'Insufficient privileges');
};

module.exports = function(app) {
    app.get('/api/ai/enabled-fields', acl.hasPermission('validtoken'), requireAiGeneratePermission, handleAiEnabledFields);
    app.post('/api/ai/generate', acl.hasPermission('validtoken'), requireAiGeneratePermission, handleAiGenerate);
    app.post('/api/ai/qa', acl.hasPermission('audits:ai-qa'), handleAiQa);
    app.post('/api/ai/vulnerabilities/qa', acl.hasPermission('validtoken'), requireVulnerabilityQaPermission, handleVulnerabilityQa);
    app.post('/api/ai/test', acl.hasPermission('settings:update'), handleAiTestConnection);
};
