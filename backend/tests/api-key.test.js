module.exports = function(request, app) {
    describe('API Keys', () => {
        var userCookies = '';   // JWT cookie string for the admin user
        var apiKey = '';        // plaintext key, captured on create

        beforeAll(async () => {
            // user.test.js creates 'admin' with password 'Password1' then changes it to 'Admin123'.
            // Re-authenticate here to get our own cookies.
            var res = await request(app).post('/api/users/token').send({
                username: 'admin', password: 'Admin123'
            });
            expect(res.statusCode).toBe(200);
            userCookies = res.headers['set-cookie'].join('; ');
        });

        it('POST /api/users/me/api-key creates key and returns plaintext', async () => {
            var res = await request(app)
                .post('/api/users/me/api-key')
                .set('Cookie', userCookies)
                .send({ name: 'ci' });
            expect([200, 201]).toContain(res.statusCode);
            expect(res.body.datas.key).toMatch(/^pwndoc_[0-9a-f]{64}$/);
            expect(res.body.datas.prefix).toMatch(/^pwndoc_[0-9a-f]{8}$/);
            apiKey = res.body.datas.key;
        });

        it('POST again returns 403 (one key per user)', async () => {
            var res = await request(app)
                .post('/api/users/me/api-key')
                .set('Cookie', userCookies)
                .send({ name: 'second' });
            expect(res.statusCode).toBe(403);
        });

        it('Bearer key authenticates /api/audits', async () => {
            var res = await request(app)
                .get('/api/audits')
                .set('Authorization', 'Bearer ' + apiKey)
                .set('User-Agent', 'pwndoc-test/1.0');
            expect(res.statusCode).toBe(200);
        });

        it('GET /api/users/me/api-key shows recent access with action "listed audits"', async () => {
            var res = await request(app)
                .get('/api/users/me/api-key')
                .set('Cookie', userCookies);
            expect(res.statusCode).toBe(200);
            var key = res.body.datas;
            expect(key).toBeTruthy();
            expect(key.recentAccesses.length).toBeGreaterThanOrEqual(1);
            expect(key.recentAccesses[0].action).toBe('listed audits');
            expect(key.recentAccesses[0].userAgent).toBeTruthy();
        });

        it('recentAccesses is capped at 5', async () => {
            for (var i = 0; i < 7; i++) {
                await request(app).get('/api/audits')
                    .set('Authorization', 'Bearer ' + apiKey)
                    .set('User-Agent', 'pwndoc-test/1.0');
            }
            var res = await request(app)
                .get('/api/users/me/api-key')
                .set('Cookie', userCookies);
            expect(res.body.datas.recentAccesses.length).toBe(5);
        });

        it('cannot create/list key using a Bearer key (403)', async () => {
            var res = await request(app)
                .get('/api/users/me/api-key')
                .set('Authorization', 'Bearer ' + apiKey);
            expect(res.statusCode).toBe(403);
        });

        it('DELETE revokes key; Bearer then returns 401', async () => {
            var del = await request(app)
                .delete('/api/users/me/api-key')
                .set('Cookie', userCookies);
            expect(del.statusCode).toBe(200);

            var after = await request(app)
                .get('/api/audits')
                .set('Authorization', 'Bearer ' + apiKey);
            expect(after.statusCode).toBe(401);
        });

        it('rejects an invalid Bearer key with 401', async () => {
            var res = await request(app)
                .get('/api/audits')
                .set('Authorization', 'Bearer pwndoc_deadbeef');
            expect(res.statusCode).toBe(401);
        });
    });
};
