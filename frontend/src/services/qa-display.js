import { $t } from '@/boot/i18n';
import {
  isGeneralInformationLocation,
  parseIssueLocation,
  resolveFindingForLocation
} from '@/services/audit-qa-navigation';

const QA_FIELD_LABELS = () => ({
  description: $t('description'),
  observation: $t('observation'),
  remediation: $t('remediation'),
  references: $t('references'),
  poc: $t('proofs'),
  affected: $t('affectedAssets'),
  cvssv3: 'CVSS v3',
  cvssv4: 'CVSS v4',
  retestDescription: $t('description'),
  category: $t('category'),
  vulnType: $t('type'),
  title: $t('title')
});

const splitEntityLocation = (value, prefix) => {
  if (!value.startsWith(prefix))
    return null;

  const fieldLabels = QA_FIELD_LABELS();
  let rest = value.slice(prefix.length);
  let field = '';

  // Strip an embedded finding id (finding:<id>::<title>) — the id is only used for
  // navigation matching, titles are the display form.
  const idMatch = rest.match(/^[0-9a-fA-F]{24}::(.*)$/);
  if (idMatch)
    rest = idMatch[1];

  Object.keys(fieldLabels).forEach((fieldKey) => {
    const suffix = `/${fieldKey}`;
    if (rest.endsWith(suffix)) {
      field = fieldKey;
      rest = rest.slice(0, -suffix.length);
    }
  });

  return { title: rest, field };
};

export const formatQaLocationLabel = (location = '', options = {}) => {
  const {
    defaultEntityTitle = '',
    entityPrefixes = ['finding:', 'vulnerability:'],
    databaseFallbackLabel = ''
  } = options;

  const value = String(location || '').trim();
  if (!value) {
    if (databaseFallbackLabel)
      return databaseFallbackLabel;
    return $t('auditQa.location.report');
  }

  const staticLabels = {
    general: $t('generalInformation'),
    network: $t('auditQa.location.network'),
    report: $t('auditQa.location.report')
  };
  if (staticLabels[value])
    return staticLabels[value];

  const fieldLabels = QA_FIELD_LABELS();

  for (const prefix of entityPrefixes) {
    const parsed = splitEntityLocation(value, prefix);
    if (!parsed)
      continue;

    let { title, field } = parsed;
    if (/^IDX-\d+$/i.test(title))
      title = $t('auditQa.location.untitledFinding');

    if (field)
      return `${title} · ${fieldLabels[field] || field}`;
    return title;
  }

  const fieldPathMatch = value.match(/^field path:\s*(.+)$/i);
  if (fieldPathMatch) {
    const path = fieldPathMatch[1].trim();
    const findingFieldMatch = path.match(/^finding\.([a-zA-Z0-9_]+)/i);
    if (findingFieldMatch) {
      const field = findingFieldMatch[1];
      const title = String(defaultEntityTitle || '').trim();
      const fieldLabel = fieldLabels[field] || field;
      if (title)
        return `${title} · ${fieldLabel}`;
      return fieldLabel;
    }

    const sectionMatch = path.match(/^section[.:](.+)$/i);
    if (sectionMatch)
      return sectionMatch[1].trim();

    if (['general', 'network', 'report'].includes(path.toLowerCase()))
      return staticLabels[path.toLowerCase()];

    return $t('generalInformation');
  }

  const fieldOnlyMatch = value.match(/^field:(.+)$/);
  if (fieldOnlyMatch) {
    const field = fieldOnlyMatch[1];
    const title = String(defaultEntityTitle || '').trim();
    const fieldLabel = fieldLabels[field] || field;
    if (title)
      return `${title} · ${fieldLabel}`;
    return fieldLabel;
  }

  if (isGeneralInformationLocation(value))
    return $t('generalInformation');

  const sectionMatch = value.match(/^section:(.+)$/);
  if (sectionMatch)
    return sectionMatch[1];

  if (value.startsWith('general/'))
    return $t('generalInformation');

  return value;
};

