const {
    runDuplicateChecks,
    runVulnerabilityStructuralChecks,
    getVulnerabilityDetail,
    formatVulnerabilityLocation,
    buildVulnerabilitySnapshot,
    runAllVulnerabilitiesQa
} = require('../src/lib/ai-vuln-qa');

module.exports = function() {
    describe('AI vulnerability QA', () => {
        const sampleVulnerabilities = [
            {
                _id: 'vuln-1',
                status: 0,
                category: 'Web',
                details: [{
                    locale: 'en',
                    title: 'SQL Injection',
                    description: '<p>SQLi in login form.</p>',
                    observation: '<p>Observed during testing.</p>',
                    remediation: '<p>Use parameterized queries.</p>',
                    references: ['https://example.com/a', 'https://example.com/shared']
                }]
            },
            {
                _id: 'vuln-2',
                status: 1,
                details: [{
                    locale: 'en',
                    title: 'sql injection',
                    description: '<p>Different content.</p>',
                    observation: '<p>Other observation.</p>',
                    remediation: '<p>Other remediation.</p>',
                    references: ['https://example.com/shared']
                }]
            },
            {
                _id: 'vuln-3',
                status: 0,
                details: [{
                    locale: 'en',
                    title: 'Stored XSS',
                    description: '<p>SQLi in login form.</p>',
                    observation: '<p>Observed during testing.</p>',
                    remediation: '<p>Use parameterized queries.</p>',
                    references: ['https://example.com/b']
                }]
            }
        ];

        it('should format vulnerability locations', () => {
            expect(formatVulnerabilityLocation('SQL Injection')).toBe('vulnerability:SQL Injection');
            expect(formatVulnerabilityLocation('SQL Injection', 'description'))
                .toBe('vulnerability:SQL Injection/description');
        });

        it('should resolve vulnerability detail for locale', () => {
            const detail = getVulnerabilityDetail(sampleVulnerabilities[0], 'en');
            expect(detail.title).toBe('SQL Injection');
        });

        it('should omit workflow status from template QA snapshots', () => {
            const snapshot = buildVulnerabilitySnapshot({
                status: 0,
                details: [{
                    locale: 'en',
                    title: 'Template Title',
                    description: '<p>Description</p>'
                }]
            }, {
                locale: 'en',
                title: 'Template Title',
                description: '<p>Description</p>'
            });

            expect(snapshot.type).toBe('vulnerability_template');
            expect(snapshot.status).toBeUndefined();
        });

        it('should flag duplicate titles and identical content', () => {
            const issues = runDuplicateChecks({
                vulnerabilities: sampleVulnerabilities,
                locale: 'en'
            });

            expect(issues.some((issue) => issue.title === 'Duplicate vulnerability title')).toBe(true);
            expect(issues.some((issue) => issue.title === 'Duplicate vulnerability content')).toBe(true);
            expect(issues.some((issue) => issue.category === 'aiDuplicates')).toBe(false);
        });

        it('should limit duplicate issues to a target vulnerability', () => {
            const issues = runDuplicateChecks({
                vulnerabilities: sampleVulnerabilities,
                locale: 'en',
                targetVulnerabilityId: 'vuln-1'
            });

            expect(issues.length).toBeGreaterThan(0);
            expect(issues.every((issue) => issue.location.includes('SQL Injection'))).toBe(true);
        });

        it('should flag missing core vulnerability fields', () => {
            const issues = runVulnerabilityStructuralChecks({
                details: [{ locale: 'en', title: 'Incomplete' }]
            }, {
                locale: 'en',
                title: 'Incomplete',
                description: '',
                observation: '',
                remediation: ''
            });

            expect(issues.some((issue) => /description/i.test(issue.title))).toBe(true);
            expect(issues.some((issue) => /remediation/i.test(issue.title))).toBe(true);
        });

        it('should batch programmatical checks across the vulnerability catalog', async () => {
            const result = await runAllVulnerabilitiesQa({
                vulnerabilities: sampleVulnerabilities,
                locale: 'en',
                settings: {
                    ai: {
                        public: {
                            qaChecks: {
                                completeness: true,
                                references: false,
                                imageCaptions: false,
                                duplicates: true,
                                aiDuplicates: false,
                                aiUnlinkedTranslations: false,
                                redaction: false,
                                customer: false,
                                instructions: false
                            }
                        }
                    }
                },
                provider: 'openai',
                scope: 'programmatic'
            });

            expect(result.mode).toBe('all');
            expect(result.vulnerabilityCount).toBe(3);
            expect(result.progress).toEqual({
                done: true,
                offset: 3,
                total: 3,
                processed: 3,
                phase: 'templates'
            });
            expect(result.issues.some((issue) => issue.category === 'duplicates')).toBe(true);
            expect(result.issues.some((issue) => issue.source === 'ai')).toBe(false);
        });

        it('should return partial progress for chunked catalog runs', async () => {
            const settings = {
                ai: {
                    public: {
                        qaChecks: {
                            completeness: true,
                            references: false,
                            imageCaptions: false,
                            duplicates: true,
                            aiDuplicates: false,
                            aiUnlinkedTranslations: false,
                            redaction: false,
                            customer: false,
                            instructions: false
                        }
                    }
                }
            };

            const first = await runAllVulnerabilitiesQa({
                vulnerabilities: sampleVulnerabilities,
                locale: 'en',
                settings,
                provider: 'openai',
                scope: 'programmatic',
                offset: 0,
                limit: 1
            });
            expect(first.progress).toEqual({
                done: false,
                offset: 1,
                total: 3,
                processed: 1,
                phase: 'templates',
                catalogBatch: 0,
                typeBatchCount: 0
            });
            expect(first.issues.some((issue) => issue.category === 'duplicates')).toBe(false);

            const mid = await runAllVulnerabilitiesQa({
                vulnerabilities: sampleVulnerabilities,
                locale: 'en',
                settings,
                provider: 'openai',
                scope: 'programmatic',
                offset: 1,
                limit: 2
            });
            expect(mid.progress).toEqual({
                done: false,
                offset: 3,
                total: 3,
                processed: 3,
                phase: 'templates',
                catalogBatch: 0,
                typeBatchCount: 0
            });
            expect(mid.issues.some((issue) => issue.category === 'duplicates')).toBe(false);

            const catalog = await runAllVulnerabilitiesQa({
                vulnerabilities: sampleVulnerabilities,
                locale: 'en',
                settings,
                provider: 'openai',
                scope: 'programmatic',
                offset: 3,
                limit: 1
            });
            expect(catalog.progress.done).toBe(true);
            expect(catalog.progress.phase).toBe('catalog');
            expect(catalog.progress.catalogBatch).toBe(0);
            expect(catalog.issues.some((issue) => issue.category === 'duplicates')).toBe(true);
        });
    });
};
