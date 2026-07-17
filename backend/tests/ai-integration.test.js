module.exports = function(request, app) {
    describe('AI integration API', () => {
        const Settings = require('mongoose').model('Settings');
        const Vulnerability = require('mongoose').model('Vulnerability');
        let adminToken = '';
        let userToken = '';
        let noAiToken = '';

        const login = async (username, password) => {
            const response = await request(app).post('/api/users/token').send({ username, password });
            expect(response.status).toBe(200);
            expect(response.body.datas.token).toBeDefined();
            return response.body.datas.token;
        };

        beforeAll(async () => {
            adminToken = await login('admin', 'Admin123');
            userToken = await login('user2', 'User1234');

            let response = await request(app).post('/api/data/roles')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    name: 'no-ai-integration',
                    displayName: 'No AI Integration',
                    allows: ['clients:read']
                });
            expect([201, 422]).toContain(response.status);

            response = await request(app).post('/api/users')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    username: 'noaiuser',
                    password: 'Noai1234',
                    firstname: 'No',
                    lastname: 'Ai',
                    roles: ['no-ai-integration']
                });
            expect([201, 422]).toContain(response.status);

            noAiToken = await login('noaiuser', 'Noai1234');

            await Settings.findOneAndUpdate({}, {
                $set: {
                    'ai.public.enabled': true,
                    'ai.public.redactionGuidelines.content': 'Secret redaction policy',
                    'ai.public.qaInstructions.content': 'Secret QA checklist',
                    'ai.public.qaChecks.redaction': false
                }
            }, { upsert: true });
        });

        beforeEach(async () => {
            await Settings.findOneAndUpdate({}, {
                $set: {
                    'ai.public.enabled': true,
                    'ai.public.redactionGuidelines.content': 'Secret redaction policy',
                    'ai.public.qaInstructions.content': 'Secret QA checklist',
                    'ai.public.qaChecks.redaction': false
                }
            }, { upsert: true });
        });

        it('should omit admin-only AI config from public settings', async () => {
            const response = await request(app).get('/api/settings/public')
                .set('Cookie', [`token=JWT ${userToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.datas.ai.public).toEqual({
                enabled: true,
                qaChecks: expect.objectContaining({
                    redaction: false,
                    aiDuplicates: true,
                    aiUnlinkedTranslations: true
                }),
                globalPrompts: []
            });
            expect(response.body.datas.ai.public).not.toHaveProperty('redactionGuidelines');
            expect(response.body.datas.ai.public).not.toHaveProperty('qaInstructions');
        });

        it('should deny AI integration config to users without ai read permissions', async () => {
            const response = await request(app).get('/api/data/ai-integration')
                .set('Cookie', [`token=JWT ${noAiToken}`]);

            expect(response.status).toBe(403);
        });

        it('should return redaction guidelines only for standard users', async () => {
            const response = await request(app).get('/api/data/ai-integration')
                .set('Cookie', [`token=JWT ${userToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.datas.redactionGuidelines.content).toBe('Secret redaction policy');
            expect(response.body.datas.promptMappings).toBeUndefined();
            expect(response.body.datas.qaInstructions).toBeUndefined();
            expect(response.body.datas.qaChecks).toBeUndefined();
        });

        it('should return enabled field prompts for users with ai-generate permission', async () => {
            const response = await request(app).get('/api/ai/enabled-fields?entityType=finding')
                .set('Cookie', [`token=JWT ${userToken}`]);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.datas.fields)).toBe(true);
            expect(response.body.datas.fields.some((field) => field.fieldKey === 'description')).toBe(true);
            expect(response.body.datas.fields[0]).toHaveProperty('prompt');
            expect(response.body.datas.redactionGuidelines).toBeUndefined();
            expect(response.body.datas.promptMappings).toBeUndefined();
        });

        it('should return full AI integration config for settings admins', async () => {
            const response = await request(app).get('/api/data/ai-integration')
                .set('Cookie', [`token=JWT ${adminToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.datas.redactionGuidelines.content).toBe('Secret redaction policy');
            expect(response.body.datas.qaInstructions.content).toBe('Secret QA checklist');
            expect(response.body.datas.qaChecks.redaction).toBe(false);
            expect(Array.isArray(response.body.datas.globalPrompts)).toBe(true);
        });

        it('should save and return global prompts for prompt admins', async () => {
            const globalPrompts = [{
                id: 'spellcheck',
                label: 'Spellcheck my document',
                prompt: 'Review the content for spelling and grammar issues.',
                enabled: true
            }, {
                id: 'translate-fr',
                label: 'Translate to french',
                prompt: 'Translate the content to French while preserving technical terms.',
                enabled: false
            }];

            let response = await request(app).put('/api/data/ai-integration')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ globalPrompts });

            expect(response.status).toBe(200);
            expect(response.body.datas.globalPrompts).toEqual(globalPrompts);

            response = await request(app).get('/api/data/ai-integration')
                .set('Cookie', [`token=JWT ${adminToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.datas.globalPrompts).toEqual(globalPrompts);
        });

        it('should run QA on a draft vulnerability template', async () => {
            await Settings.findOneAndUpdate({}, {
                $set: {
                    'ai.public.enabled': true,
                    'ai.public.qaChecks': {
                        completeness: true,
                        references: false,
                        imageCaptions: false,
                        duplicates: false,
                        aiDuplicates: false,
                        redaction: false,
                        customer: false,
                        instructions: false
                    }
                }
            }, { upsert: true });

            const response = await request(app).post('/api/ai/vulnerabilities/qa')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    locale: 'en',
                    scope: 'all',
                    vulnerability: {
                        category: 'Web',
                        details: [{
                            locale: 'en',
                            title: 'Draft Template',
                            description: '',
                            observation: '',
                            remediation: ''
                        }]
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body.datas.mode).toBe('single');
            expect(response.body.datas.cached).toBe(false);
            expect(Array.isArray(response.body.datas.issues)).toBe(true);
            expect(response.body.datas.issues.length).toBeGreaterThan(0);
        });

        it('should reject catalog-wide runs on the single-vulnerability endpoint', async () => {
            // The old chunked contract (scope without vulnerabilityId/draft) is gone;
            // catalog-wide runs go through the background job endpoints.
            const response = await request(app).post('/api/ai/vulnerabilities/qa')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    locale: 'en',
                    scope: 'all'
                });

            expect(response.status).toBe(422);
        });

        const setProgrammaticOnlyChecks = () => Settings.findOneAndUpdate({}, {
            $set: {
                'ai.public.enabled': true,
                'ai.public.qaChecks': {
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
        }, { upsert: true });

        const waitForQaJob = async (locale) => {
            for (let attempt = 0; attempt < 100; attempt++) {
                const response = await request(app).get(`/api/ai/vulnerabilities/qa/status?locale=${locale}`)
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);
                const job = response.body.datas.job;
                if (job && ['done', 'failed', 'cancelled'].includes(job.state))
                    return response.body.datas;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error('QA job did not finish in time');
        };

        it('should run catalog-wide QA as a background job and assemble the report from per-template results', async () => {
            await setProgrammaticOnlyChecks();

            await request(app).post('/api/vulnerabilities')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send([{
                    category: 'Web',
                    details: [{
                        locale: 'en',
                        title: 'Job Endpoint Target',
                        vulnType: 'Web',
                        description: '<p>content</p>',
                        observation: '',
                        remediation: ''
                    }]
                }]);

            const runResponse = await request(app).post('/api/ai/vulnerabilities/qa/run')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', scope: 'programmatic' });

            expect(runResponse.status).toBe(200);
            expect(runResponse.body.datas.alreadyRunning).toBe(false);
            expect(runResponse.body.datas.job).toEqual(expect.objectContaining({
                locale: 'en',
                scope: 'programmatic',
                state: expect.any(String)
            }));

            const status = await waitForQaJob('en');
            expect(status.job.state).toBe('done');
            expect(status.report.hasReport).toBe(true);
            expect(status.report.mode).toBe('all');
            expect(status.report.vulnerabilityCount).toBeGreaterThan(0);
            expect(status.report.checkedCount).toBe(status.report.vulnerabilityCount);
            expect(Array.isArray(status.report.templates)).toBe(true);
            expect(status.report.templates.length).toBe(status.report.vulnerabilityCount);
            expect(status.report.templates.every((row) => row.vulnerabilityId)).toBe(true);

            // Second run over the unchanged catalog reuses every stored result.
            const rerunResponse = await request(app).post('/api/ai/vulnerabilities/qa/run')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', scope: 'programmatic' });
            expect(rerunResponse.status).toBe(200);

            const rerunStatus = await waitForQaJob('en');
            expect(rerunStatus.job.state).toBe('done');
            expect(rerunStatus.job.reused).toBe(rerunStatus.job.total);
            expect(rerunStatus.job.processed).toBe(0);
        });

        it('should deny the QA job endpoints without the ai-qa-all permission', async () => {
            let response = await request(app).post('/api/ai/vulnerabilities/qa/run')
                .set('Cookie', [`token=JWT ${noAiToken}`])
                .send({ locale: 'en', scope: 'programmatic' });
            expect(response.status).toBe(403);

            response = await request(app).get('/api/ai/vulnerabilities/qa/status?locale=en')
                .set('Cookie', [`token=JWT ${noAiToken}`]);
            expect(response.status).toBe(403);

            response = await request(app).post('/api/ai/vulnerabilities/qa/cancel')
                .set('Cookie', [`token=JWT ${noAiToken}`])
                .send({ locale: 'en' });
            expect(response.status).toBe(403);
        });

        it('should dismiss and restore QA issues from the assembled report', async () => {
            await setProgrammaticOnlyChecks();

            await request(app).post('/api/vulnerabilities')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send([{
                    category: 'Web',
                    details: [{
                        locale: 'en',
                        title: 'Dismiss Endpoint Target',
                        vulnType: 'Web',
                        description: '<p>content</p>',
                        observation: '',
                        remediation: ''
                    }]
                }]);

            const runResponse = await request(app).post('/api/ai/vulnerabilities/qa/run')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', scope: 'programmatic' });
            expect(runResponse.status).toBe(200);

            const status = await waitForQaJob('en');
            const row = status.report.templates.find((entry) => entry.title === 'Dismiss Endpoint Target');
            expect(row).toBeDefined();
            expect(row.issues.length).toBeGreaterThan(0);
            const issue = row.issues[0];
            expect(issue.key).toBeDefined();
            expect(issue.dismissed).toBe(false);
            const totalBefore = status.report.counts.total;

            let response = await request(app).post('/api/ai/vulnerabilities/qa/dismiss')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', vulnerabilityId: row.vulnerabilityId, key: issue.key, dismissed: true });
            expect(response.status).toBe(200);

            let refreshed = await request(app).get('/api/ai/vulnerabilities/qa/status?locale=en')
                .set('Cookie', [`token=JWT ${adminToken}`]);
            expect(refreshed.status).toBe(200);
            let refreshedRow = refreshed.body.datas.report.templates
                .find((entry) => entry.vulnerabilityId === row.vulnerabilityId);
            expect(refreshedRow.issues.find((entry) => entry.key === issue.key).dismissed).toBe(true);
            expect(refreshed.body.datas.report.counts.total).toBe(totalBefore - 1);
            expect(refreshed.body.datas.report.dismissedCount).toBeGreaterThanOrEqual(1);

            response = await request(app).post('/api/ai/vulnerabilities/qa/dismiss')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', vulnerabilityId: row.vulnerabilityId, key: issue.key, dismissed: false });
            expect(response.status).toBe(200);

            refreshed = await request(app).get('/api/ai/vulnerabilities/qa/status?locale=en')
                .set('Cookie', [`token=JWT ${adminToken}`]);
            refreshedRow = refreshed.body.datas.report.templates
                .find((entry) => entry.vulnerabilityId === row.vulnerabilityId);
            expect(refreshedRow.issues.find((entry) => entry.key === issue.key).dismissed).toBe(false);

            // Catalog-level dismissals persist on the catalog document (no vulnerabilityId).
            response = await request(app).post('/api/ai/vulnerabilities/qa/dismiss')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', key: 'duplicates|Dup|vulnerability:A|a,b' });
            expect(response.status).toBe(200);

            response = await request(app).post('/api/ai/vulnerabilities/qa/dismiss')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en' });
            expect(response.status).toBe(422);

            response = await request(app).post('/api/ai/vulnerabilities/qa/dismiss')
                .set('Cookie', [`token=JWT ${noAiToken}`])
                .send({ locale: 'en', vulnerabilityId: row.vulnerabilityId, key: issue.key });
            expect(response.status).toBe(403);
        });

        it('should resolve and unresolve a whole vulnerability from the assembled report', async () => {
            await setProgrammaticOnlyChecks();

            await request(app).post('/api/vulnerabilities')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send([{
                    category: 'Web',
                    details: [{
                        locale: 'en',
                        title: 'Resolve Endpoint Target',
                        vulnType: 'Web',
                        description: '<p>content</p>',
                        observation: '',
                        remediation: ''
                    }]
                }]);

            const runResponse = await request(app).post('/api/ai/vulnerabilities/qa/run')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', scope: 'programmatic' });
            expect(runResponse.status).toBe(200);

            const status = await waitForQaJob('en');
            const row = status.report.templates.find((entry) => entry.title === 'Resolve Endpoint Target');
            expect(row).toBeDefined();
            expect(row.issues.length).toBeGreaterThan(0);
            expect(row.resolved).toBe(false);
            const activeBefore = status.report.counts.total;

            let response = await request(app).post('/api/ai/vulnerabilities/qa/resolve')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', vulnerabilityId: row.vulnerabilityId, resolved: true });
            expect(response.status).toBe(200);

            let refreshed = await request(app).get('/api/ai/vulnerabilities/qa/status?locale=en')
                .set('Cookie', [`token=JWT ${adminToken}`]);
            let refreshedRow = refreshed.body.datas.report.templates
                .find((entry) => entry.vulnerabilityId === row.vulnerabilityId);
            expect(refreshedRow.resolved).toBe(true);
            // Every issue on the vuln hides, so the active total drops by the row's count.
            expect(refreshed.body.datas.report.counts.total).toBe(activeBefore - row.issues.length);
            expect(refreshed.body.datas.report.dismissedCount).toBeGreaterThanOrEqual(row.issues.length);

            response = await request(app).post('/api/ai/vulnerabilities/qa/resolve')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en', vulnerabilityId: row.vulnerabilityId, resolved: false });
            expect(response.status).toBe(200);

            refreshed = await request(app).get('/api/ai/vulnerabilities/qa/status?locale=en')
                .set('Cookie', [`token=JWT ${adminToken}`]);
            refreshedRow = refreshed.body.datas.report.templates
                .find((entry) => entry.vulnerabilityId === row.vulnerabilityId);
            expect(refreshedRow.resolved).toBe(false);
            expect(refreshed.body.datas.report.counts.total).toBe(activeBefore);

            response = await request(app).post('/api/ai/vulnerabilities/qa/resolve')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'en' });
            expect(response.status).toBe(422);

            response = await request(app).post('/api/ai/vulnerabilities/qa/resolve')
                .set('Cookie', [`token=JWT ${noAiToken}`])
                .send({ locale: 'en', vulnerabilityId: row.vulnerabilityId, resolved: true });
            expect(response.status).toBe(403);
        });

        it('should reject cancelling when no QA job is running', async () => {
            const response = await request(app).post('/api/ai/vulnerabilities/qa/cancel')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ locale: 'zz' });

            expect(response.status).toBe(422);
        });

        it('should load the all-templates cached report when loadOnly is requested with no vulnerabilityId or draft', async () => {
            const response = await request(app).post('/api/ai/vulnerabilities/qa')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    locale: 'en',
                    loadOnly: true
                });

            expect(response.status).toBe(200);
            expect(response.body.datas.mode).toBe('all');
        });

        it('should load a single vulnerability QA report without fetching the entire vulnerability database', async () => {
            await request(app).post('/api/vulnerabilities')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send([{
                    category: 'Web',
                    details: [{
                        locale: 'en',
                        title: 'Single Load Target',
                        vulnType: 'Web',
                        description: '',
                        observation: '',
                        remediation: ''
                    }]
                }]);

            const listResponse = await request(app).get('/api/vulnerabilities')
                .set('Cookie', [`token=JWT ${adminToken}`]);
            const created = listResponse.body.datas.find((entry) => entry.details[0]?.title === 'Single Load Target');
            expect(created).toBeDefined();

            const getAllSpy = jest.spyOn(Vulnerability, 'getAll');

            const response = await request(app).post('/api/ai/vulnerabilities/qa')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    locale: 'en',
                    loadOnly: true,
                    vulnerabilityId: created._id
                });

            expect(response.status).toBe(200);
            expect(response.body.datas.mode).toBe('single');
            expect(getAllSpy).not.toHaveBeenCalled();

            getAllSpy.mockRestore();
        });

        it('should not query the database at all for a draft vulnerability loadOnly request', async () => {
            const getAllSpy = jest.spyOn(Vulnerability, 'getAll');

            const response = await request(app).post('/api/ai/vulnerabilities/qa')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    locale: 'en',
                    loadOnly: true,
                    vulnerability: {
                        category: 'Web',
                        details: [{ locale: 'en', title: 'Unsaved Draft' }]
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body.datas.hasReport).toBe(false);
            expect(getAllSpy).not.toHaveBeenCalled();

            getAllSpy.mockRestore();
        });
    });
};