export const groupIssuesByLabel = (issues = [], formatLocationLabel) => {
  const groups = new Map();

  issues.forEach((issue) => {
    const label = formatLocationLabel(issue.location);
    if (!groups.has(label))
      groups.set(label, []);
    groups.get(label).push(issue);
  });

  return Array.from(groups.entries()).map(([label, groupIssues]) => ({
    label,
    issues: groupIssues
  }));
};

const UNTITLED_FINDING_PATTERN = /^IDX-\d+$/i;

const findingRowKey = (finding, fallbackTitle) => String(finding?._id || finding?.id || `title:${fallbackTitle}`);

// Groups audit QA issues the way the left navigation drawer is laid out: Report (global,
// audit-wide issues with no specific location) first, then General information, then Network
// (if any), then Findings — grouped by category in the same order categories first appear in
// `findings`, with ONE row per finding (not one per field) aggregating every issue that finding
// has, however many different fields they touch — then Sections.
//
// Unlike groupIssuesByLabel (still used as-is by the vulnerability QA panel), this is specific
// to the audit-findings shape: it needs `findings`/`sections` to resolve which finding/section
// an issue belongs to and to mirror the sidebar's category/finding ordering.
export const buildAuditQaGroups = (issues = [], { findings = [], sections = [] } = {}) => {
  // Mirrors the left sidebar's `_.groupBy('category')`: category order, and finding order
  // within a category, both follow first-appearance order in the findings array.
  const categoryOrder = [];
  const findingsByCategory = new Map();
  findings.forEach((finding) => {
    const category = String(finding?.category || '').trim() || 'No Category';
    if (!findingsByCategory.has(category)) {
      findingsByCategory.set(category, []);
      categoryOrder.push(category);
    }
    findingsByCategory.get(category).push(finding);
  });

  const reportIssues = [];
  const generalIssues = [];
  const networkIssues = [];
  const sectionIssuesByName = new Map();
  const findingRows = new Map(); // findingRowKey -> { key, title, findingId, issues }

  issues.forEach((issue) => {
    const parsed = parseIssueLocation(issue.location);

    if (parsed.type === 'page') {
      if (parsed.page === 'network')
        networkIssues.push(issue);
      else if (parsed.page === 'report')
        reportIssues.push(issue);
      else
        generalIssues.push(issue);
      return;
    }

    if (parsed.type === 'section') {
      const name = parsed.sectionName;
      if (!sectionIssuesByName.has(name))
        sectionIssuesByName.set(name, []);
      sectionIssuesByName.get(name).push(issue);
      return;
    }

    if (parsed.type === 'finding') {
      const finding = resolveFindingForLocation(parsed, findings);
      const rawTitle = finding?.title || parsed.findingTitle || $t('auditQa.location.untitledFinding');
      const title = UNTITLED_FINDING_PATTERN.test(rawTitle) ? $t('auditQa.location.untitledFinding') : rawTitle;
      const key = findingRowKey(finding, rawTitle);

      if (!findingRows.has(key)) {
        findingRows.set(key, {
          key,
          title,
          findingId: finding?._id || null,
          issues: []
        });
      }

      findingRows.get(key).issues.push(issue);
      return;
    }

    // Unrecognized location shape — surface it under Report rather than dropping it.
    reportIssues.push(issue);
  });

  const groups = [];

  if (reportIssues.length)
    groups.push({ key: 'report', label: $t('auditQa.location.report'), issues: reportIssues });

  if (generalIssues.length)
    groups.push({ key: 'general', label: $t('generalInformation'), issues: generalIssues });

  if (networkIssues.length)
    groups.push({ key: 'network', label: $t('auditQa.location.network'), issues: networkIssues });

  const placedRowKeys = new Set();

  categoryOrder.forEach((category) => {
    const orderedFindingRows = [];

    (findingsByCategory.get(category) || []).forEach((finding) => {
      const key = findingRowKey(finding, finding?.title);
      const row = findingRows.get(key);
      if (row && !placedRowKeys.has(key)) {
        orderedFindingRows.push(row);
        placedRowKeys.add(key);
      }
    });

    // Issues whose finding no longer exists in `findings` (deleted since the QA run) can only
    // be bucketed under "No Category" since their real category is unknowable.
    if (category === 'No Category') {
      findingRows.forEach((row, key) => {
        if (!row.findingId && !placedRowKeys.has(key)) {
          orderedFindingRows.push(row);
          placedRowKeys.add(key);
        }
      });
    }

    if (!orderedFindingRows.length)
      return;

    groups.push({
      key: `category:${category}`,
      label: `${$t('findings')} > ${category}`,
      findingRows: orderedFindingRows.map((row) => ({
        key: row.key,
        title: row.title,
        findingId: row.findingId,
        issues: row.issues
      }))
    });
  });

  sectionIssuesByName.forEach((sectionIssues, name) => {
    groups.push({ key: `section:${name}`, label: name, issues: sectionIssues });
  });

  return groups;
};

