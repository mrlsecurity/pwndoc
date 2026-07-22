module.exports = function() {
    describe('AI QA single-call background job', () => {
        const {
            startSingleJob,
            getSingleJob,
            getSingleJobStatus,
            isSingleJobActive,
            serializeJob
        } = require('../src/lib/ai-qa-single-job');

        const buildFakeIo = () => {
            const emit = jest.fn();
            return { io: { to: jest.fn(() => ({ emit })) }, emit };
        };

        it('runs a task to completion and reports its state through the lifecycle', async () => {
            const key = `test-run:${Date.now()}`;
            const { alreadyRunning, job } = startSingleJob({
                key: key,
                task: async () => {}
            });

            expect(alreadyRunning).toBe(false);
            expect(job.state).toBe('running');
            expect(isSingleJobActive(key)).toBe(true);
            expect(getSingleJobStatus(key)).toEqual(expect.objectContaining({ key: key, state: 'running' }));

            await job.promise;

            expect(job.state).toBe('done');
            expect(job.finishedAt).not.toBeNull();
            expect(isSingleJobActive(key)).toBe(false);
            expect(getSingleJobStatus(key).state).toBe('done');
        });

        it('records a task failure without throwing and keeps it queryable', async () => {
            const key = `test-fail:${Date.now()}`;
            const { job } = startSingleJob({
                key: key,
                task: async () => { throw new Error('boom'); }
            });

            await job.promise;

            expect(job.state).toBe('failed');
            expect(job.error).toBe('boom');
            expect(getSingleJobStatus(key).error).toBe('boom');
        });

        // Gate the task open so the second start deterministically lands while the first is
        // still "running" - timing a real HTTP round-trip can't guarantee that.
        it('rejects a second start for the same key while the first is still running', async () => {
            const key = `test-guard:${Date.now()}`;
            let release;
            const gate = new Promise((resolve) => { release = resolve; });

            const first = startSingleJob({
                key: key,
                task: async () => { await gate; }
            });
            expect(first.alreadyRunning).toBe(false);

            const duplicate = startSingleJob({
                key: key,
                task: async () => {}
            });
            expect(duplicate.alreadyRunning).toBe(true);
            expect(duplicate.job.id).toBe(first.job.id);
            expect(isSingleJobActive(key)).toBe(true);

            release();
            await first.job.promise;
            expect(isSingleJobActive(key)).toBe(false);

            // Once the first job has finished, the key is free again.
            const afterCompletion = startSingleJob({ key: key, task: async () => {} });
            expect(afterCompletion.alreadyRunning).toBe(false);
            expect(afterCompletion.job.id).not.toBe(first.job.id);
            await afterCompletion.job.promise;
        });

        it('serializes only the whitelisted fields plus caller-supplied meta', async () => {
            const key = `test-serialize:${Date.now()}`;
            const { job } = startSingleJob({
                key: key,
                task: async () => {},
                meta: { auditId: 'abc123', scope: 'all' }
            });

            const serialized = serializeJob(job);
            expect(serialized).toEqual({
                id: job.id,
                key: key,
                state: 'running',
                startedAt: job.startedAt,
                finishedAt: null,
                error: null,
                auditId: 'abc123',
                scope: 'all'
            });
            expect(serialized.io).toBeUndefined();
            expect(serialized.room).toBeUndefined();
            expect(serialized.event).toBeUndefined();

            await job.promise;
        });

        it('emits a done event to the configured room once the task settles', async () => {
            const key = `test-emit:${Date.now()}`;
            const { io, emit } = buildFakeIo();

            const { job } = startSingleJob({
                key: key,
                task: async () => {},
                io: io,
                room: 'some-room',
                event: 'some-event:done',
                meta: { vulnerabilityId: 'vuln1', locale: 'en' }
            });

            await job.promise;

            expect(io.to).toHaveBeenCalledWith('some-room');
            expect(emit).toHaveBeenCalledWith('some-event:done', expect.objectContaining({
                key: key,
                state: 'done',
                vulnerabilityId: 'vuln1',
                locale: 'en'
            }));
        });

        it('returns null/false status for a key with no job', () => {
            expect(getSingleJob('never-started')).toBeNull();
            expect(getSingleJobStatus('never-started')).toBeNull();
            expect(isSingleJobActive('never-started')).toBe(false);
        });
    });
};
