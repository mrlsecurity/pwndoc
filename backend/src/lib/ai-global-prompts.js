const MAX_GLOBAL_PROMPTS = 50;

const normalizeGlobalPrompt = (entry = {}) => ({
    id: String(entry.id || '').trim(),
    label: String(entry.label || '').trim(),
    prompt: String(entry.prompt || '').trim(),
    enabled: entry.enabled !== false
});

const normalizeGlobalPrompts = (entries = []) => {
    if (!Array.isArray(entries))
        return [];

    return entries
        .map((entry) => normalizeGlobalPrompt(entry))
        .filter((entry) => entry.id && entry.label && entry.prompt);
};

const validateGlobalPromptsPayload = (payload) => {
    if (!Array.isArray(payload))
        return { valid: false, message: 'Invalid globalPrompts payload' };

    if (payload.length > MAX_GLOBAL_PROMPTS)
        return { valid: false, message: `Too many global prompts (max ${MAX_GLOBAL_PROMPTS})` };

    const seenIds = new Set();

    for (const entry of payload) {
        if (!entry || typeof entry !== 'object')
            return { valid: false, message: 'Invalid globalPrompts entry' };

        const normalized = normalizeGlobalPrompt(entry);
        if (!normalized.id)
            return { valid: false, message: 'Each global prompt requires an id' };
        if (!normalized.label)
            return { valid: false, message: 'Each global prompt requires a label' };
        if (!normalized.prompt)
            return { valid: false, message: 'Each global prompt requires prompt text' };
        if (typeof entry.enabled !== 'undefined' && typeof entry.enabled !== 'boolean')
            return { valid: false, message: 'Invalid globalPrompts.enabled flag' };
        if (seenIds.has(normalized.id))
            return { valid: false, message: 'Duplicate global prompt id' };

        seenIds.add(normalized.id);
    }

    return { valid: true };
};

const buildGlobalPromptsSettingsUpdate = (payload = []) => ({
    'ai.public.globalPrompts': normalizeGlobalPrompts(payload)
});

module.exports = {
    MAX_GLOBAL_PROMPTS,
    normalizeGlobalPrompt,
    normalizeGlobalPrompts,
    validateGlobalPromptsPayload,
    buildGlobalPromptsSettingsUpdate
};
