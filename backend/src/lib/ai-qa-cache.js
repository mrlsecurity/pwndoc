const crypto = require('crypto');
const { buildAuditSnapshot } = require('./ai-qa');
const { isAiQaIssue } = require('./ai-qa-checks');

const computeAuditQaFingerprint = (audit = {}) => {
    const snapshot = buildAuditSnapshot(audit);
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex');
};

const normalizeStoredQaReport = (audit = {}) => {
    const raw = audit.qaReport;
    if (!raw)
        return null;

    if (Array.isArray(raw))
        return raw.length ? raw[raw.length - 1] : null;

    return raw;
};

const seedLegacyRunTimestamps = (stored = {}) => {
    const legacy = stored.ranAt || null;
    const issues = Array.isArray(stored.issues) ? stored.issues : [];

    return {
        programmaticRanAt: stored.programmaticRanAt ||
            (issues.some((issue) => !isAiQaIssue(issue)) ? legacy : null),
        aiRanAt: stored.aiRanAt ||
            (issues.some(isAiQaIssue) ? legacy : null)
    };
};

const resolveQaRunTimestamps = (stored = {}) => {
    const seeded = seedLegacyRunTimestamps(stored);

    return {
        ranAt: stored.ranAt || seeded.programmaticRanAt || seeded.aiRanAt || null,
        programmaticRanAt: seeded.programmaticRanAt,
        aiRanAt: seeded.aiRanAt
    };
};

const hasStoredQaRun = (stored = {}) => {
    const timestamps = resolveQaRunTimestamps(stored);
    return Boolean(timestamps.ranAt || timestamps.programmaticRanAt || timestamps.aiRanAt);
};

const formatQaReportResponse = (stored = {}, options = {}) => {
    if (!stored?.fingerprint || !hasStoredQaRun(stored))
        return null;

    const timestamps = resolveQaRunTimestamps(stored);

    return {
        summary: String(stored.summary || ''),
        issues: Array.isArray(stored.issues) ? stored.issues : [],
        aiAnalysis: Boolean(stored.aiAnalysis),
        provider: stored.provider || null,
        model: stored.model || null,
        counts: stored.counts || {
            total: 0,
            error: 0,
            warning: 0,
            info: 0
        },
        cached: Boolean(options.cached),
        outdated: Boolean(options.outdated),
        ranAt: timestamps.ranAt,
        programmaticRanAt: timestamps.programmaticRanAt,
        aiRanAt: timestamps.aiRanAt
    };
};

const getLatestQaReport = (audit = {}) => {
    const stored = normalizeStoredQaReport(audit);
    if (!stored)
        return null;

    return formatQaReportResponse(stored, {
        cached: false,
        outdated: false
    });
};

const isQaReportCurrent = (audit = {}) => {
    const stored = normalizeStoredQaReport(audit);
    if (!stored?.fingerprint)
        return false;

    return stored.fingerprint === computeAuditQaFingerprint(audit);
};

const getCachedQaReport = (audit = {}) => {
    if (!isQaReportCurrent(audit))
        return null;

    const stored = normalizeStoredQaReport(audit);
    if (!stored)
        return null;

    return formatQaReportResponse(stored, {
        cached: true,
        outdated: false
    });
};

const getOutdatedQaReport = (audit = {}) => {
    if (isQaReportCurrent(audit))
        return null;

    const stored = normalizeStoredQaReport(audit);
    if (!stored)
        return null;

    return formatQaReportResponse(stored, {
        cached: true,
        outdated: true
    });
};

const buildQaReportCache = (fingerprint, result = {}, options = {}) => {
    const existing = options.existing || {};
    const scope = options.scope || 'all';
    const seeded = seedLegacyRunTimestamps(existing);
    const existingTimes = [existing.ranAt, seeded.programmaticRanAt, seeded.aiRanAt]
        .map((value) => value ? new Date(value).getTime() : 0)
        .filter(Number.isFinite);
    const latestExistingTime = existingTimes.length ? Math.max(...existingTimes) : 0;
    const now = new Date(Math.max(Date.now(), latestExistingTime + 1));

    let programmaticRanAt = seeded.programmaticRanAt;
    let aiRanAt = seeded.aiRanAt;

    if (scope === 'all' || scope === 'programmatic')
        programmaticRanAt = now;
    if (scope === 'all' || scope === 'ai')
        aiRanAt = now;

    return {
        fingerprint: fingerprint,
        ranAt: now,
        programmaticRanAt: programmaticRanAt || null,
        aiRanAt: aiRanAt || null,
        summary: String(result.summary || ''),
        issues: Array.isArray(result.issues) ? result.issues : [],
        aiAnalysis: Boolean(result.aiAnalysis),
        provider: result.provider || null,
        model: result.model || null,
        counts: result.counts || {
            total: 0,
            error: 0,
            warning: 0,
            info: 0
        }
    };
};

module.exports = {
    computeAuditQaFingerprint,
    normalizeStoredQaReport,
    resolveQaRunTimestamps,
    getLatestQaReport,
    isQaReportCurrent,
    getCachedQaReport,
    getOutdatedQaReport,
    buildQaReportCache,
    formatQaReportResponse
};
