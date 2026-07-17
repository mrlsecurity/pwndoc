const {
    computeQaIssueKey,
    computeVulnerabilityQaFingerprint,
    computeAllVulnerabilitiesQaFingerprint,
    computeVulnerabilityQaCatalogFingerprint,
    getCachedVulnerabilityQaReport,
    buildVulnerabilityQaReportCache,
    isStoredReportCurrentForScope,
    getCatalogIssuesForVulnerability,
    buildCatalogSliceForVulnerability,
    assembleAllVulnerabilitiesQaReport
} = require('../src/lib/ai-vuln-qa-cache');

module.exports = function() {
    describe('AI vulnerability QA cache', () => {
        const locale = 'en-US';
        const vulnerability = {
            _id: 'vuln-1',
            category: 'Web',
            cvssv3: '5.0',
            details: [{
                locale: locale,
                title: 'Missing HSTS',
                description: '<p>No HSTS header</p>',
                observation: '<p>Observed on login</p>',
                remediation: '<p>Enable HSTS</p>',
                references: ['https://example.com']
            }]
        };

        const buildStoredReport = (fingerprint, summary = 'Cached summary') => {
            return buildVulnerabilityQaReportCache(fingerprint, {
                summary: summary,
                issues: [{
                    severity: 'warning',
                    category: 'completeness',
                    title: 'Cached issue',
                    message: 'Still valid',
                    location: 'vulnerability:Missing HSTS',
                    source: 'structural'
                }],
                aiAnalysis: false,
                provider: null,
                model: null,
                counts: {
                    total: 1,
                    error: 0,
                    warning: 1,
                    info: 0
                }
            }, {
                locale: locale,
                mode: 'single',
                vulnerabilityId: 'vuln-1',
                title: 'Missing HSTS'
            });
        };

        it('should return cached single-vulnerability QA when the fingerprint matches', () => {
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const cached = getCachedVulnerabilityQaReport({
                ...vulnerability,
                qaReports: [buildStoredReport(fingerprint)]
            }, locale);

            expect(cached).toEqual(expect.objectContaining({
                cached: true,
                mode: 'single',
                title: 'Missing HSTS',
                summary: 'Cached summary'
            }));
        });

        it('should invalidate single-vulnerability QA when content changes', () => {
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const changed = {
                ...vulnerability,
                details: [{
                    ...vulnerability.details[0],
                    remediation: '<p>Enable HSTS with preload</p>'
                }],
                qaReports: [buildStoredReport(fingerprint)]
            };

            expect(getCachedVulnerabilityQaReport(changed, locale)).toBeNull();
        });

        it('should keep fingerprints stable when custom-field definitions are populated', () => {
            const unpopulated = {
                ...vulnerability,
                details: [{
                    ...vulnerability.details[0],
                    customFields: [{
                        customField: '507f1f77bcf86cd799439011',
                        text: '<p>Publicly reachable</p>'
                    }]
                }]
            };
            const populated = {
                ...unpopulated,
                details: [{
                    ...unpopulated.details[0],
                    customFields: [{
                        customField: {
                            _id: '507f1f77bcf86cd799439011',
                            label: 'Aggravating Factors',
                            fieldType: 'text'
                        },
                        text: '<p>Publicly reachable</p>'
                    }]
                }]
            };

            const fingerprint = computeVulnerabilityQaFingerprint(unpopulated, locale);
            expect(computeVulnerabilityQaFingerprint(populated, locale)).toBe(fingerprint);
            expect(computeAllVulnerabilitiesQaFingerprint([populated], locale))
                .toBe(computeAllVulnerabilitiesQaFingerprint([unpopulated], locale));

            const report = assembleAllVulnerabilitiesQaReport({
                vulnerabilities: [{
                    ...populated,
                    qaReports: [buildStoredReport(fingerprint)]
                }],
                locale: locale,
                catalogDoc: null
            });
            expect(report.templates[0].outdated).toBe(false);

            const changed = {
                ...populated,
                details: [{
                    ...populated.details[0],
                    customFields: [{
                        ...populated.details[0].customFields[0],
                        text: '<p>Publicly reachable without authentication</p>'
                    }]
                }]
            };
            expect(computeVulnerabilityQaFingerprint(changed, locale)).not.toBe(fingerprint);
        });

        it('should gate stored-report reuse on scope timestamps', () => {
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const programmaticOnly = buildVulnerabilityQaReportCache(fingerprint, {
                summary: '',
                issues: [],
                counts: { total: 0, error: 0, warning: 0, info: 0 }
            }, { locale, mode: 'single' }, { scope: 'programmatic' });

            expect(isStoredReportCurrentForScope(programmaticOnly, fingerprint, 'programmatic')).toBe(true);
            expect(isStoredReportCurrentForScope(programmaticOnly, fingerprint, 'ai')).toBe(false);
            expect(isStoredReportCurrentForScope(programmaticOnly, fingerprint, 'all')).toBe(false);
            expect(isStoredReportCurrentForScope(programmaticOnly, 'other-fingerprint', 'programmatic')).toBe(false);

            const fullRun = buildVulnerabilityQaReportCache(fingerprint, {
                summary: '',
                issues: [],
                counts: { total: 0, error: 0, warning: 0, info: 0 }
            }, { locale, mode: 'single' }, { scope: 'all' });
            expect(isStoredReportCurrentForScope(fullRun, fingerprint, 'all')).toBe(true);
        });

        it('should change the catalog fingerprint when another locale is retitled', () => {
            const before = computeVulnerabilityQaCatalogFingerprint([vulnerability], locale);
            const retitledInFrench = {
                ...vulnerability,
                details: [
                    vulnerability.details[0],
                    { locale: 'fr-FR', title: 'HSTS manquant', description: '<p>x</p>' }
                ]
            };
            const after = computeVulnerabilityQaCatalogFingerprint([retitledInFrench], locale);

            expect(before).not.toBe(after);
            // The target-locale fingerprint must NOT change: fr content is invisible to it.
            expect(computeAllVulnerabilitiesQaFingerprint([vulnerability], locale))
                .toBe(computeAllVulnerabilitiesQaFingerprint([retitledInFrench], locale));
        });

        it('should slice catalog issues by vulnerability id', () => {
            const catalogDoc = {
                fingerprint: 'fp',
                ranAt: new Date(),
                programmaticRanAt: new Date(),
                issues: [
                    { severity: 'error', category: 'duplicates', title: 'Dup', message: 'a/b', location: 'vulnerability:A', source: 'structural', vulnerabilityIds: ['vuln-1', 'vuln-2'] },
                    { severity: 'warning', category: 'aiDuplicates', title: 'Dup?', message: 'b/c', location: 'vulnerability:B', source: 'ai', vulnerabilityIds: ['vuln-2', 'vuln-3'] }
                ]
            };

            expect(getCatalogIssuesForVulnerability(catalogDoc, 'vuln-1')).toHaveLength(1);
            expect(getCatalogIssuesForVulnerability(catalogDoc, 'vuln-2')).toHaveLength(2);
            expect(getCatalogIssuesForVulnerability(catalogDoc, 'vuln-9')).toHaveLength(0);

            const slice = buildCatalogSliceForVulnerability(catalogDoc, [vulnerability], locale, 'vuln-1');
            expect(slice.issues).toHaveLength(1);
            expect(slice.outdated).toBe(true); // 'fp' cannot match the computed fingerprint
        });

        it('should assemble the all-vulnerabilities report from per-template entries and the catalog', () => {
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const other = {
                _id: 'vuln-2',
                category: 'Web',
                details: [{
                    locale: locale,
                    title: 'Weak TLS',
                    description: '<p>TLS 1.0 enabled</p>'
                }]
            };

            const report = assembleAllVulnerabilitiesQaReport({
                vulnerabilities: [
                    { ...vulnerability, qaReports: [buildStoredReport(fingerprint)] },
                    other // never checked
                ],
                locale: locale,
                catalogDoc: {
                    fingerprint: 'stale',
                    ranAt: new Date(),
                    programmaticRanAt: new Date(),
                    issues: [{
                        severity: 'error',
                        category: 'duplicates',
                        title: 'Duplicate vulnerability title',
                        message: 'dup',
                        location: 'vulnerability:Missing HSTS',
                        source: 'structural',
                        vulnerabilityIds: ['vuln-1', 'vuln-2']
                    }]
                }
            });

            expect(report.hasReport).toBe(true);
            expect(report.mode).toBe('all');
            expect(report.vulnerabilityCount).toBe(2);
            expect(report.checkedCount).toBe(1);
            expect(report.outdated).toBe(true);
            expect(report.counts.total).toBe(2);
            expect(report.templates).toHaveLength(2);
            expect(report.templates.find((row) => row.vulnerabilityId === 'vuln-1')).toEqual(
                expect.objectContaining({ hasReport: true, outdated: false })
            );
            expect(report.templates.find((row) => row.vulnerabilityId === 'vuln-2')).toEqual(
                expect.objectContaining({ hasReport: false })
            );
            expect(report.catalog.issues).toHaveLength(1);
            expect(report.catalog.outdated).toBe(true);
        });

        it('should compute stable issue keys independent of message and id order', () => {
            const base = {
                category: 'duplicates',
                title: 'Dup',
                location: 'vulnerability:A',
                message: 'one',
                vulnerabilityIds: ['b', 'a']
            };

            expect(computeQaIssueKey(base))
                .toBe(computeQaIssueKey({ ...base, message: 'two', vulnerabilityIds: ['a', 'b'] }));
            expect(computeQaIssueKey(base))
                .not.toBe(computeQaIssueKey({ ...base, vulnerabilityIds: ['a', 'c'] }));
        });

        it('should mark dismissed issues and exclude them from counts', () => {
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const stored = buildStoredReport(fingerprint);
            const issueKey = computeQaIssueKey(stored.issues[0]);
            const catalogIssue = {
                severity: 'error',
                category: 'duplicates',
                title: 'Duplicate vulnerability title',
                message: 'dup',
                location: 'vulnerability:Missing HSTS',
                source: 'structural',
                vulnerabilityIds: ['vuln-1', 'vuln-2']
            };

            const report = assembleAllVulnerabilitiesQaReport({
                vulnerabilities: [{
                    ...vulnerability,
                    qaReports: [stored],
                    qaDismissals: [{
                        locale: locale,
                        key: issueKey,
                        fingerprint: fingerprint,
                        dismissedAt: new Date(),
                        dismissedBy: 'admin'
                    }]
                }],
                locale: locale,
                catalogDoc: {
                    fingerprint: 'stale',
                    ranAt: new Date(),
                    programmaticRanAt: new Date(),
                    issues: [catalogIssue],
                    dismissals: [{
                        key: computeQaIssueKey(catalogIssue),
                        dismissedAt: new Date(),
                        dismissedBy: 'admin'
                    }]
                }
            });

            expect(report.templates[0].issues[0]).toEqual(
                expect.objectContaining({ key: issueKey, dismissed: true })
            );
            expect(report.catalog.issues[0].dismissed).toBe(true);
            expect(report.counts.total).toBe(0);
            expect(report.dismissedCount).toBe(2);
        });

        it('should ignore template dismissals recorded against older content', () => {
            const fingerprint = computeVulnerabilityQaFingerprint(vulnerability, locale);
            const stored = buildStoredReport(fingerprint);
            const issueKey = computeQaIssueKey(stored.issues[0]);

            const report = assembleAllVulnerabilitiesQaReport({
                vulnerabilities: [{
                    ...vulnerability,
                    qaReports: [stored],
                    qaDismissals: [{
                        locale: locale,
                        key: issueKey,
                        fingerprint: 'stale-fingerprint',
                        dismissedAt: new Date(),
                        dismissedBy: 'admin'
                    }]
                }],
                locale: locale,
                catalogDoc: null
            });

            expect(report.templates[0].issues[0].dismissed).toBe(false);
            expect(report.counts.total).toBe(1);
            expect(report.dismissedCount).toBe(0);
        });

        it('should return null when nothing has been checked', () => {
            expect(assembleAllVulnerabilitiesQaReport({
                vulnerabilities: [vulnerability],
                locale: locale,
                catalogDoc: null
            })).toBeNull();
        });
    });
};
