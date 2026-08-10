const crypto = require('crypto');
const {
    buildQaReportCache,
    formatQaReportResponse,
    resolveQaRunTimestamps
} = require('./ai-qa-cache');
const {
    buildVulnerabilitySnapshot,
    getVulnerabilityDetail,
    buildQaTargets,
    dedupeIssues,
    sortIssues
} = require('./ai-vuln-qa');
const {
    buildIssueCounts,
    buildIssueSummary
} = require('./ai-qa-checks');

// Custom-field definitions are populated for QA so the model and issue locations can
// use their real labels. Population is a read-time representation change, though, and
// must not make an otherwise unchanged vulnerability look edited. Build fingerprints
// from the same content-only custom-field shape used before population was introduced.
const buildVulnerabilityFingerprintSnapshot = (vulnerability = {}, detail = {}) => {
    const fingerprintDetail = {
        ...detail,
        customFields: (Array.isArray(detail.customFields) ? detail.customFields : [])
            .map((field) => ({ text: field?.text }))
    };
    return buildVulnerabilitySnapshot(vulnerability, fingerprintDetail);
};

const computeVulnerabilityQaFingerprint = (vulnerability = {}, locale = '') => {
    const detail = getVulnerabilityDetail(vulnerability, locale);
    if (!detail)
        return '';

    const snapshot = buildVulnerabilityFingerprintSnapshot(vulnerability, detail);
    return crypto
        .createHash('sha256')
        .update(JSON.stringify({ locale: String(locale || '').trim(), snapshot }))
        .digest('hex');
};

const computeAllVulnerabilitiesQaFingerprint = (vulnerabilities = [], locale = '') => {
    const snapshots = vulnerabilities
        .map((vulnerability) => {
            const detail = getVulnerabilityDetail(vulnerability, locale);
            if (!detail)
                return null;

            return {
                id: String(vulnerability._id || vulnerability.id || ''),
                snapshot: buildVulnerabilityFingerprintSnapshot(vulnerability, detail)
            };
        })
        .filter(Boolean)
        .sort((left, right) => left.id.localeCompare(right.id));

    return crypto
        .createHash('sha256')
        .update(JSON.stringify({ locale: String(locale || '').trim(), snapshots }))
        .digest('hex');
};

// Catalog checks (duplicates, AI duplicates, unlinked translations) compare templates
// against each other, and unlinked-translation detection additionally depends on titles
// in OTHER locales (a rename in fr can change what en should flag). The catalog
// fingerprint therefore covers the target-locale snapshots plus every record's
// cross-locale title list.
const computeVulnerabilityQaCatalogFingerprint = (vulnerabilities = [], locale = '') => {
    const crossLocaleTitles = vulnerabilities
        .map((vulnerability) => ({
            id: String(vulnerability._id || vulnerability.id || ''),
            titles: (vulnerability.details || [])
                .filter((detail) => detail?.locale && String(detail.title || '').trim())
                .map((detail) => ({
                    locale: String(detail.locale).trim(),
                    title: String(detail.title).trim()
                }))
                .sort((left, right) => left.locale.localeCompare(right.locale))
        }))
        .filter((entry) => entry.titles.length)
        .sort((left, right) => left.id.localeCompare(right.id));

    return crypto
        .createHash('sha256')
        .update(JSON.stringify({
            locale: String(locale || '').trim(),
            allFingerprint: computeAllVulnerabilitiesQaFingerprint(vulnerabilities, locale),
            crossLocaleTitles
        }))
        .digest('hex');
};

// Stable identity of a QA issue across runs: what was flagged and where, but not the
// (AI-worded, run-dependent) message. Catalog issues include the involved template ids
// so each duplicate/translation pair keeps its own key.
const computeQaIssueKey = (issue = {}) => {
    const ids = Array.isArray(issue.vulnerabilityIds)
        ? issue.vulnerabilityIds.map(String).sort()
        : [];
    return [
        String(issue.category || ''),
        String(issue.title || ''),
        String(issue.location || ''),
        ids.join(',')
    ].join('|');
};

const normalizeLocaleQaReport = (reports = [], locale = '') => {
    if (!Array.isArray(reports))
        return null;

    return reports.find((report) => report?.locale === locale) || null;
};

const formatVulnerabilityQaReportResponse = (stored = {}, options = {}) => {
    const base = formatQaReportResponse(stored, options);
    if (!base)
        return null;

    return {
        ...base,
        mode: stored.mode || 'single',
        locale: stored.locale || '',
        vulnerabilityId: stored.vulnerabilityId || null,
        title: stored.title || '',
        vulnerabilityCount: stored.vulnerabilityCount || 0
    };
};

