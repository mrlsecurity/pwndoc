const {
    MASKED_SECRET,
    sanitizeSettingsForClient,
    mergeSettingsSecrets
} = require('../src/lib/settings-secrets');

module.exports = function() {
    describe('Settings secrets', () => {
        const buildSettings = (openaiApiKey) => ({
            ai: {
                private: {
                    openaiApiKey: openaiApiKey,
                    anthropicApiKey: ''
                },
                public: { enabled: true }
            }
        });

        describe('sanitizeSettingsForClient', () => {
            it('masks a configured secret and flags it as configured', () => {
                const sanitized = sanitizeSettingsForClient(buildSettings('super-secret-key'));

                expect(sanitized.ai.private.openaiApiKey).toBe('');
                expect(sanitized.ai.private.openaiApiKeyConfigured).toBe(true);
            });

            it('flags an unconfigured secret as not configured', () => {
                const sanitized = sanitizeSettingsForClient(buildSettings(''));

                expect(sanitized.ai.private.openaiApiKey).toBe('');
                expect(sanitized.ai.private.openaiApiKeyConfigured).toBe(false);
            });
        });

        describe('mergeSettingsSecrets', () => {
            it('keeps the existing secret when the client resends the masked sentinel', () => {
                const existing = buildSettings('persisted-key');
                const incoming = buildSettings(MASKED_SECRET);

                const merged = mergeSettingsSecrets(incoming, existing);

                expect(merged.ai.private.openaiApiKey).toBe('persisted-key');
            });

            it('clears the stored secret when the client submits an empty value', () => {
                const existing = buildSettings('persisted-key');
                const incoming = buildSettings('');

                const merged = mergeSettingsSecrets(incoming, existing);

                expect(merged.ai.private.openaiApiKey).toBe('');
            });

            it('sets a new secret when the client submits a different value', () => {
                const existing = buildSettings('old-key');
                const incoming = buildSettings('new-key');

                const merged = mergeSettingsSecrets(incoming, existing);

                expect(merged.ai.private.openaiApiKey).toBe('new-key');
            });
        });
    });
};
