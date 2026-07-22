const {
    normalizeQaInstructions,
    resolveQaInstructionsForRequest,
    getQaInstructionsText,
    validateQaInstructionsPayload
} = require('../src/lib/ai-qa-instructions');

module.exports = function() {
    describe('AI QA instructions', () => {
        it('should normalize instruction content', () => {
            const normalized = normalizeQaInstructions({ content: 'Verify executive summary tone.' });
            expect(normalized.content).toBe('Verify executive summary tone.');
        });

        it('should resolve inline instructions for AI requests', () => {
            const resolved = resolveQaInstructionsForRequest({
                ai: {
                    public: {
                        qaInstructions: {
                            content: 'Check customer naming consistency.'
                        }
                    }
                }
            });

            expect(getQaInstructionsText(resolved)).toBe('Check customer naming consistency.');
        });

        it('should validate inline instruction payloads', () => {
            const validation = validateQaInstructionsPayload({
                content: 'Check customer naming consistency.'
            });

            expect(validation.valid).toBe(true);
        });

        it('should reject non-string instruction content', () => {
            const validation = validateQaInstructionsPayload({
                content: 42
            });

            expect(validation.valid).toBe(false);
        });
    });
};
