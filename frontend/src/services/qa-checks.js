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

// Permission-aware gating. Each area has three DISJOINT QA permissions: read (view reports
// only), base QA (`hasBaseQa`, run built-in checks) and AI QA (`hasAiQa`, run AI checks).
// AI checks also require AI integration enabled. base and AI never imply each other.
export function canRunProgrammaticQa(hasBaseQa, settings = {}) {
    return Boolean(hasBaseQa) && hasAnyProgrammaticQaCheckEnabled(settings?.ai?.public?.qaChecks)
}

export function canRunAiQa(hasAiQa, settings = {}) {
    return Boolean(hasAiQa) &&
        isAiSettingEnabled(settings) &&
        hasAnyAiQaCheckEnabled(settings?.ai?.public?.qaChecks)
}

// Whether the QA UI should be available at all for this user. A read permission lets them
// open the panel to view stored reports even if no checks are runnable; otherwise they need
// to be able to run at least one kind of check. A generate permission implies read.
export function canAccessQa(hasReadQa, hasBaseQa, hasAiQa, settings = {}) {
    return Boolean(hasReadQa) ||
        canRunProgrammaticQa(hasBaseQa, settings) ||
        canRunAiQa(hasAiQa, settings)
}
