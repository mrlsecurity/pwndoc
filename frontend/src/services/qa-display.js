import { $t } from '@/boot/i18n';
import { isGeneralInformationLocation } from '@/services/audit-qa-navigation';

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

export const filterIssuesBySeverity = (issues = [], severityFilter = 'all') => {
  if (severityFilter === 'all')
    return issues

  return issues.filter((issue) => issue.severity === severityFilter)
}

export const buildQaReportViewModel = (data = {}) => {
  const issues = Array.isArray(data.issues) ? data.issues : []

  return {
    summary: String(data.summary || ''),
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
