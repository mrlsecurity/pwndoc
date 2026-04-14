module.exports = function(request, app) {
    describe('AI Integration', () => {
        var adminToken = '';
        var Settings = require('mongoose').model('Settings');
        var AIAction = require('mongoose').model('AIAction');

        beforeAll(async () => {
            var response = await request(app).post('/api/users/token').send({username: 'admin', password: 'Admin123'});
            adminToken = response.body.datas.token;
        });

        describe('AI Settings', () => {
            it('Should get AI settings', async () => {
                var response = await request(app).get('/api/ai/settings')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);
                expect(response.body.datas.enabled).toBe(false);
                expect(response.body.datas.provider).toBeDefined();
                expect(response.body.datas.provider.baseURL).toBe('https://api.openai.com/v1');
                expect(response.body.datas.provider.model).toBe('gpt-4o-mini');
            });

            it('Should enable AI via settings update', async () => {
                var response = await request(app).put('/api/settings')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        ai: {
                            enabled: true,
                            public: { enabled: true },
                            private: {
                                provider: {
                                    baseURL: 'http://localhost:11434/v1',
                                    model: 'llama3',
                                    apiKey: 'test-key-123'
                                }
                            }
                        }
                    });
                expect(response.status).toBe(200);

                var response = await request(app).get('/api/ai/settings')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);
                expect(response.body.datas.enabled).toBe(true);
                expect(response.body.datas.provider.baseURL).toBe('http://localhost:11434/v1');
                expect(response.body.datas.provider.model).toBe('llama3');
                expect(response.body.datas.provider.hasApiKey).toBe(true);
                expect(response.body.datas.provider.apiKeySource).toBe('manual');
            });

            it('Should show AI enabled in public settings', async () => {
                var response = await request(app).get('/api/settings/public')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);
                expect(response.body.datas.ai).toBeDefined();
                expect(response.body.datas.ai.enabled).toBe(true);
            });
        });

        describe('AI Actions CRUD', () => {
            var customActionId;

            it('Should list built-in actions', async () => {
                var response = await request(app).get('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);
                var actions = response.body.datas;
                expect(actions.length).toBeGreaterThanOrEqual(4);

                var builtinNames = actions.filter(a => a.type === 'builtin').map(a => a.builtinAction);
                expect(builtinNames).toContain('generate');
                expect(builtinNames).toContain('rephrase');
                expect(builtinNames).toContain('translate');
                expect(builtinNames).toContain('summarize');
            });

            it('Should create a custom action', async () => {
                var response = await request(app).post('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        name: 'Anonymize',
                        type: 'custom',
                        systemPrompt: 'You are a data anonymization expert. Replace all identifying information with placeholders.',
                        adminInstructions: 'Preserve technical details while removing client names and IPs.',
                        targetFields: ['description', 'observation'],
                        position: 10,
                        isEnabled: true
                    });
                expect(response.status).toBe(201);
                expect(response.body.datas.name).toBe('Anonymize');
                customActionId = response.body.datas._id;
            });

            it('Should not create duplicate action name', async () => {
                var response = await request(app).post('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        name: 'Anonymize',
                        type: 'custom',
                        systemPrompt: 'duplicate'
                    });
                expect(response.status).toBe(422);
            });

            it('Should create a builtin override', async () => {
                var response = await request(app).post('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        name: 'generate-override',
                        type: 'builtin_override',
                        builtinAction: 'generate',
                        adminInstructions: 'Always reference OWASP Top 10 categories.'
                    });
                expect(response.status).toBe(201);
            });

            it('Should list custom actions alongside built-ins', async () => {
                var response = await request(app).get('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);
                var actions = response.body.datas;
                var customAction = actions.find(a => a.name === 'Anonymize');
                expect(customAction).toBeDefined();
                expect(customAction.type).toBe('custom');
                expect(customAction.targetFields).toContain('description');

                // Check builtin override is reflected
                var generateAction = actions.find(a => a.builtinAction === 'generate');
                expect(generateAction.adminInstructions).toBe('Always reference OWASP Top 10 categories.');
            });

            it('Should update a custom action', async () => {
                var response = await request(app).put(`/api/ai/actions/${customActionId}`)
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        adminInstructions: 'Updated instructions.',
                        isEnabled: false
                    });
                expect(response.status).toBe(200);
                expect(response.body.datas.adminInstructions).toBe('Updated instructions.');
                expect(response.body.datas.isEnabled).toBe(false);
            });

            it('Should return 404 for non-existent action update', async () => {
                var response = await request(app).put('/api/ai/actions/000000000000000000000000')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({ adminInstructions: 'test' });
                expect(response.status).toBe(404);
            });

            it('Should delete a custom action', async () => {
                var response = await request(app).delete(`/api/ai/actions/${customActionId}`)
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(200);

                var listResponse = await request(app).get('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                var deleted = listResponse.body.datas.find(a => a.name === 'Anonymize');
                expect(deleted).toBeUndefined();
            });

            it('Should return 404 for non-existent action delete', async () => {
                var response = await request(app).delete('/api/ai/actions/000000000000000000000000')
                    .set('Cookie', [`token=JWT ${adminToken}`]);
                expect(response.status).toBe(404);
            });
        });

        describe('AI Execute', () => {
            it('Should reject execution when AI is disabled', async () => {
                // Disable AI first
                await request(app).put('/api/settings')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({ ai: { enabled: false, public: { enabled: false } } });

                var response = await request(app).post('/api/ai/execute')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        action: 'generate',
                        content: 'test',
                        targetField: 'description'
                    });
                expect(response.status).toBe(403);
            });

            it('Should reject execution without action parameter', async () => {
                // Re-enable AI
                await request(app).put('/api/settings')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        ai: {
                            enabled: true,
                            public: { enabled: true },
                            private: { provider: { baseURL: 'http://localhost:11434/v1', model: 'llama3', apiKey: 'test-key' } }
                        }
                    });

                var response = await request(app).post('/api/ai/execute')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({ content: 'test' });
                expect(response.status).toBe(422);
            });

            it('Should return 404 for non-existent custom action', async () => {
                var response = await request(app).post('/api/ai/execute')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        action: '000000000000000000000000',
                        content: 'test'
                    });
                expect(response.status).toBe(404);
            });
        });

        describe('AI Permissions', () => {
            var userToken = '';

            beforeAll(async () => {
                // Create a non-admin user
                await request(app).post('/api/users').send({
                    username: 'aiuser',
                    password: 'AIUser123',
                    firstname: 'AI',
                    lastname: 'User'
                }).set('Cookie', [`token=JWT ${adminToken}`]);

                var response = await request(app).post('/api/users/token').send({
                    username: 'aiuser',
                    password: 'AIUser123'
                });
                userToken = response.body.datas.token;
            });

            it('Regular user should be able to list actions (ai:use)', async () => {
                var response = await request(app).get('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${userToken}`]);
                expect(response.status).toBe(200);
            });

            it('Regular user should not be able to create actions (ai:configure)', async () => {
                var response = await request(app).post('/api/ai/actions')
                    .set('Cookie', [`token=JWT ${userToken}`])
                    .send({ name: 'test', type: 'custom', systemPrompt: 'test' });
                expect(response.status).toBe(403);
            });

            it('Regular user should not be able to get AI settings (ai:configure)', async () => {
                var response = await request(app).get('/api/ai/settings')
                    .set('Cookie', [`token=JWT ${userToken}`]);
                expect(response.status).toBe(403);
            });
        });

        // Clean up: disable AI and reset settings
        afterAll(async () => {
            await request(app).put('/api/settings/revert')
                .set('Cookie', [`token=JWT ${adminToken}`]);
            await AIAction.deleteMany({});
        });

        describe('AI Test Connection', () => {
            it('Should require authentication', async () => {
                var response = await request(app).post('/api/ai/test-connection')
                    .send({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'test' });
                expect(response.status).toBe(401);
            });

            it('Should require ai:configure permission', async () => {
                var reportUserResponse = await request(app).post('/api/users/token')
                    .send({ username: 'report', password: 'Report123' });
                var reportToken = reportUserResponse.body.datas?.token;
                if (!reportToken) return;

                var response = await request(app).post('/api/ai/test-connection')
                    .set('Cookie', [`token=JWT ${reportToken}`])
                    .send({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: 'test' });
                expect(response.status).toBe(403);
            });

            it('Should return 422 when baseURL is missing', async () => {
                var response = await request(app).post('/api/ai/test-connection')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({ model: 'gpt-4o-mini', apiKey: 'test' });
                expect(response.status).toBe(422);
            });

            it('Should return 422 when model is missing', async () => {
                var response = await request(app).post('/api/ai/test-connection')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({ baseURL: 'https://api.openai.com/v1', apiKey: 'test' });
                expect(response.status).toBe(422);
            });

            it('Should return 422 when no API key available', async () => {
                await Settings.update({ ai: { enabled: false, private: { provider: { baseURL: '', model: '', apiKey: '' } }, public: { enabled: false } } });
                var savedEnv = process.env.AI_API_KEY;
                delete process.env.AI_API_KEY;

                var response = await request(app).post('/api/ai/test-connection')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' });
                expect(response.status).toBe(422);

                if (savedEnv) process.env.AI_API_KEY = savedEnv;
            });

            it('Should return structured error (not crash) when provider is unreachable', async () => {
                var response = await request(app).post('/api/ai/test-connection')
                    .set('Cookie', [`token=JWT ${adminToken}`])
                    .send({
                        baseURL: 'http://127.0.0.1:19999/v1',
                        model: 'any-model',
                        apiKey: 'test-key'
                    });
                expect(response.status).toBe(200);
                expect(response.body.datas.success).toBe(false);
                expect(typeof response.body.datas.error).toBe('string');
            });
        });
    });
};
