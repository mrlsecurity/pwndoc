const { runVulnerabilityUnlinkedTranslationQaWithProvider } = require('./ai-client');
const { stripHtml, normalizeIssue, chunkWithOverlap } = require('./ai-qa-shared');
const { AI_DEFAULT_PROVIDER } = require('./ai-prompts');
const {
    formatVulnerabilityLocation,
    buildDuplicatePairKey
} = require('./ai-vuln-qa');

const AI_TRANSLATION_SEVERITIES = ['error', 'warning', 'info'];
const FIELD_SLICE_LENGTH = 2500;
// Keeps a single request's template catalog within provider context limits on large libraries.
const AI_TRANSLATION_BATCH_SIZE = 40;
const AI_TRANSLATION_BATCH_OVERLAP = 5;

const pushIssue = (issues, issue, source = 'ai') => {
    const normalized = normalizeIssue({
        ...issue,
        category: 'aiUnlinkedTranslations'
    }, source);
    if (!normalized.title || !normalized.message)
        return;
    issues.push(normalized);
};

const getLocalesWithTitle = (vulnerability = {}) => {
    return (vulnerability.details || [])
        .filter((detail) => detail?.locale && String(detail.title || '').trim())
        .map((detail) => String(detail.locale).trim());
};

const isSingleLocaleRecord = (vulnerability = {}) => {
    return getLocalesWithTitle(vulnerability).length === 1;
};

const buildTranslationCatalogEntry = (vulnerability = {}, detail = {}) => {
    return {
        vulnerabilityId: String(vulnerability._id || vulnerability.id || ''),
        locale: String(detail.locale || '').trim(),
        title: String(detail.title || '').trim(),
        vulnType: String(detail.vulnType || '').trim(),
        category: String(vulnerability.category || '').trim(),
        description: stripHtml(detail.description).slice(0, FIELD_SLICE_LENGTH),
        observation: stripHtml(detail.observation).slice(0, FIELD_SLICE_LENGTH),
        remediation: stripHtml(detail.remediation).slice(0, FIELD_SLICE_LENGTH),
        localesInRecord: getLocalesWithTitle(vulnerability)
    };
};

const buildUnlinkedTranslationCatalog = (vulnerabilities = []) => {
    const entries = [];

    vulnerabilities.forEach((vulnerability) => {
        if (!isSingleLocaleRecord(vulnerability))
            return;

        const detail = (vulnerability.details || []).find((entry) => {
            return entry?.locale && String(entry.title || '').trim();
        });
        if (!detail)
            return;

        entries.push(buildTranslationCatalogEntry(vulnerability, detail));
    });

    return entries;
};

const hasMultipleLocales = (catalog = []) => {
    return new Set(catalog.map((entry) => entry.locale).filter(Boolean)).size > 1;
};

