const {
    buildVulnerabilityCatalog,
    normalizeAiDuplicateIssues,
    buildDuplicateBatches,
    normalizeTypeKey,
    TYPE_BATCH_CEILING
} = require('../src/lib/ai-vuln-duplicate-ai');

module.exports = function() {
    describe('AI vulnerability duplicate detection', () => {
        const vulnerabilities = [
            {
                _id: 'vuln-1',
                details: [{
                    locale: 'en',
                    title: 'Blind SQL Injection in Authentication',
                    vulnType: 'Injection',
                    description: '<p>SQL injection in login form.</p>',
                    observation: '<p>Found during testing.</p>',
                    remediation: '<p>Use parameterized queries.</p>'
                }]
            },
            {
                _id: 'vuln-2',
                details: [{
                    locale: 'en',
                    title: 'SQLi on Login Page',
                    vulnType: 'Injection',
                    description: '<p>SQL injection in login form.</p>',
                    observation: '<p>Found during testing.</p>',
                    remediation: '<p>Use parameterized queries.</p>'
                }]
            },
            {
                _id: 'vuln-3',
                details: [{
                    locale: 'en',
                    title: 'Reflected XSS',
                    vulnType: 'XSS',
                    description: '<p>XSS in search.</p>',
                    observation: '<p>Found during testing.</p>',
                    remediation: '<p>Encode output.</p>'
                }]
            },
            {
                _id: 'vuln-4',
                details: [{
                    locale: 'en',
                    title: 'Stored XSS',
                    vulnType: 'XSS',
                    description: '<p>XSS in profile.</p>',
                    observation: '<p>Found during testing.</p>',
                    remediation: '<p>Encode output.</p>'
                }]
            },
            {
                _id: 'vuln-5',
                details: [{
                    locale: 'en',
                    title: 'Missing Header',
                    vulnType: '',
                    description: '<p>No CSP.</p>',
                    observation: '<p>Found during testing.</p>',
                    remediation: '<p>Add header.</p>'
                }]
            }
        ];

        it('should build a vulnerability catalog for a locale', () => {
            const catalog = buildVulnerabilityCatalog(vulnerabilities, 'en');
            expect(catalog).toHaveLength(5);
            expect(catalog[0].title).toBe('Blind SQL Injection in Authentication');
        });

        it('should batch the catalog by vulnerability type', () => {
            const catalog = buildVulnerabilityCatalog(vulnerabilities, 'en');
            const batches = buildDuplicateBatches(catalog);

            expect(batches).toHaveLength(2);
            expect(batches.every((batch) => batch.length >= 2)).toBe(true);

            const injectionBatch = batches.find((batch) => batch[0].vulnType === 'Injection');
            const xssBatch = batches.find((batch) => batch[0].vulnType === 'XSS');
            expect(injectionBatch).toHaveLength(2);
            expect(xssBatch).toHaveLength(2);
            expect(batches.some((batch) => normalizeTypeKey(batch[0].vulnType) === '(no type)')).toBe(false);
        });

        it('should split oversized type groups into ceiling-sized batches', () => {
            const oversized = Array.from({ length: TYPE_BATCH_CEILING + 10 }, (_, index) => ({
                vulnerabilityId: `v-${index}`,
                title: `XSS ${index}`,
                vulnType: 'XSS',
                category: 'Web',
                description: 'x',
                observation: 'y',
                remediation: 'z'
            }));

            const batches = buildDuplicateBatches(oversized);
            expect(batches.length).toBeGreaterThan(1);
            expect(batches.every((batch) => batch.length <= TYPE_BATCH_CEILING)).toBe(true);
            expect(batches.every((batch) => batch.length >= 2)).toBe(true);
        });

        it('should normalize AI duplicate issues with related templates', () => {
            const catalog = buildVulnerabilityCatalog(vulnerabilities, 'en');
            const catalogById = new Map(catalog.map((entry) => [entry.vulnerabilityId, entry]));
            const catalogByTitle = new Map(catalog.map((entry) => [entry.title.toLowerCase(), entry]));

            const issues = normalizeAiDuplicateIssues([
                {
                    severity: 'warning',
                    title: 'Likely duplicate vulnerability',
                    message: 'Both templates describe SQL injection in the login form.',
                    vulnerabilityId: 'vuln-1',
                    templateTitle: 'Blind SQL Injection in Authentication',
                    relatedTemplates: [{
                        vulnerabilityId: 'vuln-2',
                        title: 'SQLi on Login Page',
                        reason: 'Both describe SQL injection in the login form.'
                    }]
                }
            ], {
                catalogById: catalogById,
                catalogByTitle: catalogByTitle
            });

            expect(issues).toHaveLength(1);
            expect(issues[0].category).toBe('aiDuplicates');
            expect(issues[0].source).toBe('ai');
            expect(issues[0].message).toContain('SQLi on Login Page');
        });

        it('should filter AI duplicate issues to a target vulnerability', () => {
            const catalog = buildVulnerabilityCatalog(vulnerabilities, 'en');
            const catalogById = new Map(catalog.map((entry) => [entry.vulnerabilityId, entry]));
            const catalogByTitle = new Map(catalog.map((entry) => [entry.title.toLowerCase(), entry]));

            const issues = normalizeAiDuplicateIssues([
                {
                    severity: 'warning',
                    title: 'Likely duplicate vulnerability',
                    vulnerabilityId: 'vuln-1',
                    templateTitle: 'Blind SQL Injection in Authentication',
                    relatedTemplates: [{
                        vulnerabilityId: 'vuln-2',
                        title: 'SQLi on Login Page'
                    }]
                }
            ], {
                targetVulnerabilityId: 'vuln-2',
                catalogById: catalogById,
                catalogByTitle: catalogByTitle
            });

            expect(issues).toHaveLength(1);
            expect(issues[0].location).toBe('vulnerability:SQLi on Login Page');
        });
    });
};
