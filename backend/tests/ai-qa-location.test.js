const {
    formatFindingLocation,
    resolveIssueLocation,
    normalizeAiIssueLocation,
    normalizeIssueLocations,
    attachFindingIdToLocation,
    attachFindingIdsToIssueLocations
} = require('../src/lib/ai-qa-location');

module.exports = function() {
    describe('AI QA issue locations', () => {
        const findings = [{
            identifier: 2,
            title: 'SQL Injection'
        }];

        it('should use finding titles in locations', () => {
            expect(formatFindingLocation(findings[0])).toBe('finding:SQL Injection');
        });

        it('should remap legacy IDX locations to finding titles', () => {
            expect(resolveIssueLocation('finding:IDX-002/references', findings))
                .toBe('finding:SQL Injection/references');
        });

        it('should normalize issue locations before returning QA results', () => {
            const issues = normalizeIssueLocations([
                {
                    category: 'instructions',
                    location: 'finding:IDX-002',
                    title: 'Tone issue',
                    message: 'Executive summary wording is off.'
                }
            ], findings);

            expect(issues[0].location).toBe('finding:SQL Injection');
        });

        it('should normalize AI field path locations to canonical finding locations', () => {
            expect(normalizeAiIssueLocation('field path: finding.references', {
                entityPrefix: 'finding',
                defaultTitle: 'SQL Injection'
            })).toBe('finding:SQL Injection/references');
        });

        it('should normalize AI field path locations for vulnerability QA', () => {
            expect(normalizeAiIssueLocation('field path: finding.cvssv3', {
                entityPrefix: 'vulnerability',
                defaultTitle: 'Missing HSTS'
            })).toBe('vulnerability:Missing HSTS/cvssv3');
        });

        it('should keep field-only locations when no title is available', () => {
            expect(normalizeAiIssueLocation('field path: finding.category', {
                entityPrefix: 'finding'
            })).toBe('field:category');
        });

        it('should embed the finding id when the finding has one', () => {
            expect(formatFindingLocation({ _id: '507f1f77bcf86cd799439011', title: 'SQL Injection' }))
                .toBe('finding:507f1f77bcf86cd799439011::SQL Injection');
        });

        it('should attach a finding id to an AI location with a unique title match', () => {
            const findings = [{ _id: '507f1f77bcf86cd799439011', title: 'SQL Injection' }];
            expect(attachFindingIdToLocation('finding:SQL Injection/description', findings))
                .toBe('finding:507f1f77bcf86cd799439011::SQL Injection/description');
        });

        it('should leave an AI location unresolved when the title is ambiguous', () => {
            const findings = [
                { _id: '507f1f77bcf86cd799439011', title: 'SQL Injection' },
                { _id: '507f1f77bcf86cd799439012', title: 'SQL Injection' }
            ];
            expect(attachFindingIdToLocation('finding:SQL Injection/description', findings))
                .toBe('finding:SQL Injection/description');
        });

        it('should not touch a location that already carries a finding id', () => {
            const findings = [{ _id: '507f1f77bcf86cd799439099', title: 'SQL Injection' }];
            expect(attachFindingIdToLocation('finding:507f1f77bcf86cd799439011::SQL Injection', findings))
                .toBe('finding:507f1f77bcf86cd799439011::SQL Injection');
        });

        it('should attach finding ids across a batch of issues, leaving non-finding locations untouched', () => {
            const findings = [{ _id: '507f1f77bcf86cd799439011', title: 'SQL Injection' }];
            const issues = attachFindingIdsToIssueLocations([
                { title: 'A', location: 'finding:SQL Injection' },
                { title: 'B', location: 'general' }
            ], findings);

            expect(issues[0].location).toBe('finding:507f1f77bcf86cd799439011::SQL Injection');
            expect(issues[1].location).toBe('general');
        });
    });
};