const isVulnerabilityQaReportCurrent = (vulnerability = {}, locale = '') => {
    const stored = normalizeLocaleQaReport(vulnerability.qaReports, locale);
    if (!stored?.fingerprint)
        return false;

    return stored.fingerprint === computeVulnerabilityQaFingerprint(vulnerability, locale);
};

const getCachedVulnerabilityQaReport = (vulnerability = {}, locale = '') => {
    if (!isVulnerabilityQaReportCurrent(vulnerability, locale))
        return null;

    const stored = normalizeLocaleQaReport(vulnerability.qaReports, locale);
    if (!stored)
        return null;

    return formatVulnerabilityQaReportResponse(stored, {
        cached: true,
        outdated: false
    });
};

const getLatestVulnerabilityQaReport = (vulnerability = {}, locale = '') => {
    const stored = normalizeLocaleQaReport(vulnerability.qaReports, locale);
    if (!stored)
        return null;

    return formatVulnerabilityQaReportResponse(stored, {
        cached: true,
        outdated: !isVulnerabilityQaReportCurrent(vulnerability, locale)
    });
};

const buildVulnerabilityQaReportCache = (fingerprint, result = {}, meta = {}, options = {}) => {
    return {
        ...buildQaReportCache(fingerprint, result, options),
        locale: String(meta.locale || '').trim(),
        mode: meta.mode || 'single',
        vulnerabilityId: meta.vulnerabilityId || null,
        title: meta.title || '',
        vulnerabilityCount: meta.vulnerabilityCount || 0
    };
};

// A stored report satisfies the requested scope when its fingerprint matches the
// current content AND the scope's run timestamps exist (an 'all' request can only
// reuse an entry that has both a programmatic and an AI pass recorded).
const isStoredReportCurrentForScope = (stored = null, fingerprint = '', scope = 'all') => {
    if (!stored?.fingerprint || !fingerprint || stored.fingerprint !== fingerprint)
        return false;

    const timestamps = resolveQaRunTimestamps(stored);
    if (scope === 'programmatic')
        return Boolean(timestamps.programmaticRanAt);
    if (scope === 'ai')
        return Boolean(timestamps.aiRanAt);
    return Boolean(timestamps.programmaticRanAt && timestamps.aiRanAt);
};

const hasStoredRun = (stored = null) => {
    if (!stored)
        return false;
    const timestamps = resolveQaRunTimestamps(stored);
    return Boolean(timestamps.ranAt || timestamps.programmaticRanAt || timestamps.aiRanAt);
};

const getCatalogIssuesForVulnerability = (catalogDoc = null, vulnerabilityId = '') => {
    const id = String(vulnerabilityId || '').trim();
    if (!catalogDoc || !Array.isArray(catalogDoc.issues) || !id)
        return [];

    return catalogDoc.issues.filter((issue) => {
        return Array.isArray(issue.vulnerabilityIds) &&
            issue.vulnerabilityIds.some((entry) => String(entry) === id);
    });
};

// Catalog slice returned alongside single-vulnerability QA responses so the per-vuln
// panel surfaces duplicates/translations without recomputing catalog checks.
const buildCatalogSliceForVulnerability = (catalogDoc, vulnerabilities = [], locale = '', vulnerabilityId = '') => {
    if (!hasStoredRun(catalogDoc))
        return null;

    const timestamps = resolveQaRunTimestamps(catalogDoc);
    return {
        issues: getCatalogIssuesForVulnerability(catalogDoc, vulnerabilityId),
        ranAt: timestamps.ranAt,
        programmaticRanAt: timestamps.programmaticRanAt,
        aiRanAt: timestamps.aiRanAt,
        outdated: catalogDoc.fingerprint !== computeVulnerabilityQaCatalogFingerprint(vulnerabilities, locale)
    };
};

const maxDate = (...values) => {
    const times = values
        .map((value) => (value ? new Date(value).getTime() : 0))
        .filter((time) => Number.isFinite(time) && time > 0);
    return times.length ? new Date(Math.max(...times)) : null;
};

