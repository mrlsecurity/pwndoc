const { URL } = require('url');
const net = require('net');
const dns = require('dns').promises;
const { formatFindingLocation } = require('./ai-qa-location');

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_CONCURRENCY = 5;
const MAX_REDIRECTS = 5;

const trimUrlTrailing = (url) => String(url || '').replace(/[.,;:!?)'\]]+$/g, '');

const extractUrlsFromText = (text = '') => {
    const matches = String(text || '').match(URL_PATTERN) || [];
    return matches
        .map((entry) => trimUrlTrailing(entry))
        .filter(Boolean);
};

const extractUrlsFromReferences = (references = []) => {
    const urls = new Set();

    (Array.isArray(references) ? references : [references])
        .forEach((entry) => {
            extractUrlsFromText(String(entry || ''))
                .forEach((url) => urls.add(url));
        });

    return Array.from(urls);
};

const ipv4ToInt = (address) => {
    const parts = address.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
};

const isPrivateIpv4 = (address) => {
    const value = ipv4ToInt(address);
    if (value === null)
        return false;

    if (value >= ipv4ToInt('10.0.0.0') && value <= ipv4ToInt('10.255.255.255'))
        return true;
    if (value >= ipv4ToInt('172.16.0.0') && value <= ipv4ToInt('172.31.255.255'))
        return true;
    if (value >= ipv4ToInt('192.168.0.0') && value <= ipv4ToInt('192.168.255.255'))
        return true;
    if (value >= ipv4ToInt('127.0.0.0') && value <= ipv4ToInt('127.255.255.255'))
        return true;
    if (value >= ipv4ToInt('169.254.0.0') && value <= ipv4ToInt('169.254.255.255'))
        return true;
    if (value >= ipv4ToInt('0.0.0.0') && value <= ipv4ToInt('0.255.255.255'))
        return true;

    return false;
};

const isPrivateIpv6 = (address = '') => {
    const host = String(address || '').toLowerCase();

    if (host === '::1' || host === '0:0:0:0:0:0:0:1')
        return true;

    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))
        return true;

    const mappedIpv4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4)
        return isPrivateIpv4(mappedIpv4[1]);

    return false;
};

const isBlockedIpAddress = (address = '') => {
    const ipVersion = net.isIP(address);
    if (ipVersion === 4)
        return isPrivateIpv4(address);
    if (ipVersion === 6)
        return isPrivateIpv6(address);
    return true;
};

const isBlockedHostname = (hostname = '') => {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

    if (!host)
        return true;

    if (host === 'localhost' || host.endsWith('.localhost'))
        return true;

    if (host === '::1' || host === '0:0:0:0:0:0:0:1')
        return true;

    if (host.endsWith('.local') || host.endsWith('.internal'))
        return true;

    const ipVersion = net.isIP(host);
    if (ipVersion === 4)
        return isPrivateIpv4(host);

    if (ipVersion === 6)
        return isPrivateIpv6(host);

    return false;
};

const parseReferenceUrl = (rawUrl = '') => {
    try {
        return new URL(rawUrl);
    } catch (_) {
        return null;
    }
};

const REFERENCE_URL_ERRORS = {
    malformed: 'Reference URL is malformed.',
    unsupportedScheme: 'Only HTTP(S) reference URLs can be validated automatically.',
    embeddedCredentials: 'Reference URLs with embedded credentials cannot be validated automatically.',
    localOrPrivateHost: 'Reference URL points to a private or local address and cannot be validated automatically.',
    unresolvedHost: 'Reference URL hostname could not be resolved.'
};

const getStaticReferenceUrlError = (rawUrl = '') => {
    const parsed = parseReferenceUrl(rawUrl);
    if (!parsed)
        return REFERENCE_URL_ERRORS.malformed;

    if (!['http:', 'https:'].includes(parsed.protocol))
        return REFERENCE_URL_ERRORS.unsupportedScheme;

    if (parsed.username || parsed.password)
        return REFERENCE_URL_ERRORS.embeddedCredentials;

    if (isBlockedHostname(parsed.hostname))
        return REFERENCE_URL_ERRORS.localOrPrivateHost;

    return null;
};

const isBlockedReferenceUrl = (rawUrl = '') => Boolean(getStaticReferenceUrlError(rawUrl));

const resolveHostname = async (hostname = '') => {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    const ipVersion = net.isIP(host);

    if (ipVersion === 4)
        return [host];

    if (ipVersion === 6)
        return [host];

    const results = await dns.lookup(host, { all: true, verbatim: true });
    return (results || []).map((entry) => entry.address).filter(Boolean);
};

