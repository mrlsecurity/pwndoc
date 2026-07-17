const { runVulnerabilityTemplateQaWithProvider } = require('./ai-client');
const {
    stripHtml,
    summarizeCustomFields,
    normalizeIssue
} = require('./ai-qa-shared');
const {
    getQaChecksFromSettings,
    isQaCheckEnabled,
    hasEnabledAiQaChecks,
    hasEnabledQaChecks,
    filterAiIssuesByEnabledChecks,
    buildIssueCounts,
    normalizeQaScope
} = require('./ai-qa-checks');
const {
    resolveRedactionGuidelinesForRequest,
    getRedactionGuidelinesText
} = require('./ai-redaction-guidelines');
const {
    resolveQaInstructionsForRequest,
    getQaInstructionsText
} = require('./ai-qa-instructions');
const { AI_DEFAULT_PROVIDER } = require('./ai-prompts');
const { runReferenceLinkChecks } = require('./ai-qa-link-checker');
const { runImageCaptionChecks } = require('./ai-qa-image-captions');
const { normalizeAiIssueLocation } = require('./ai-qa-location');

const pushIssue = (issues, issue, source = 'structural') => {
    const normalized = normalizeIssue(issue, source);
    if (!normalized.title || !normalized.message)
        return;
    issues.push(normalized);
};

