export const QA_CHECK_KEYS = [
    'completeness',
    'references',
    'imageCaptions',
    'duplicates',
    'aiDuplicates',
    'aiUnlinkedTranslations',
    'redaction',
    'customer',
    'instructions'
]

export const QA_PROGRAMMATIC_CHECK_KEYS = [
    'completeness',
    'references',
    'imageCaptions',
    'duplicates'
]

export const QA_AI_CHECK_KEYS = [
    'aiDuplicates',
    'aiUnlinkedTranslations',
    'redaction',
    'customer',
    'instructions'
]

export function hasAnyProgrammaticQaCheckEnabled(qaChecks = {}) {
    return QA_PROGRAMMATIC_CHECK_KEYS.some((key) => qaChecks[key] !== false)
}

export function hasAnyAiQaCheckEnabled(qaChecks = {}) {
    return QA_AI_CHECK_KEYS.some((key) => qaChecks[key] !== false)
}

export function hasAnyQaCheckEnabled(qaChecks = {}) {
    return hasAnyProgrammaticQaCheckEnabled(qaChecks) || hasAnyAiQaCheckEnabled(qaChecks)
}