// Read-time assembly of the "QA all" report: per-template rows from each
// Vulnerability.qaReports entry plus the catalog document. Nothing merged is persisted.
const assembleAllVulnerabilitiesQaReport = ({ vulnerabilities = [], locale = '', catalogDoc = null }) => {
    const targets = buildQaTargets(vulnerabilities, locale);

    const templates = targets.map(({ vulnerability, detail }) => {
        const stored = normalizeLocaleQaReport(vulnerability.qaReports, locale);
        const hasReport = hasStoredRun(stored);
        const timestamps = hasReport ? resolveQaRunTimestamps(stored) : {};
        const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
        // Dismissals only apply while the content they were recorded against is
        // unchanged: an edit invalidates them so re-runs resurface every issue.
        const dismissedKeys = new Set(
            (Array.isArray(vulnerability.qaDismissals) ? vulnerability.qaDismissals : [])
                .filter((entry) => entry?.locale === locale && entry.fingerprint === fingerprint)
                .map((entry) => entry.key)
        );
        // A whole-vulnerability resolution (recorded against the current fingerprint)
        // marks every one of its issues resolved/hidden at once.
        const resolved = (Array.isArray(vulnerability.qaResolutions) ? vulnerability.qaResolutions : [])
            .some((entry) => entry?.locale === locale && entry.fingerprint === fingerprint);
        const issues = hasReport && Array.isArray(stored.issues)
            ? stored.issues.map((issue) => {
                const key = computeQaIssueKey(issue);
                return { ...issue, key: key, dismissed: resolved || dismissedKeys.has(key) };
            })
            : [];

        return {
            vulnerabilityId: String(vulnerability._id || vulnerability.id || ''),
            title: String(detail.title || '').trim(),
            category: String(vulnerability.category || '').trim(),
            hasReport: hasReport,
            issues: issues,
            resolved: resolved,
            outdated: hasReport && stored.fingerprint !== fingerprint,
            ranAt: timestamps.ranAt || null,
            programmaticRanAt: timestamps.programmaticRanAt || null,
            aiRanAt: timestamps.aiRanAt || null,
            aiAnalysis: Boolean(stored?.aiAnalysis)
        };
    });

    const catalogHasReport = hasStoredRun(catalogDoc);
    const catalogTimestamps = catalogHasReport ? resolveQaRunTimestamps(catalogDoc) : {};
    // Catalog dismissals are keyed on the issue identity (category + involved template
    // ids), not a fingerprint: "not a duplicate" verdicts survive unrelated edits.
    const catalogDismissedKeys = new Set(
        (Array.isArray(catalogDoc?.dismissals) ? catalogDoc.dismissals : []).map((entry) => entry.key)
    );
    const catalog = catalogHasReport ? {
        issues: (Array.isArray(catalogDoc.issues) ? catalogDoc.issues : []).map((issue) => {
            const key = computeQaIssueKey(issue);
            return { ...issue, key: key, dismissed: catalogDismissedKeys.has(key) };
        }),
        ranAt: catalogTimestamps.ranAt || null,
        programmaticRanAt: catalogTimestamps.programmaticRanAt || null,
        aiRanAt: catalogTimestamps.aiRanAt || null,
        outdated: catalogDoc.fingerprint !== computeVulnerabilityQaCatalogFingerprint(vulnerabilities, locale),
        aiAnalysis: Boolean(catalogDoc.aiAnalysis),
        provider: catalogDoc.provider || null,
        model: catalogDoc.model || null
    } : null;

    const checkedCount = templates.filter((row) => row.hasReport).length;
    const hasReport = checkedCount > 0 || Boolean(catalog);
    if (!hasReport)
        return null;

    const issues = sortIssues(dedupeIssues([
        ...templates.flatMap((row) => row.issues),
        ...(catalog ? catalog.issues : [])
    ]));
    const activeIssues = issues.filter((issue) => !issue.dismissed);

    return {
        hasReport: true,
        mode: 'all',
        locale: String(locale || '').trim(),
        vulnerabilityCount: templates.length,
        checkedCount: checkedCount,
        issues: issues,
        counts: buildIssueCounts(activeIssues),
        dismissedCount: issues.length - activeIssues.length,
        summary: buildIssueSummary(activeIssues, {
            emptyFallback: `No issues were flagged across ${templates.length} vulnerability templates.`
        }),
        cached: true,
        outdated: Boolean(
            (catalog && catalog.outdated) ||
            templates.some((row) => row.outdated) ||
            (checkedCount > 0 && checkedCount < templates.length)
        ),
        ranAt: maxDate(...templates.map((row) => row.ranAt), catalog?.ranAt),
        programmaticRanAt: maxDate(...templates.map((row) => row.programmaticRanAt), catalog?.programmaticRanAt),
        aiRanAt: maxDate(...templates.map((row) => row.aiRanAt), catalog?.aiRanAt),
        aiAnalysis: templates.some((row) => row.aiAnalysis) || Boolean(catalog?.aiAnalysis),
        provider: catalog?.provider || null,
        model: catalog?.model || null,
        templates: templates,
        catalog: catalog
    };
};

module.exports = {
    computeQaIssueKey,
    computeVulnerabilityQaFingerprint,
    computeAllVulnerabilitiesQaFingerprint,
    computeVulnerabilityQaCatalogFingerprint,
    normalizeLocaleQaReport,
    getCachedVulnerabilityQaReport,
    getLatestVulnerabilityQaReport,
    buildVulnerabilityQaReportCache,
    formatVulnerabilityQaReportResponse,
    isStoredReportCurrentForScope,
    hasStoredRun,
    getCatalogIssuesForVulnerability,
    buildCatalogSliceForVulnerability,
    assembleAllVulnerabilitiesQaReport
};
