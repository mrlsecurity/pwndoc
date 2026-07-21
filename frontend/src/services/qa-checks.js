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

export function isAiSettingEnabled(settings = {}) {
    return settings?.ai?.public?.enabled !== false
}

// Whether there's any QA check the user could actually run right now: built-in checks are
// always available, AI checks only count while AI integration is enabled.
export function hasAnyRunnableQaCheck(settings = {}) {
    const qaChecks = settings?.ai?.public?.qaChecks

    return hasAnyProgrammaticQaCheckEnabled(qaChecks) ||
        (isAiSettingEnabled(settings) && hasAnyAiQaCheckEnabled(qaChecks))
}
