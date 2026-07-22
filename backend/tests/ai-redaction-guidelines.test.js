const {
    normalizeRedactionGuidelines,
    resolveRedactionGuidelinesForRequest,
    getRedactionGuidelinesText,
    appendRedactionGuidelinesToSystemPrompt,
    validateRedactionGuidelinesPayload
} = require('../src/lib/ai-redaction-guidelines');

module.exports = function() {
    describe('AI redaction guidelines', () => {
        it('should normalize guideline content', () => {
            const normalized = normalizeRedactionGuidelines({ content: 'Never include client names.' });
            expect(normalized.content).toBe('Never include client names.');
        });

        it('should resolve inline guidelines for AI requests', () => {
            const resolved = resolveRedactionGuidelinesForRequest({
                ai: {
                    public: {
                        redactionGuidelines: {
                            content: 'Use neutral wording.'
                        }
                    }
                }
            });

            expect(getRedactionGuidelinesText(resolved)).toBe('Use neutral wording.');
        });

        it('should append inline guidelines to the system prompt', () => {
            const resolved = resolveRedactionGuidelinesForRequest({
                ai: {
                    public: {
                        redactionGuidelines: {
                            content: 'Redact credentials.'
                        }
                    }
                }
            });

            const systemPrompt = appendRedactionGuidelinesToSystemPrompt('Base prompt.', resolved);
            expect(systemPrompt).toContain('Base prompt.');
            expect(systemPrompt).toContain('Redact credentials.');
        });

        it('should validate inline guideline payloads', () => {
            const validation = validateRedactionGuidelinesPayload({
                content: 'Use neutral wording.'
            });

            expect(validation.valid).toBe(true);
        });

        it('should reject non-string guideline content', () => {
            const validation = validateRedactionGuidelinesPayload({
                content: 42
            });

            expect(validation.valid).toBe(false);
        });
    });
};
