const {
    compactLlmValue,
    stringifyLlmPayload
} = require('../src/lib/ai-qa-shared');

module.exports = function() {
    describe('LLM payload compaction', () => {
        it('should omit empty fields and nested empty sections', () => {
            const compacted = compactLlmValue({
                task: 'duplicate',
                locale: 'en',
                mode: 'all',
                target: null,
                enabledChecks: {
                    completeness: true,
                    redaction: false
                },
                templates: [
                    {
                        vulnerabilityId: '1',
                        title: 'SQLi',
                        vulnType: 'Injection',
                        category: '',
                        description: 'Login form.',
                        observation: '   ',
                        remediation: '',
                        references: [],
                        meta: {}
                    },
                    {
                        vulnerabilityId: '2',
                        title: '',
                        description: ''
                    }
                ]
            });

            expect(compacted).toEqual({
                task: 'duplicate',
                locale: 'en',
                mode: 'all',
                enabledChecks: {
                    completeness: true
                },
                templates: [
                    {
                        vulnerabilityId: '1',
                        title: 'SQLi',
                        vulnType: 'Injection',
                        description: 'Login form.'
                    }
                ]
            });
        });

        it('should stringify without whitespace padding', () => {
            const payload = stringifyLlmPayload({
                task: 'qa',
                notes: '',
                items: [{ id: 1, empty: null }]
            });

            expect(payload).toBe('{"task":"qa","items":[{"id":1}]}');
        });
    });
};