const normalizeAiUnlinkedTranslationIssues = (issues = [], {
    targetVulnerabilityId = null,
    catalogById = new Map()
} = {}) => {
    const reportedPairs = new Set();
    const normalizedIssues = [];

    issues.forEach((issue) => {
        const severity = AI_TRANSLATION_SEVERITIES.includes(issue.severity) ? issue.severity : 'warning';
        const message = String(issue.message || '').trim();
        const title = String(issue.title || 'Unlinked translation').trim();
        const location = formatVulnerabilityLocation(issue.templateTitle || issue.location || '');

        let focalId = String(issue.vulnerabilityId || '').trim();
        let focalTitle = String(issue.templateTitle || '').trim();
        let focalLocale = String(issue.locale || '').trim();

        const focalEntry = focalId ? catalogById.get(focalId) : null;
        if (focalEntry) {
            focalTitle = focalEntry.title;
            focalLocale = focalEntry.locale;
        }

        const relatedEntries = Array.isArray(issue.relatedTemplates) ? issue.relatedTemplates :
            (Array.isArray(issue.relatedTitles) ? issue.relatedTitles.map((entry) => {
                if (typeof entry === 'string')
                    return { title: entry };
                return entry;
            }) : []);

        if (!relatedEntries.length) {
            if (!message)
                return;

            if (targetVulnerabilityId && focalId && focalId !== String(targetVulnerabilityId))
                return;

            pushIssue(normalizedIssues, {
                severity: severity,
                title: title,
                message: message,
                location: location || formatVulnerabilityLocation(focalTitle)
            });
            return;
        }

        relatedEntries.forEach((related) => {
            const relatedId = String(related?.vulnerabilityId || '').trim();
            const relatedEntry = relatedId ? catalogById.get(relatedId) : null;
            const relatedTitle = relatedEntry?.title || String(related?.title || '').trim();
            const relatedLocale = relatedEntry?.locale || String(related?.locale || '').trim();

            if (!focalId || !relatedId || focalId === relatedId)
                return;

            if (focalLocale && relatedLocale && focalLocale === relatedLocale)
                return;

            if (targetVulnerabilityId) {
                const targetId = String(targetVulnerabilityId);
                if (focalId !== targetId && relatedId !== targetId)
                    return;
            }

            const pairKey = buildDuplicatePairKey(focalId, relatedId);
            if (reportedPairs.has(pairKey))
                return;
            reportedPairs.add(pairKey);

            const focalLabel = focalTitle || catalogById.get(focalId)?.title || 'Untitled vulnerability';
            const relatedLabel = relatedTitle || catalogById.get(relatedId)?.title || 'Untitled vulnerability';
            const reason = String(related?.reason || issue.reason || message || '').trim();
            const localeSuffix = (focalLocale && relatedLocale) ?
                ` (${focalLocale} / ${relatedLocale})` :
                '';
            const issueMessage = reason.includes(relatedLabel) && reason.includes(focalLabel) ?
                reason :
                `"${focalLabel}" and "${relatedLabel}" appear to be the same template in different languages${localeSuffix} but are stored as separate records. Merge them to associate both languages. ${reason}`.trim();

            pushIssue(normalizedIssues, {
                severity: severity,
                title: title,
                message: issueMessage.replace(/\s+/g, ' ').trim(),
                location: formatVulnerabilityLocation(focalLabel)
            });
        });
    });

    return normalizedIssues;
};

const runAiUnlinkedTranslationChecks = async ({
    vulnerabilities = [],
    targetVulnerabilityId = null,
    settings = {},
    provider = null
} = {}) => {
    const catalog = buildUnlinkedTranslationCatalog(vulnerabilities);
    if (catalog.length < 2 || !hasMultipleLocales(catalog))
        return { issues: [], summary: '', model: null, provider: null };

    const targetId = String(targetVulnerabilityId || '').trim();
    const targetEntry = targetId ?
        catalog.find((entry) => entry.vulnerabilityId === targetId) :
        null;

    if (targetId && !targetEntry)
        return { issues: [], summary: '', model: null, provider: null };

    const candidates = targetEntry ?
        catalog.filter((entry) => entry.vulnerabilityId !== targetEntry.vulnerabilityId) :
        catalog;

    if (targetEntry && !candidates.length)
        return { issues: [], summary: '', model: null, provider: null };

    const selectedProvider = String(provider || settings?.ai?.public?.defaultProvider || AI_DEFAULT_PROVIDER)
        .trim()
        .toLowerCase();

    // A fixed target is compared against every candidate batch, so no overlap is needed to
    // cover all pairs. A full-catalog run compares many-to-many, so batches overlap to reduce
    // pairs missed at a batch boundary.
    const templateBatches = targetEntry ?
        chunkWithOverlap(candidates, AI_TRANSLATION_BATCH_SIZE, 0) :
        chunkWithOverlap(catalog, AI_TRANSLATION_BATCH_SIZE, AI_TRANSLATION_BATCH_OVERLAP);

    const rawIssues = [];
    let model = null;
    let summary = '';

    for (const batch of templateBatches) {
        const aiResult = await runVulnerabilityUnlinkedTranslationQaWithProvider({
            provider: selectedProvider,
            settings: settings,
            mode: targetEntry ? 'single' : 'all',
            target: targetEntry,
            templates: batch
        });
        rawIssues.push(...(aiResult.issues || []));
        model = model || aiResult.model || null;
        summary = summary || String(aiResult.summary || '').trim();
    }

    const catalogById = new Map(catalog.map((entry) => [entry.vulnerabilityId, entry]));
    const issues = normalizeAiUnlinkedTranslationIssues(rawIssues, {
        targetVulnerabilityId: targetId || null,
        catalogById: catalogById
    });

    return {
        issues: issues,
        summary: summary,
        model: model,
        provider: selectedProvider
    };
};

module.exports = {
    buildUnlinkedTranslationCatalog,
    normalizeAiUnlinkedTranslationIssues,
    runAiUnlinkedTranslationChecks
};