const getReferenceUrlValidationError = async (rawUrl = '') => {
    const staticError = getStaticReferenceUrlError(rawUrl);
    if (staticError)
        return staticError;

    const parsed = parseReferenceUrl(rawUrl);
    if (!parsed)
        return REFERENCE_URL_ERRORS.malformed;

    try {
        const addresses = await resolveHostname(parsed.hostname);
        if (!addresses.length)
            return REFERENCE_URL_ERRORS.unresolvedHost;

        if (!addresses.every((address) => !isBlockedIpAddress(address)))
            return REFERENCE_URL_ERRORS.localOrPrivateHost;

        return null;
    } catch (_) {
        return REFERENCE_URL_ERRORS.unresolvedHost;
    }
};

const isAllowedReferenceUrl = async (rawUrl = '') => !(await getReferenceUrlValidationError(rawUrl));

const classifyHttpStatus = (status) => {
    if (status >= 200 && status < 400)
        return { valid: true, severity: null, message: null };

    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 410 || status >= 500)
        return {
            valid: false,
            severity: 'error',
            message: `Reference URL returned HTTP ${status} (unavailable).`
        };

    if (status === 429)
        return {
            valid: false,
            severity: 'warning',
            message: `Reference URL returned HTTP ${status} (rate limited).`
        };

    return {
        valid: false,
        severity: 'warning',
        message: `Reference URL returned HTTP ${status}.`
    };
};

const requestReferenceUrl = async (url, method = 'HEAD') => {
    let currentUrl = url;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const validationError = await getReferenceUrlValidationError(currentUrl);
        if (validationError)
            throw new Error(validationError);

        const response = await fetch(currentUrl, {
            method: method,
            redirect: 'manual',
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
            headers: {
                'User-Agent': 'PwnDoc-QA-LinkChecker/1.0'
            }
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location)
                throw new Error('Reference URL redirect did not include a location header.');

            currentUrl = new URL(location, currentUrl).href;
            continue;
        }

        return response.status;
    }

    throw new Error('Reference URL exceeded the maximum number of redirects.');
};

const validateReferenceUrl = async (rawUrl = '') => {
    const url = trimUrlTrailing(rawUrl);
    const validationError = await getReferenceUrlValidationError(url);

    if (validationError) {
        return {
            url: url,
            valid: false,
            severity: 'warning',
            message: validationError
        };
    }

    try {
        let status = await requestReferenceUrl(url, 'HEAD');

        if (status === 405 || status === 501)
            status = await requestReferenceUrl(url, 'GET');

        const classification = classifyHttpStatus(status);
        return {
            url: url,
            valid: classification.valid,
            severity: classification.severity,
            message: classification.message
        };
    } catch (err) {
        const detail = err?.name === 'AbortError' ?
            'request timed out' :
            (err?.message || String(err));

        return {
            url: url,
            valid: false,
            severity: detail.includes('timed out') ? 'warning' : 'error',
            message: Object.values(REFERENCE_URL_ERRORS).includes(detail) ?
                detail :
                `Reference URL could not be reached (${detail}).`
        };
    }
};

const mapWithConcurrency = async (items = [], limit = DEFAULT_CONCURRENCY, mapper = async () => null) => {
    if (!items.length)
        return [];

    const results = new Array(items.length);
    let nextIndex = 0;

    const workers = Array(Math.min(limit, items.length))
        .fill(0)
        .map(async () => {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            }
        });

    await Promise.all(workers);
    return results;
};

const collectReferenceUrls = (audit = {}) => {
    const entries = [];

    (audit.findings || []).forEach((finding) => {
        const locationBase = formatFindingLocation(finding);

        extractUrlsFromReferences(finding?.references)
            .forEach((url) => {
                entries.push({
                    url: url,
                    findingTitle: String(finding?.title || 'Untitled finding').trim(),
                    location: `${locationBase}/references`
                });
            });
    });

    return entries;
};

const runReferenceLinkChecks = async (audit = {}) => {
    const entries = collectReferenceUrls(audit);
    if (!entries.length)
        return [];

    const uniqueUrls = Array.from(new Set(entries.map((entry) => entry.url)));
    const validationResults = await mapWithConcurrency(
        uniqueUrls,
        DEFAULT_CONCURRENCY,
        (url) => validateReferenceUrl(url)
    );
    const resultsByUrl = new Map(uniqueUrls.map((url, index) => [url, validationResults[index]]));

    const issues = [];

    entries.forEach((entry) => {
        const result = resultsByUrl.get(entry.url);
        if (!result || result.valid)
            return;

        issues.push({
            severity: result.severity || 'warning',
            category: 'references',
            title: 'Invalid reference link',
            message: `"${entry.findingTitle}" references ${entry.url}. ${result.message}`,
            location: entry.location,
            source: 'structural'
        });
    });

    return issues;
};

module.exports = {
    URL_PATTERN,
    extractUrlsFromText,
    extractUrlsFromReferences,
    isBlockedReferenceUrl,
    getReferenceUrlValidationError,
    isAllowedReferenceUrl,
    validateReferenceUrl,
    runReferenceLinkChecks
};
