// Built-in action system prompts (Tier 1 — not editable)
var BUILTIN_PROMPTS = {
    generate: `You are a cybersecurity expert writing pentest report findings.
Given the finding context below, generate a professional {fieldName}.
Write in clear, technical language suitable for a client-facing report.
Output only the content, no preamble.`,

    rephrase: `You are a technical writing assistant for penetration testing reports.
Rephrase the following text to be clearer and more professional.
Preserve all technical details and meaning. Output only the rephrased text.`,

    translate: `You are a professional translator specializing in cybersecurity.
Translate the following text to {language}.
Preserve technical terms. Output only the translation.`,

    summarize: `You are a cybersecurity expert.
Summarize the following text concisely while preserving key findings and impact.
Output only the summary.`
};

function getBuiltinPrompt(action) {
    return BUILTIN_PROMPTS[action] || null;
}

function buildSystemPrompt(action, options, adminInstructions) {
    var prompt = BUILTIN_PROMPTS[action];
    if (!prompt) return null;

    // Replace template variables
    if (options && options.language) {
        prompt = prompt.replace('{language}', options.language);
    }
    if (options && options.fieldName) {
        prompt = prompt.replace('{fieldName}', options.fieldName);
    }

    // Append admin instructions (Tier 2)
    if (adminInstructions) {
        prompt += '\n\nAdditional instructions:\n' + adminInstructions;
    }

    return prompt;
}

function buildContextString(context) {
    if (!context) return '';

    var parts = [];
    if (context.title) parts.push('- Title: ' + context.title);
    if (context.vulnType) parts.push('- Type: ' + context.vulnType);
    if (context.category) parts.push('- Category: ' + context.category);
    if (context.cvssv3) parts.push('- CVSS v3: ' + context.cvssv3);
    if (context.cvssv4) parts.push('- CVSS v4: ' + context.cvssv4);

    // Include other fields as context (truncated)
    var contextFields = ['description', 'observation', 'remediation'];
    contextFields.forEach(function(field) {
        if (context[field]) {
            var value = context[field];
            if (value.length > 500) {
                value = value.substring(0, 500) + '...';
            }
            parts.push('- ' + field.charAt(0).toUpperCase() + field.slice(1) + ': ' + value);
        }
    });

    return parts.length > 0 ? 'Finding context:\n' + parts.join('\n') : '';
}

function buildUserPrompt({ action, content, context, targetField, options }) {
    var parts = [];

    // Add finding context
    var contextStr = buildContextString(context);
    if (contextStr) {
        parts.push(contextStr);
    }

    // Add target field info
    if (targetField) {
        parts.push('Target field: ' + targetField);
    }

    // Add current content
    if (content) {
        parts.push('Current content:\n' + content);
    }

    // Add user instruction (Tier 3)
    if (options && options.userPrompt) {
        parts.push('User instruction: ' + options.userPrompt);
    }

    return parts.join('\n\n');
}

module.exports = {
    BUILTIN_PROMPTS,
    getBuiltinPrompt,
    buildSystemPrompt,
    buildContextString,
    buildUserPrompt
};
