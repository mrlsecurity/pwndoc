const utils = require('./utils');

const formatFindingLocation = (finding = {}) => {
    const title = String(finding?.title || '').trim() || 'Untitled finding';
    const id = String(finding?._id || finding?.id || '').trim();
    if (id)
        return `finding:${id}::${title}`;
    return `finding:${title}`;
};

// Issues produced by the AI reviewer only know a finding's title (see the QA system prompts),
// so duplicate titles are ambiguous. This resolves them to an id after the fact, whenever the
// title happens to be unique in the audit, without having to trust the model to echo an id back.
const FINDING_LOCATION_HAS_ID = /^finding:[0-9a-fA-F]{24}::/;

const attachFindingIdToLocation = (location = '', findings = []) => {
    const value = String(location || '').trim();
    if (!value.startsWith('finding:') || FINDING_LOCATION_HAS_ID.test(value))
        return value;

    const rest = value.slice('finding:'.length);
    const slashIndex = rest.indexOf('/');
    const title = (slashIndex === -1 ? rest : rest.slice(0, slashIndex)).trim();
    const suffix = slashIndex === -1 ? '' : rest.slice(slashIndex);

    const matches = findings.filter((finding) => String(finding?.title || '').trim() === title);
    if (matches.length !== 1)
        return value;

    const id = String(matches[0]._id || matches[0].id || '').trim();
    if (!id)
        return value;

    return `finding:${id}::${title}${suffix}`;
};

const attachFindingIdsToIssueLocations = (issues = [], findings = []) => {
    if (!findings.length)
        return issues;

    return issues.map((issue) => ({
        ...issue,
        location: attachFindingIdToLocation(issue.location, findings)
    }));
};

const buildFindingTitleByIdentifier = (findings = []) => {
    const lookup = new Map();

    findings.forEach((finding) => {
        const title = String(finding?.title || '').trim() || 'Untitled finding';
        if (finding?.identifier === null || finding?.identifier === undefined)
            return;

        lookup.set(utils.lPad(finding.identifier), title);
        lookup.set(String(finding.identifier), title);
    });

    return lookup;
};

const resolveIssueLocation = (location = '', findings = []) => {
    const source = String(location || '').trim() || 'report';
    const match = source.match(/^finding:IDX-0*(\d+)(\/.*)?$/i);
    if (!match)
        return source;

    const lookup = buildFindingTitleByIdentifier(findings);
    const title = lookup.get(match[1]) || lookup.get(utils.lPad(parseInt(match[1], 10)));
    if (!title)
        return source;

    return `finding:${title}${match[2] || ''}`;
};

const normalizeAiIssueLocation = (location = '', options = {}) => {
    const value = String(location || '').trim() || 'report';
    const { entityPrefix = 'finding', defaultTitle = '' } = options;

    const fieldPathMatch = value.match(/^field path:\s*(.+)$/i);
    if (!fieldPathMatch)
        return value;

    const path = fieldPathMatch[1].trim();
    const findingFieldMatch = path.match(/^finding\.([a-zA-Z0-9_]+)/i);
    if (findingFieldMatch) {
        const field = findingFieldMatch[1];
        const title = String(defaultTitle || '').trim();
        if (title)
            return `${entityPrefix}:${title}/${field}`;
        return `field:${field}`;
    }

    const sectionMatch = path.match(/^section[.:](.+)$/i);
    if (sectionMatch) {
        const name = sectionMatch[1].trim();
        return name ? `section:${name}` : 'report';
    }

    if (['general', 'network', 'report'].includes(path.toLowerCase()))
        return path.toLowerCase();

    return `general/${path}`;
};

const normalizeIssueLocations = (issues = [], findings = []) => {
    return issues.map((issue) => ({
        ...issue,
        location: resolveIssueLocation(issue.location, findings)
    }));
};

module.exports = {
    formatFindingLocation,
    buildFindingTitleByIdentifier,
    resolveIssueLocation,
    normalizeAiIssueLocation,
    normalizeIssueLocations,
    attachFindingIdToLocation,
    attachFindingIdsToIssueLocations
};
