var OpenAI = require('openai');
var Settings = require('mongoose').model('Settings');

async function getClient() {
    var settings = await Settings.getAll();
    var aiSettings = settings.ai;

    if (!aiSettings || !aiSettings.enabled) {
        throw new Error('AI integration is disabled');
    }

    var provider = aiSettings.private && aiSettings.private.provider;
    if (!provider) {
        throw new Error('AI provider not configured');
    }

    var apiKey = provider.apiKey || process.env.AI_API_KEY;
    if (!apiKey) {
        throw new Error('AI API key not configured. Set it in Settings or via AI_API_KEY environment variable');
    }

    return new OpenAI({
        baseURL: provider.baseURL || 'https://api.openai.com/v1',
        apiKey: apiKey
    });
}

async function getModel() {
    var settings = await Settings.getAll();
    var provider = settings.ai && settings.ai.private && settings.ai.private.provider;
    return (provider && provider.model) || 'gpt-4o-mini';
}

async function complete({ systemPrompt, userPrompt, temperature }) {
    var client = await getClient();
    var model = await getModel();

    var response = await client.chat.completions.create({
        model: model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: temperature ?? 0.3
    });

    return response.choices[0].message.content;
}

function getApiKeySource() {
    // Computed at read time, not stored
    if (process.env.AI_API_KEY) return 'env';
    return 'none';
}

module.exports = {
    complete,
    getApiKeySource
};
