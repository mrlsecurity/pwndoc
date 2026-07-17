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
    getVulnerabilityDetail
} = require('../lib/ai-vuln-qa');
const VulnerabilityQaCatalog = require('mongoose').model('VulnerabilityQaCatalog');
const {
    startVulnerabilityQaJob,
    getVulnerabilityQaJobStatus,
    isVulnerabilityQaJobActive,
    cancelVulnerabilityQaJob,
    serializeJob
} = require('../lib/ai-vuln-qa-job');

const DRAFT_VULNERABILITY_ID = '__draft__';

const normalizeDraftVulnerability = (raw) => {
    // Default `{}` here would falsely treat missing body.vulnerability as a draft.
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
    getLatestVulnerabilityQaReport,
    buildVulnerabilityQaReportCache,
    formatVulnerabilityQaReportResponse,
    buildCatalogSliceForVulnerability,
    assembleAllVulnerabilitiesQaReport
} = require('../lib/ai-vuln-qa-cache');
const {
    normalizeQaScope,
    mergeQaIssues,
    emptyQaCounts,
    finalizeMergedQaResult,
    getQaChecksFromSettings,
    hasEnabledQaChecks
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

const resolveProvider = (req, settings) => {
    const provider = normalizeProvider(req.body.provider) ||
        normalizeProvider(settings?.ai?.public?.defaultProvider) ||
        AI_DEFAULT_PROVIDER;

    return AI_PROVIDERS.includes(provider) ? provider : null;
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

        const provider = resolveProvider(req, settings);
        if (!provider) {
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

        const provider = resolveProvider(req, settings);
        if (!provider) {
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

        const vulnerabilityId = String(req.body.vulnerabilityId || '').trim();
        const draftVulnerability = normalizeDraftVulnerability(req.body.vulnerability);

        // Catalog-level findings (duplicates, unlinked translations) involving this
        // vulnerability, served from the stored catalog document — the per-vuln run no
        // longer recomputes catalog checks.
        const buildCatalogSlice = async (targetVulnerabilityId) => {
            const [catalogDoc, vulnerabilities] = await Promise.all([
                VulnerabilityQaCatalog.getByLocale(locale),
                Vulnerability.getAllForQa()
            ]);
            return buildCatalogSliceForVulnerability(catalogDoc, vulnerabilities, locale, targetVulnerabilityId);
        };

        if (req.body.loadOnly) {
            if (vulnerabilityId) {
                const vulnerabilityDoc = await Vulnerability.findById(vulnerabilityId);
                if (!vulnerabilityDoc) {
                    Response.NotFound(res, 'Vulnerability not found');
                    return;
                }
                const vulnerability = typeof vulnerabilityDoc.toObject === 'function' ?
                    vulnerabilityDoc.toObject() : vulnerabilityDoc;

                const report = getLatestVulnerabilityQaReport(vulnerability, locale);
                Response.Ok(res, {
                    ...respondVulnerabilityQaReport(report, { mode: 'single' }),
                    catalog: await buildCatalogSlice(vulnerabilityId)
                });
                return;
            }

            if (draftVulnerability) {
                Response.Ok(res, emptyVulnerabilityQaResponse('single'));
                return;
            }

            const [vulnerabilities, catalogDoc] = await Promise.all([
                Vulnerability.getAllForQa(),
                VulnerabilityQaCatalog.getByLocale(locale)
            ]);
            const report = assembleAllVulnerabilitiesQaReport({
                vulnerabilities: vulnerabilities,
                locale: locale,
                catalogDoc: catalogDoc
            });
            Response.Ok(res, respondVulnerabilityQaReport(report, { mode: 'all' }));
            return;
        }

        const scope = normalizeQaScope(req.body.scope);
        if (!scope) {
            Response.BadParameters(res, 'Missing or invalid scope');
            return;
        }

        const provider = resolveProvider(req, settings);
        if (!provider) {
            Response.BadParameters(res, 'Unsupported provider');
            return;
        }

        if (vulnerabilityId) {
            if (isVulnerabilityQaJobActive(locale)) {
                Response.BadParameters(res, 'A catalog-wide QA run is in progress for this language. Wait for it to finish before rechecking a single template.');
                return;
            }

            const vulnerabilityDoc = await Vulnerability.findById(vulnerabilityId);
            if (!vulnerabilityDoc) {
                Response.NotFound(res, 'Vulnerability not found');
                return;
            }
            const vulnerability = typeof vulnerabilityDoc.toObject === 'function' ?
                vulnerabilityDoc.toObject() : vulnerabilityDoc;

            const partialResult = await runVulnerabilityQa({
                vulnerability: vulnerability,
                locale: locale,
                settings: settings,
                provider: provider,
                scope: scope
            });
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            // Only merge the other scope's previous results when they describe the same
            // content: a stale-fingerprint entry must not contribute issues or timestamps.
            const storedEntry = (vulnerability.qaReports || []).find((entry) => entry?.locale === locale);
            const fingerprintMatches = storedEntry?.fingerprint === fingerprint;
            const existingReport = fingerprintMatches ?
                (getLatestVulnerabilityQaReport(vulnerability, locale) || {}) :
                {};
            const mergedIssues = mergeQaIssues(existingReport.issues || [], partialResult.issues || [], scope);
            const mergedResult = finalizeMergedQaResult(existingReport, partialResult, mergedIssues);
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

            Response.Ok(res, {
                ...respondVulnerabilityQaReport(
                    formatVulnerabilityQaReportResponse(qaReport, { cached: false, outdated: false }),
                    { mode: 'single' }
                ),
                catalog: await buildCatalogSlice(vulnerabilityId)
            });
            return;
        }

        if (draftVulnerability) {
            const detail = getVulnerabilityDetail(draftVulnerability, locale);
            if (!detail) {
                Response.BadParameters(res, 'Draft vulnerability has no content for this language');
                return;
            }

            const result = await runVulnerabilityQa({
                vulnerability: draftVulnerability,
                locale: locale,
                settings: settings,
                provider: provider,
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

        // Catalog-wide runs are handled by the background job endpoints.
        Response.BadParameters(res, 'Catalog-wide QA runs use POST /api/ai/vulnerabilities/qa/run');
    } catch (err) {
        Response.Internal(res, err);
    }
};

const handleVulnerabilityQaRun = (io) => async function(req, res) {
    try {
        const locale = String(req.body.locale || '').trim();
        if (!locale) {
            Response.BadParameters(res, 'Missing required parameter: locale');
            return;
        }

        const settings = await Settings.getAll();
        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const scope = normalizeQaScope(req.body.scope);
        if (!scope) {
            Response.BadParameters(res, 'Missing or invalid scope');
            return;
        }

        const provider = resolveProvider(req, settings);
        if (!provider) {
            Response.BadParameters(res, 'Unsupported provider');
            return;
        }

        if (!hasEnabledQaChecks(getQaChecksFromSettings(settings))) {
            Response.BadParameters(res, 'No QA checks are enabled in organization settings');
            return;
        }

        const { alreadyRunning, job } = startVulnerabilityQaJob({
            locale: locale,
            scope: scope,
            provider: provider,
            settings: settings,
            io: io
        });

        Response.Ok(res, {
            alreadyRunning: alreadyRunning,
            job: serializeJob(job)
        });
    } catch (err) {
        Response.Internal(res, err);
    }
};

const handleVulnerabilityQaStatus = async function(req, res) {
    try {
        const locale = String(req.query.locale || '').trim();
        if (!locale) {
            Response.BadParameters(res, 'Missing required parameter: locale');
            return;
        }

        const settings = await Settings.getAll();
        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const [vulnerabilities, catalogDoc] = await Promise.all([
            Vulnerability.getAllForQa(),
            VulnerabilityQaCatalog.getByLocale(locale)
        ]);
        const report = assembleAllVulnerabilitiesQaReport({
            vulnerabilities: vulnerabilities,
            locale: locale,
            catalogDoc: catalogDoc
        });

        Response.Ok(res, {
            job: getVulnerabilityQaJobStatus(locale),
            report: respondVulnerabilityQaReport(report, { mode: 'all' })
        });
    } catch (err) {
        Response.Internal(res, err);
    }
};

const handleVulnerabilityQaCancel = async function(req, res) {
    try {
        const locale = String(req.body.locale || '').trim();
        if (!locale) {
            Response.BadParameters(res, 'Missing required parameter: locale');
            return;
        }

        const job = cancelVulnerabilityQaJob(locale);
        if (!job) {
            Response.BadParameters(res, 'No QA run in progress for this language');
            return;
        }

        Response.Ok(res, { job: serializeJob(job) });
    } catch (err) {
        Response.Internal(res, err);
    }
};

// Dismiss or restore a single QA issue from the catalog-wide report. Template issues
// (vulnerabilityId present) are stored on the vulnerability and scoped to its current
// content fingerprint; catalog issues are stored on the catalog document and keyed on
// issue identity so "not a duplicate" verdicts survive re-runs.
const handleVulnerabilityQaDismiss = async function(req, res) {
    try {
        const locale = String(req.body.locale || '').trim();
        const key = String(req.body.key || '').trim();
        if (!locale || !key) {
            Response.BadParameters(res, 'Missing required parameters: locale, key');
            return;
        }

        const settings = await Settings.getAll();
        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const dismissed = req.body.dismissed !== false;
        const username = req.decodedToken?.username || '';
        const vulnerabilityId = String(req.body.vulnerabilityId || '').trim();

        if (vulnerabilityId) {
            const vulnerability = await Vulnerability.findById(vulnerabilityId).lean().exec();
            if (!vulnerability) {
                Response.NotFound(res, 'Vulnerability not found');
                return;
            }

            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            if (!fingerprint) {
                Response.BadParameters(res, 'Vulnerability has no content for this language');
                return;
            }

            await Vulnerability.setQaIssueDismissed(vulnerabilityId, locale, key, dismissed, fingerprint, username);
        } else {
            const catalog = await VulnerabilityQaCatalog.setIssueDismissed(locale, key, dismissed, username);
            if (!catalog) {
                Response.BadParameters(res, 'No catalog QA report for this language');
                return;
            }
        }

        Response.Ok(res, { dismissed: dismissed });
    } catch (err) {
        Response.Internal(res, err);
    }
};

// Resolve or unresolve an entire vulnerability's QA from the catalog-wide report. The
// resolution is stored on the vulnerability scoped to its current content fingerprint, so
// editing the template reopens its issues on the next run.
const handleVulnerabilityQaResolve = async function(req, res) {
    try {
        const locale = String(req.body.locale || '').trim();
        const vulnerabilityId = String(req.body.vulnerabilityId || '').trim();
        if (!locale || !vulnerabilityId) {
            Response.BadParameters(res, 'Missing required parameters: locale, vulnerabilityId');
            return;
        }

        const settings = await Settings.getAll();
        if (!settings || settings?.ai?.public?.enabled === false) {
            Response.Forbidden(res, 'AI integration is disabled in organization settings');
            return;
        }

        const vulnerability = await Vulnerability.findById(vulnerabilityId).lean().exec();
        if (!vulnerability) {
            Response.NotFound(res, 'Vulnerability not found');
            return;
        }

        const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
        if (!fingerprint) {
            Response.BadParameters(res, 'Vulnerability has no content for this language');
            return;
        }

        const resolved = req.body.resolved !== false;
        const username = req.decodedToken?.username || '';
        await Vulnerability.setQaResolved(vulnerabilityId, locale, resolved, fingerprint, username);

        Response.Ok(res, { resolved: resolved });
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

module.exports = function(app, io) {
    app.get('/api/ai/enabled-fields', acl.hasPermission('validtoken'), requireAiGeneratePermission, handleAiEnabledFields);
    app.post('/api/ai/generate', acl.hasPermission('validtoken'), requireAiGeneratePermission, handleAiGenerate);
    app.post('/api/ai/qa', acl.hasPermission('audits:ai-qa'), handleAiQa);
    app.post('/api/ai/vulnerabilities/qa', acl.hasPermission('validtoken'), requireVulnerabilityQaPermission, handleVulnerabilityQa);
    app.post('/api/ai/vulnerabilities/qa/run', acl.hasPermission('vulnerabilities:ai-qa-all'), handleVulnerabilityQaRun(io));
    app.get('/api/ai/vulnerabilities/qa/status', acl.hasPermission('vulnerabilities:ai-qa-all'), handleVulnerabilityQaStatus);
    app.post('/api/ai/vulnerabilities/qa/cancel', acl.hasPermission('vulnerabilities:ai-qa-all'), handleVulnerabilityQaCancel);
    app.post('/api/ai/vulnerabilities/qa/dismiss', acl.hasPermission('vulnerabilities:ai-qa-all'), handleVulnerabilityQaDismiss);
    app.post('/api/ai/vulnerabilities/qa/resolve', acl.hasPermission('vulnerabilities:ai-qa-all'), handleVulnerabilityQaResolve);
    app.post('/api/ai/test', acl.hasPermission('settings:update'), handleAiTestConnection);
};
