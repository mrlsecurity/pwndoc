const {
    normalizeQaChecks,
    isQaCheckEnabled,
    hasEnabledAiQaChecks,
    hasEnabledQaChecks,
    validateQaChecksPayload,
    filterAiIssuesByEnabledChecks,
    mergeQaIssues,
    finalizeMergedQaResult,
    normalizeQaScope
} = require('../src/lib/ai-qa-checks');

module.exports = function() {
    describe('AI QA check toggles', () => {
        it('should default all QA checks to enabled', () => {
            const checks = normalizeQaChecks({});
            expect(checks.completeness).toBe(true);
            expect(checks.references).toBe(true);
            expect(checks.imageCaptions).toBe(true);
            expect(checks.duplicates).toBe(true);
            expect(checks.aiDuplicates).toBe(true);
            expect(checks.aiUnlinkedTranslations).toBe(true);
            expect(checks.redaction).toBe(true);
            expect(checks.customer).toBe(true);
            expect(checks.instructions).toBe(true);
        });

        it('should normalize disabled QA checks', () => {
            const checks = normalizeQaChecks({
                completeness: false,
                references: false
            });

            expect(checks.completeness).toBe(false);
            expect(checks.references).toBe(false);
            expect(checks.redaction).toBe(true);
        });

        it('should detect whether AI QA checks are enabled', () => {
            expect(hasEnabledAiQaChecks({
                completeness: true,
                references: true,
                redaction: false,
                customer: false,
                instructions: false
            })).toBe(false);

            expect(hasEnabledAiQaChecks({
                redaction: true
            })).toBe(true);
        });

        it('should validate QA check payloads', () => {
            expect(validateQaChecksPayload({ completeness: false }).valid).toBe(true);
            expect(validateQaChecksPayload({ unknown: true }).valid).toBe(false);
            expect(validateQaChecksPayload({ customer: 'yes' }).valid).toBe(false);
        });

        it('should filter AI issues by enabled checks', () => {
            const issues = filterAiIssuesByEnabledChecks([
                { category: 'customer', title: 'A', message: 'B', location: 'general' },
                { category: 'redaction', title: 'C', message: 'D', location: 'general' }
            ], {
                customer: true,
                redaction: false
            });

            expect(issues).toHaveLength(1);
            expect(issues[0].category).toBe('customer');
        });

        it('should report when no QA checks are enabled', () => {
            expect(hasEnabledQaChecks({
                completeness: false,
                references: false,
                imageCaptions: false,
                duplicates: false,
                aiDuplicates: false,
                aiUnlinkedTranslations: false,
                redaction: false,
                customer: false,
                instructions: false
            })).toBe(false);
            expect(isQaCheckEnabled({ completeness: false }, 'completeness')).toBe(false);
        });

        it('should normalize supported QA scopes', () => {
            expect(normalizeQaScope('programmatic')).toBe('programmatic');
            expect(normalizeQaScope('AI')).toBe('ai');
            expect(normalizeQaScope('invalid')).toBeNull();
        });

        it('should merge programmatic issues while keeping AI issues', () => {
            const existing = [
                { title: 'Old AI', source: 'ai', severity: 'warning', category: 'redaction', message: 'x', location: 'report' },
                { title: 'Old structural', source: 'structural', severity: 'error', category: 'completeness', message: 'y', location: 'report' }
            ];
            const incoming = [
                { title: 'New structural', source: 'structural', severity: 'warning', category: 'references', message: 'z', location: 'report' }
            ];

            const merged = mergeQaIssues(existing, incoming, 'programmatic');
            expect(merged).toHaveLength(2);
            expect(merged.map((issue) => issue.title)).toEqual(['Old AI', 'New structural']);
        });

        it('should keep programmatic issues when merging AI results', () => {
            const existing = [
                { title: 'Old structural', source: 'structural', severity: 'error', category: 'completeness', message: 'y', location: 'report' }
            ];
            const incoming = [
                { title: 'New AI', source: 'ai', severity: 'warning', category: 'redaction', message: 'x', location: 'report' }
            ];

            const merged = mergeQaIssues(existing, incoming, 'ai');
            expect(merged).toHaveLength(2);
            expect(merged.map((issue) => issue.title)).toEqual(['Old structural', 'New AI']);
        });

        it('should finalize merged QA results with updated counts', () => {
            const merged = finalizeMergedQaResult({}, {
                summary: 'Updated',
                aiAnalysis: true,
                provider: 'openai',
                model: 'gpt-test'
            }, [
                { title: 'Issue', source: 'structural', severity: 'error', category: 'completeness', message: 'x', location: 'report' }
            ]);

            expect(merged.summary).toBe('Updated');
            expect(merged.counts.total).toBe(1);
            expect(merged.aiAnalysis).toBe(true);
        });
    });
};
