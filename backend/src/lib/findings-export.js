var cvss = require('ae-cvss-calculator');

function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function deriveSeverity(finding, settings) {
    var score = null;

    if (settings.report.public.scoringMethods.CVSS4 && finding.cvssv4) {
        try {
            var cvssObj = new cvss.Cvss4P0(finding.cvssv4).createJsonSchema();
            score = cvssObj.baseScore;
        } catch (e) { /* ignore invalid vectors */ }
    }
    if (score === null && settings.report.public.scoringMethods.CVSS3 && finding.cvssv3) {
        try {
            var cvssObj = new cvss.Cvss3P1(finding.cvssv3).createJsonSchema();
            score = cvssObj.baseScore;
        } catch (e) { /* ignore invalid vectors */ }
    }

    if (score === null || score === 0) return { severity: 'Info', score: score || 0 };
    if (score >= 9.0) return { severity: 'Critical', score: score };
    if (score >= 7.0) return { severity: 'High', score: score };
    if (score >= 4.0) return { severity: 'Medium', score: score };
    return { severity: 'Low', score: score };
}

function filterFields(obj, excludedFields) {
    if (!excludedFields) return obj;
    var filtered = {};
    for (var key in obj) {
        if (!excludedFields[key]) {
            filtered[key] = obj[key];
        }
    }
    return filtered;
}

function buildFindingRow(finding, settings, excludedFields) {
    var { severity, score } = deriveSeverity(finding, settings);

    var row = {
        identifier: finding.identifier || '',
        title: finding.title || '',
        vulnType: finding.vulnType || '',
        category: finding.category || '',
        severity: severity,
        cvssv3: finding.cvssv3 || '',
        cvssv4: finding.cvssv4 || '',
        cvssScore: score,
        description: stripHtml(finding.description),
    };

    var excludable = {
        observation: stripHtml(finding.observation),
        remediation: stripHtml(finding.remediation),
        remediationComplexity: finding.remediationComplexity || '',
        priority: finding.priority || '',
        poc: stripHtml(finding.poc),
        scope: finding.scope || '',
        references: Array.isArray(finding.references) ? finding.references.join('; ') : (finding.references || ''),
        retestStatus: finding.retestStatus || '',
        retestDescription: stripHtml(finding.retestDescription),
    };

    for (var key in excludable) {
        if (!excludedFields || !excludedFields[key]) {
            row[key] = excludable[key];
        }
    }

    return row;
}

function escapeCsvField(value) {
    var str = String(value === null || value === undefined ? '' : value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function toCsv(audit, settings, excludedFields) {
    var findings = audit.findings || [];
    if (findings.length === 0) return '';

    var rows = findings.map(f => buildFindingRow(f, settings, excludedFields));
    var headers = Object.keys(rows[0]);

    var lines = [headers.join(',')];
    rows.forEach(row => {
        lines.push(headers.map(h => escapeCsvField(row[h])).join(','));
    });

    return lines.join('\n');
}

function toDefectDojoJson(audit, settings, excludedFields) {
    var findings = (audit.findings || []).map(f => {
        var { severity, score } = deriveSeverity(f, settings);

        var entry = {
            title: f.title || '',
            description: stripHtml(f.description),
            severity: severity,
            date: audit.date || audit.date_start || '',
        };

        if (!excludedFields || !excludedFields.remediation) {
            entry.mitigation = stripHtml(f.remediation);
        }
        if (!excludedFields || !excludedFields.observation) {
            entry.impact = stripHtml(f.observation);
        }
        if (!excludedFields || !excludedFields.references) {
            entry.references = Array.isArray(f.references) ? f.references.join('\n') : (f.references || '');
        }

        if (f.cvssv3) entry.cvssv3 = f.cvssv3;
        if (f.cvssv4) {
            entry.cvssv4 = f.cvssv4;
            entry.cvssv4_score = score;
        }

        return entry;
    });

    return JSON.stringify({ findings: findings }, null, 2);
}

function toPwndocJson(audit, settings, excludedFields) {
    var auditMeta = {
        name: audit.name || '',
        date: audit.date || '',
        date_start: audit.date_start || '',
        date_end: audit.date_end || '',
        company: audit.company ? (audit.company.name || '') : '',
        client: audit.client ? (audit.client.email || audit.client.firstname + ' ' + audit.client.lastname || '') : '',
        language: audit.language || '',
        type: audit.type || 'default',
    };

    var findings = (audit.findings || []).map(f => {
        var { severity, score } = deriveSeverity(f, settings);

        var entry = {
            identifier: f.identifier || '',
            title: f.title || '',
            vulnType: f.vulnType || '',
            category: f.category || '',
            severity: severity,
            cvssv3: f.cvssv3 || '',
            cvssv4: f.cvssv4 || '',
            cvssScore: score,
            description: stripHtml(f.description),
        };

        if (!excludedFields || !excludedFields.observation) entry.observation = stripHtml(f.observation);
        if (!excludedFields || !excludedFields.remediation) entry.remediation = stripHtml(f.remediation);
        if (!excludedFields || !excludedFields.remediationComplexity) entry.remediationComplexity = f.remediationComplexity || null;
        if (!excludedFields || !excludedFields.priority) entry.priority = f.priority || null;
        if (!excludedFields || !excludedFields.poc) entry.poc = stripHtml(f.poc);
        if (!excludedFields || !excludedFields.scope) entry.scope = f.scope || '';
        if (!excludedFields || !excludedFields.references) entry.references = f.references || [];
        if (!excludedFields || !excludedFields.retestStatus) entry.retestStatus = f.retestStatus || null;
        if (!excludedFields || !excludedFields.retestDescription) entry.retestDescription = stripHtml(f.retestDescription);

        return entry;
    });

    return JSON.stringify({ audit: auditMeta, findings: findings }, null, 2);
}

module.exports = {
    toCsv,
    toDefectDojoJson,
    toPwndocJson,
    stripHtml,
    deriveSeverity,
};