export const filterIssuesBySeverity = (issues = [], severityFilter = 'all') => {
  if (severityFilter === 'all')
    return issues

  return issues.filter((issue) => issue.severity === severityFilter)
}

const AI_UNAVAILABLE_TITLE = /^AI .* skipped$/

export const isAiUnavailableIssue = (issue = {}) => AI_UNAVAILABLE_TITLE.test(String(issue.title || ''))

export const splitAiUnavailableIssues = (issues = []) => ({
  aiUnavailableIssues: issues.filter(isAiUnavailableIssue),
  remainingIssues: issues.filter((issue) => !isAiUnavailableIssue(issue))
})

export const buildQaReportViewModel = (data = {}) => {
  const issues = Array.isArray(data.issues) ? data.issues : []

  return {
    issues,
    cached: Boolean(data.cached),
    outdated: Boolean(data.outdated),
    ranAt: data.ranAt || null,
    programmaticRanAt: data.programmaticRanAt || null,
    aiRanAt: data.aiRanAt || null,
    hasReport: Boolean(data.hasReport) || issues.length > 0 || Boolean(data.ranAt),
    counts: data.counts || {
      total: issues.length,
      error: issues.filter((issue) => issue.severity === 'error').length,
      warning: issues.filter((issue) => issue.severity === 'warning').length,
      info: issues.filter((issue) => issue.severity === 'info').length
    }
  }
}

const formatQaRunDate = (value) => {
  if (!value)
    return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return null

  return date.toLocaleString()
}

export const buildPreviousRunEntries = ({ programmaticRanAt, aiRanAt } = {}) => {
  const entries = []
  const programmaticDate = formatQaRunDate(programmaticRanAt)

  if (programmaticDate || programmaticRanAt) {
    entries.push({
      kind: 'programmatic',
      label: $t('auditQa.runSourceProgrammatic'),
      date: programmaticDate
    })
  }

  const aiDate = formatQaRunDate(aiRanAt)

  if (aiDate || aiRanAt) {
    entries.push({
      kind: 'ai',
      label: $t('auditQa.runSourceAi'),
      date: aiDate
    })
  }

  return entries
}

export const buildPreviousRunLabels = ({ programmaticRanAt, aiRanAt } = {}) => (
  buildPreviousRunEntries({ programmaticRanAt, aiRanAt }).map((entry) => (
    entry.date
      ? $t(entry.kind === 'ai' ? 'auditQa.previousAiRunAt' : 'auditQa.previousProgrammaticRunAt', { date: entry.date })
      : $t(entry.kind === 'ai' ? 'auditQa.previousAiRun' : 'auditQa.previousProgrammaticRun')
  ))
)
