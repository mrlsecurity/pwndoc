module.exports = function(request, app) {
    describe('AI provider settings scope enforcement', () => {
        const Settings = require('mongoose').model('Settings');
        const { MASKED_SECRET } = require('../src/lib/settings-secrets');
        let adminToken = '';
        let aiSettingsToken = '';       // ai-settings:read + ai-settings:update ONLY (no settings:*)
        let generalSettingsToken = '';  // settings:read + settings:update ONLY (no ai-settings:*)

        const login = async (username, password) => {
            const response = await request(app).post('/api/users/token').send({ username, password });
            expect(response.status).toBe(200);
            return response.body.datas.token;
        };

        const createRole = async (name, displayName, allows) => {
            const response = await request(app).post('/api/data/roles')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ name, displayName, allows });
            expect([201, 422]).toContain(response.status);
        };

        const createUser = async (username, password, roles) => {
            const response = await request(app).post('/api/users')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({ username, password, firstname: username, lastname: 'Scope', roles });
            expect([201, 422]).toContain(response.status);
        };

        // Reset the AI provider subtree to a known baseline without disturbing sibling settings.
        const resetAiBaseline = () => Settings.findOneAndUpdate({}, {
            $set: {
                'ai.public.enabled': false,
                'ai.public.defaultProvider': 'openai',
                'ai.public.qaChecks.completeness': true,
                'ai.private.anthropicModel': 'claude-opus-4-8',
                'ai.private.anthropicApiKey': 'stored-anthropic-key',
                'ai.private.openaiApiKey': ''
            }
        }, { upsert: true });

        beforeAll(async () => {
            adminToken = await login('admin', 'Admin123');

            await createRole('ai-settings-only', 'AI Settings Only', ['ai-settings:read', 'ai-settings:update']);
            await createUser('aisettingsonly', 'Aisettings123', ['ai-settings-only']);
            aiSettingsToken = await login('aisettingsonly', 'Aisettings123');

            await createRole('general-settings-only', 'General Settings Only', ['settings:read', 'settings:update']);
            await createUser('generalsettingsonly', 'Generalsettings123', ['general-settings-only']);
            generalSettingsToken = await login('generalsettingsonly', 'Generalsettings123');
        });

        beforeEach(async () => {
            await resetAiBaseline();
        });

        it('serves the AI provider subtree through the dedicated read endpoint for ai-settings:read', async () => {
            const response = await request(app).get('/api/settings/ai')
                .set('Cookie', [`token=JWT ${aiSettingsToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.datas.private.anthropicModel).toBe('claude-opus-4-8');
            expect(response.body.datas.private.anthropicApiKey).toBe('');
            expect(response.body.datas.private.anthropicApiKeyConfigured).toBe(true);
            expect(response.body.datas.public.defaultProvider).toBe('openai');
        });

        it('denies the dedicated AI endpoints to users without the ai-settings scopes', async () => {
            const read = await request(app).get('/api/settings/ai')
                .set('Cookie', [`token=JWT ${generalSettingsToken}`]);
            expect(read.status).toBe(403);

            const write = await request(app).put('/api/settings/ai')
                .set('Cookie', [`token=JWT ${generalSettingsToken}`])
                .send({ private: { anthropicModel: 'hijacked' } });
            expect(write.status).toBe(403);
        });

        it('denies the generic settings endpoints to an ai-settings-only user', async () => {
            const read = await request(app).get('/api/settings')
                .set('Cookie', [`token=JWT ${aiSettingsToken}`]);
            expect(read.status).toBe(403);

            const write = await request(app).put('/api/settings')
                .set('Cookie', [`token=JWT ${aiSettingsToken}`])
                .send({ reviews: { public: { minReviewers: 2 } } });
            expect(write.status).toBe(403);
        });

        it('lets ai-settings:update change provider config through the dedicated endpoint', async () => {
            const response = await request(app).put('/api/settings/ai')
                .set('Cookie', [`token=JWT ${aiSettingsToken}`])
                .send({
                    public: { enabled: true, defaultProvider: 'anthropic' },
                    private: { anthropicModel: 'claude-sonnet-5', anthropicApiKey: MASKED_SECRET }
                });

            expect(response.status).toBe(200);

            const stored = await Settings.getAll();
            expect(stored.ai.private.anthropicModel).toBe('claude-sonnet-5');
            expect(stored.ai.public.defaultProvider).toBe('anthropic');
            expect(stored.ai.public.enabled).toBe(true);
            // Masked sentinel keeps the stored secret; sibling AI config is not wiped.
            expect(stored.ai.private.anthropicApiKey).toBe('stored-anthropic-key');
            expect(stored.ai.public.qaChecks.completeness).toBe(true);
        });

        it('rejects an invalid default provider on the dedicated endpoint', async () => {
            const response = await request(app).put('/api/settings/ai')
                .set('Cookie', [`token=JWT ${aiSettingsToken}`])
                .send({ public: { defaultProvider: 'not-a-provider' } });

            expect(response.status).toBe(422);
        });

        it('ignores AI provider changes from a settings:update-only user on the generic endpoint', async () => {
            const response = await request(app).put('/api/settings')
                .set('Cookie', [`token=JWT ${generalSettingsToken}`])
                .send({
                    ai: {
                        private: { anthropicModel: 'hijacked-model', anthropicApiKey: 'stolen-key' },
                        public: { defaultProvider: 'deepseek', enabled: true }
                    }
                });

            expect(response.status).toBe(200);

            const stored = await Settings.getAll();
            expect(stored.ai.private.anthropicModel).toBe('claude-opus-4-8');
            expect(stored.ai.private.anthropicApiKey).toBe('stored-anthropic-key');
            expect(stored.ai.public.defaultProvider).toBe('openai');
            expect(stored.ai.public.enabled).toBe(false);
            // Sibling AI config the generic endpoint may touch is preserved.
            expect(stored.ai.public.qaChecks.completeness).toBe(true);
        });

        it('strips the AI provider subtree from the generic payload for non ai-settings:read users', async () => {
            const response = await request(app).get('/api/settings')
                .set('Cookie', [`token=JWT ${generalSettingsToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.datas.ai.private).toBeUndefined();
            expect(response.body.datas.ai.public.defaultProvider).toBeUndefined();
            // The public master toggle is still visible.
            expect(response.body.datas.ai.public).toHaveProperty('enabled');
        });

        it('still lets full settings admins manage the AI provider subtree through the generic endpoint', async () => {
            const baseline = (await Settings.getAll()).toObject();
            const response = await request(app).put('/api/settings')
                .set('Cookie', [`token=JWT ${adminToken}`])
                .send({
                    ai: {
                        private: { ...baseline.ai.private, anthropicModel: 'claude-admin-model' },
                        public: { ...baseline.ai.public, defaultProvider: 'anthropic' }
                    }
                });

            expect(response.status).toBe(200);

            const stored = await Settings.getAll();
            expect(stored.ai.private.anthropicModel).toBe('claude-admin-model');
            expect(stored.ai.public.defaultProvider).toBe('anthropic');
        });
    });
};
