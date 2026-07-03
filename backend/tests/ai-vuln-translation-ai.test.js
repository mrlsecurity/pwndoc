const {
    buildUnlinkedTranslationCatalog,
    normalizeAiUnlinkedTranslationIssues
} = require('../src/lib/ai-vuln-translation-ai');

module.exports = function() {
    describe('AI vulnerability unlinked translation detection', () => {
        const vulnerabilities = [
            {
                _id: 'vuln-en',
                details: [{
                    locale: 'en',
                    title: 'Missing HTTPOnly Cookie Flag',
                    vulnType: 'Web Application',
                    description: '<p>Cookie without HTTPOnly.</p>',
                    observation: '<p>Observed on login.</p>',
                    remediation: '<p>Set HTTPOnly flag.</p>'
                }]
            },
            {
                _id: 'vuln-fr',
                details: [{
                    locale: 'fr',
                    title: 'Cookie sans attribut HTTPOnly',
                    vulnType: 'Application Web',
                    description: '<p>Cookie sans HTTPOnly.</p>',
                    observation: '<p>Observe sur la connexion.</p>',
                    remediation: '<p>Definir le flag HTTPOnly.</p>'
                }]
            },
            {
                _id: 'vuln-both',
                details: [
                    {
                        locale: 'en',
                        title: 'Already linked template',
                        description: '<p>English</p>'
                    },
                    {
                        locale: 'fr',
                        title: 'Modele deja lie',
                        description: '<p>Francais</p>'
                    }
                ]
            }
        ];

        it('should only include single-locale templates in the catalog', () => {
            const catalog = buildUnlinkedTranslationCatalog(vulnerabilities);
            expect(catalog).toHaveLength(2);
            expect(catalog.map((entry) => entry.vulnerabilityId).sort()).toEqual(['vuln-en', 'vuln-fr']);
        });

        it('should normalize AI unlinked translation issues with related templates', () => {
            const catalog = buildUnlinkedTranslationCatalog(vulnerabilities);
            const catalogById = new Map(catalog.map((entry) => [entry.vulnerabilityId, entry]));

            const issues = normalizeAiUnlinkedTranslationIssues([
                {
                    severity: 'warning',
                    title: 'Unlinked translation',
                    vulnerabilityId: 'vuln-en',
                    templateTitle: 'Missing HTTPOnly Cookie Flag',
                    locale: 'en',
                    relatedTemplates: [{
                        vulnerabilityId: 'vuln-fr',
                        title: 'Cookie sans attribut HTTPOnly',
                        locale: 'fr',
                        reason: 'Both describe the same cookie hardening issue.'
                    }]
                }
            ], {
                catalogById: catalogById
            });

            expect(issues).toHaveLength(1);
            expect(issues[0].category).toBe('aiUnlinkedTranslations');
            expect(issues[0].message).toContain('Cookie sans attribut HTTPOnly');
            expect(issues[0].message).toContain('separate records');
        });

        it('should filter AI unlinked translation issues to a target vulnerability', () => {
            const catalog = buildUnlinkedTranslationCatalog(vulnerabilities);
            const catalogById = new Map(catalog.map((entry) => [entry.vulnerabilityId, entry]));

            const issues = normalizeAiUnlinkedTranslationIssues([
                {
                    severity: 'warning',
                    title: 'Unlinked translation',
                    vulnerabilityId: 'vuln-en',
                    templateTitle: 'Missing HTTPOnly Cookie Flag',
                    relatedTemplates: [{
                        vulnerabilityId: 'vuln-fr',
                        title: 'Cookie sans attribut HTTPOnly'
                    }]
                }
            ], {
                targetVulnerabilityId: 'vuln-fr',
                catalogById: catalogById
            });

            expect(issues).toHaveLength(1);
            expect(issues[0].location).toContain('Cookie sans attribut HTTPOnly');
        });
    });
};