const normalizeComparableTitle = (title = '') => {
    return String(title || '')
        .trim()
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const formatVulnerabilityLocation = (title = '', field = '') => {
    const label = String(title || '').trim() || 'Untitled vulnerability';
    if (field)
        return `vulnerability:${label}/${field}`;
    return `vulnerability:${label}`;
};

const getVulnerabilityDetail = (vulnerability = {}, locale = '') => {
    return (vulnerability.details || []).find((detail) => {
        return detail?.locale === locale && String(detail?.title || '').trim();
    }) || null;
};

const vulnerabilityDetailToFinding = (vulnerability = {}, detail = {}) => {
    return {
        title: String(detail.title || '').trim(),
        vulnType: String(detail.vulnType || '').trim(),
        category: String(vulnerability.category || '').trim(),
        description: detail.description,
        observation: detail.observation,
        remediation: detail.remediation,
        references: Array.isArray(detail.references) ? detail.references : [],
        cvssv3: String(vulnerability.cvssv3 || '').trim(),
        cvssv4: String(vulnerability.cvssv4 || '').trim(),
        customFields: detail.customFields
    };
};

const vulnerabilityToPseudoAudit = (vulnerability = {}, detail = {}) => {
    return {
        name: `Vulnerability template: ${String(detail.title || '').trim()}`,
        type: 'vulnerability_template',
        language: String(detail.locale || '').trim(),
        findings: [vulnerabilityDetailToFinding(vulnerability, detail)],
        sections: [],
        customFields: []
    };
};

const buildVulnerabilitySnapshot = (vulnerability = {}, detail = {}) => {
    const finding = vulnerabilityDetailToFinding(vulnerability, detail);

    return {
        type: 'vulnerability_template',
        language: String(detail.locale || '').trim(),
        category: String(vulnerability.category || '').trim(),
        cvssv3: finding.cvssv3,
        cvssv4: finding.cvssv4,
        priority: vulnerability.priority || null,
        remediationComplexity: vulnerability.remediationComplexity || null,
        finding: {
            location: formatVulnerabilityLocation(finding.title),
            title: finding.title,
            vulnType: finding.vulnType,
            category: finding.category,
            description: stripHtml(finding.description).slice(0, 4000),
            observation: stripHtml(finding.observation).slice(0, 4000),
            remediation: stripHtml(finding.remediation).slice(0, 4000),
            references: finding.references,
            customFields: summarizeCustomFields(finding.customFields)
        }
    };
};

const buildContentFingerprint = (detail = {}) => {
    const parts = ['description', 'observation', 'remediation']
        .map((key) => stripHtml(detail[key]).trim().toLowerCase())
        .filter(Boolean);

    return parts.join('\n');
};

const buildDuplicatePairKey = (leftId = '', rightId = '') => {
    return [String(leftId), String(rightId)].sort().join('|');
};

const collectVulnerabilityEntries = (vulnerabilities = [], locale = '') => {
    const entries = [];

    vulnerabilities.forEach((vulnerability) => {
        const detail = getVulnerabilityDetail(vulnerability, locale);
        if (!detail)
            return;

        entries.push({
            vulnerabilityId: String(vulnerability._id || vulnerability.id || ''),
            title: String(detail.title || '').trim(),
            normalizedTitle: normalizeComparableTitle(detail.title),
            fingerprint: buildContentFingerprint(detail)
        });
    });

    return entries;
};

const runDuplicateChecks = ({
    vulnerabilities = [],
    locale = '',
    targetVulnerabilityId = null
} = {}) => {
    const issues = [];
    const entries = collectVulnerabilityEntries(vulnerabilities, locale);
    const shouldInclude = (vulnerabilityId) => {
        if (!targetVulnerabilityId)
            return true;
        return String(vulnerabilityId) === String(targetVulnerabilityId);
    };

    const titleGroups = new Map();
    entries.forEach((entry) => {
        if (!entry.normalizedTitle)
            return;
        if (!titleGroups.has(entry.normalizedTitle))
            titleGroups.set(entry.normalizedTitle, []);
        titleGroups.get(entry.normalizedTitle).push(entry);
    });

    const reportedPairs = new Set();

    titleGroups.forEach((group) => {
        if (group.length < 2)
            return;

        const uniqueIds = [...new Set(group.map((entry) => entry.vulnerabilityId))];
        if (uniqueIds.length < 2)
            return;

        group.forEach((entry) => {
            group.forEach((otherEntry) => {
                if (entry.vulnerabilityId === otherEntry.vulnerabilityId)
                    return;

                const pairKey = buildDuplicatePairKey(entry.vulnerabilityId, otherEntry.vulnerabilityId);
                if (reportedPairs.has(pairKey))
                    return;

                if (!shouldInclude(entry.vulnerabilityId))
                    return;

                reportedPairs.add(pairKey);

                pushIssue(issues, {
                    severity: 'error',
                    category: 'duplicates',
                    title: 'Duplicate vulnerability title',
                    message: `"${entry.title}" matches another template in this language (${otherEntry.title}).`,
                    location: formatVulnerabilityLocation(entry.title),
                    vulnerabilityIds: [entry.vulnerabilityId, otherEntry.vulnerabilityId]
                });
            });
        });
    });

    const fingerprintGroups = new Map();
    entries.forEach((entry) => {
        if (!entry.fingerprint)
            return;
        if (!fingerprintGroups.has(entry.fingerprint))
            fingerprintGroups.set(entry.fingerprint, []);
        fingerprintGroups.get(entry.fingerprint).push(entry);
    });

    fingerprintGroups.forEach((group) => {
        if (group.length < 2)
            return;

        const uniqueIds = [...new Set(group.map((entry) => entry.vulnerabilityId))];
        if (uniqueIds.length < 2)
            return;

        group.forEach((entry) => {
            group.forEach((otherEntry) => {
                if (entry.vulnerabilityId === otherEntry.vulnerabilityId)
                    return;

                const pairKey = buildDuplicatePairKey(entry.vulnerabilityId, otherEntry.vulnerabilityId);
                if (reportedPairs.has(pairKey))
                    return;

                if (!shouldInclude(entry.vulnerabilityId) && !shouldInclude(otherEntry.vulnerabilityId))
                    return;

                if (!shouldInclude(entry.vulnerabilityId))
                    return;

                reportedPairs.add(pairKey);

                const sameTitle = entry.normalizedTitle === otherEntry.normalizedTitle;
                pushIssue(issues, {
                    severity: sameTitle ? 'error' : 'warning',
                    category: 'duplicates',
                    title: sameTitle ? 'Duplicate vulnerability title' : 'Duplicate vulnerability content',
                    message: sameTitle ?
                        `"${entry.title}" matches another template with the same title (${otherEntry.title}).` :
                        `"${entry.title}" has identical description, observation, and remediation as "${otherEntry.title}".`,
                    location: formatVulnerabilityLocation(entry.title),
                    vulnerabilityIds: [entry.vulnerabilityId, otherEntry.vulnerabilityId]
                });
            });
        });
    });

    return issues;
};

const runVulnerabilityStructuralChecks = (vulnerability = {}, detail = {}) => {
    const issues = [];
    const location = formatVulnerabilityLocation(detail.title);
    const finding = vulnerabilityDetailToFinding(vulnerability, detail);

    if (!finding.title) {
        pushIssue(issues, {
            severity: 'error',
            category: 'completeness',
            title: 'Missing vulnerability title',
            message: 'A vulnerability template must have a title for the selected language.',
            location: location
        });
    }

    if (!stripHtml(finding.description)) {
        pushIssue(issues, {
            severity: 'warning',
            category: 'completeness',
            title: 'Missing description',
            message: `"${finding.title || 'Untitled vulnerability'}" has no description.`,
            location: formatVulnerabilityLocation(finding.title, 'description')
        });
    }

    if (!stripHtml(finding.observation)) {
        pushIssue(issues, {
            severity: 'info',
            category: 'completeness',
            title: 'Missing observation',
            message: `"${finding.title || 'Untitled vulnerability'}" has no observation.`,
            location: formatVulnerabilityLocation(finding.title, 'observation')
        });
    }

    if (!stripHtml(finding.remediation)) {
        pushIssue(issues, {
            severity: 'warning',
            category: 'completeness',
            title: 'Missing remediation',
            message: `"${finding.title || 'Untitled vulnerability'}" has no remediation guidance.`,
            location: formatVulnerabilityLocation(finding.title, 'remediation')
        });
    }

    return issues;
};

const dedupeIssues = (issues = []) => {
    const seen = new Set();
    return issues.filter((issue) => {
        const key = `${issue.severity}|${issue.category}|${issue.location}|${issue.title}|${issue.message}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
};

const sortIssues = (issues = []) => {
    const severityRank = { error: 0, warning: 1, info: 2 };
    return [...issues].sort((a, b) => {
        const severityDiff = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
        if (severityDiff !== 0)
            return severityDiff;
        return `${a.location}:${a.title}`.localeCompare(`${b.location}:${b.title}`);
    });
};

const buildSummary = (issues = [], aiSummary = '', vulnerabilityCount = 1) => {
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warning').length;
    const infos = issues.filter((issue) => issue.severity === 'info').length;

    if (issues.length === 0) {
        if (vulnerabilityCount > 1)
            return aiSummary || `No issues were flagged across ${vulnerabilityCount} vulnerability templates.`;
        return aiSummary || 'No issues were flagged. The vulnerability template looks ready to use.';
    }

    const parts = [`${issues.length} issue(s) flagged`];
    if (errors)
        parts.push(`${errors} error(s)`);
    if (warnings)
        parts.push(`${warnings} warning(s)`);
    if (infos)
        parts.push(`${infos} info(s)`);

    if (aiSummary)
        return `${parts.join(', ')}. ${aiSummary}`;

    return `${parts.join(', ')}.`;
};

const remapFindingIssueLocations = (issues = []) => issues.map((issue) => ({
    ...issue,
    location: String(issue.location || '').replace(/^finding:/, 'vulnerability:')
}));

// Template-scoped QA only: structural completeness, reference links, image captions and
// the LLM content review. Catalog-wide checks (duplicates, AI duplicates, unlinked
// translations) run once over the whole catalog in ai-vuln-qa-job.js and are stored in
// the VulnerabilityQaCatalog model — they are intentionally absent here.
const runSingleVulnerabilityQa = async ({
    vulnerability,
    detail,
    settings,
    provider,
    qaChecks,
    scope = 'all'
}) => {
    const normalizedScope = normalizeQaScope(scope) || 'all';
    const runProgrammatic = normalizedScope === 'all' || normalizedScope === 'programmatic';
    const runAi = normalizedScope === 'all' || normalizedScope === 'ai';
    const pseudoAudit = vulnerabilityToPseudoAudit(vulnerability, detail);
    const structuralIssues = runProgrammatic && isQaCheckEnabled(qaChecks, 'completeness') ?
        runVulnerabilityStructuralChecks(vulnerability, detail) :
        [];
    let referenceLinkIssues = [];

    if (runProgrammatic && isQaCheckEnabled(qaChecks, 'references')) {
        try {
            referenceLinkIssues = remapFindingIssueLocations(await runReferenceLinkChecks(pseudoAudit));
        } catch (err) {
            pushIssue(structuralIssues, {
                severity: 'info',
                category: 'references',
                title: 'Reference link check skipped',
                message: `Automated reference URL validation could not run: ${err?.message || String(err)}`,
                location: formatVulnerabilityLocation(detail.title)
            });
        }
    }

    const imageCaptionIssues = runProgrammatic && isQaCheckEnabled(qaChecks, 'imageCaptions') ?
        remapFindingIssueLocations(runImageCaptionChecks(pseudoAudit)) :
        [];

    const snapshot = buildVulnerabilitySnapshot(vulnerability, detail);
    const redactionGuidelines = resolveRedactionGuidelinesForRequest(settings);
    const qaInstructions = resolveQaInstructionsForRequest(settings);
    const redactionGuidelinesText = isQaCheckEnabled(qaChecks, 'redaction') ?
        getRedactionGuidelinesText(redactionGuidelines) :
        '';
    const qaInstructionsText = isQaCheckEnabled(qaChecks, 'instructions') ?
        getQaInstructionsText(qaInstructions) :
        '';
    const selectedProvider = String(provider || settings?.ai?.public?.defaultProvider || AI_DEFAULT_PROVIDER).trim().toLowerCase();
    const aiChecksEnabled = hasEnabledAiQaChecks(qaChecks);

    let aiResult = null;
    let aiSkippedReason = '';

    if (runAi && aiChecksEnabled) {
        try {
            aiResult = await runVulnerabilityTemplateQaWithProvider({
                provider: selectedProvider,
                settings: settings,
                templateSnapshot: snapshot,
                qaChecks: qaChecks,
                redactionGuidelines: redactionGuidelines,
                redactionGuidelinesText: redactionGuidelinesText,
                qaInstructions: qaInstructions,
                qaInstructionsText: qaInstructionsText
            });
        } catch (err) {
            aiSkippedReason = err?.message || String(err);
        }
    }

    const aiIssues = filterAiIssuesByEnabledChecks(
        (aiResult?.issues || []).map((issue) => normalizeIssue({
            ...issue,
            location: normalizeAiIssueLocation(
                String(issue.location || '').replace(/^finding:/i, 'vulnerability:'),
                {
                    entityPrefix: 'vulnerability',
                    defaultTitle: detail.title
                }
            )
        }, 'ai')),
        qaChecks
    );

    const issues = sortIssues(dedupeIssues([
        ...structuralIssues,
        ...referenceLinkIssues.map((issue) => ({
            ...issue,
            location: String(issue.location || '').replace(/^finding:/, 'vulnerability:')
        })),
        ...imageCaptionIssues,
        ...aiIssues
    ]));

    if (runAi && aiChecksEnabled && !aiResult && aiSkippedReason) {
        pushIssue(issues, {
            severity: 'info',
            category: 'other',
            title: 'AI review skipped',
            message: `Automated content review could not run: ${aiSkippedReason}`,
            location: formatVulnerabilityLocation(detail.title)
        }, 'structural');
    }

    const finalIssues = sortIssues(dedupeIssues(issues));

    return {
        vulnerabilityId: String(vulnerability._id || vulnerability.id || ''),
        title: String(detail.title || '').trim(),
        issues: finalIssues,
        summary: buildSummary(finalIssues, aiResult?.summary || ''),
        aiAnalysis: Boolean(aiResult),
        aiSkippedReason: aiSkippedReason || null,
        provider: aiResult ? selectedProvider : null,
        model: aiResult?.model || null,
        counts: buildIssueCounts(finalIssues)
    };
};

const runVulnerabilityQa = async ({
    vulnerability,
    locale,
    settings,
    provider,
    scope = 'all'
}) => {
    const qaChecks = getQaChecksFromSettings(settings);

    if (!hasEnabledQaChecks(qaChecks)) {
        return {
            mode: 'single',
            locale: locale,
            issues: [],
            summary: 'No QA checks are enabled in organization settings.',
            aiAnalysis: false,
            provider: null,
            model: null,
            counts: buildIssueCounts([])
        };
    }

    const detail = getVulnerabilityDetail(vulnerability, locale);
    if (!detail) {
        return {
            mode: 'single',
            locale: locale,
            issues: [],
            summary: 'The selected vulnerability does not have content for this language.',
            aiAnalysis: false,
            provider: null,
            model: null,
            counts: buildIssueCounts([])
        };
    }

    const result = await runSingleVulnerabilityQa({
        vulnerability: vulnerability,
        detail: detail,
        settings: settings,
        provider: provider,
        qaChecks: qaChecks,
        scope: scope
    });

    return {
        mode: 'single',
        locale: locale,
        vulnerabilityId: result.vulnerabilityId,
        title: result.title,
        issues: result.issues,
        summary: result.summary,
        aiAnalysis: result.aiAnalysis,
        aiSkippedReason: result.aiSkippedReason || null,
        provider: result.provider,
        model: result.model,
        counts: result.counts
    };
};

// Targets = vulnerabilities that have content for the requested locale.
const buildQaTargets = (vulnerabilities = [], locale = '') => {
    return vulnerabilities
        .map((vulnerability) => ({
            vulnerability: vulnerability,
            detail: getVulnerabilityDetail(vulnerability, locale)
        }))
        .filter((entry) => entry.detail);
};

module.exports = {
    formatVulnerabilityLocation,
    getVulnerabilityDetail,
    buildVulnerabilitySnapshot,
    buildDuplicatePairKey,
    dedupeIssues,
    sortIssues,
    runDuplicateChecks,
    runVulnerabilityStructuralChecks,
    runVulnerabilityQa,
    buildQaTargets
};
