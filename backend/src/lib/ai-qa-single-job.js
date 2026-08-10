const crypto = require('crypto');

// Background-job scaffolding for a *single* async task (one LLM call): audit QA and
// single-vuln QA each run one call and persist their own result, so all they need is
// running -> done. Modeled on ai-vuln-qa-job.js's job-Map/detached-promise shape, but
// generalized over an arbitrary key/room/event.
//
// One in-memory job per key, single process. A lost job record on restart is harmless -
// the caller persists its result incrementally and can just re-run (see ai-vuln-qa-job.js).
const jobs = new Map();

const isJobActive = (job) => Boolean(job && job.state === 'running');

const serializeJob = (job) => {
    if (!job)
        return null;

    return {
        id: job.id,
        key: job.key,
        state: job.state,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error,
        ...job.meta
    };
};

const emitDone = (job) => {
    if (!job.io || !job.room || !job.event)
        return;
    job.io.to(job.room).emit(job.event, serializeJob(job));
};

// Starts `task` for `key` unless one is already running. `task` is a no-arg async function
// responsible for its own persistence: the job record carries only lifecycle state, never
// the result, so the persisted report stays the single source of truth.
const startSingleJob = ({ key, task, io, room, event, meta = {} }) => {
    const existing = jobs.get(key);
    if (isJobActive(existing))
        return { alreadyRunning: true, job: existing };

    const job = {
        id: crypto.randomUUID(),
        key: key,
        state: 'running',
        startedAt: new Date(),
        finishedAt: null,
        error: null,
        meta: meta,
        io: io || null,
        room: room || null,
        event: event || null,
        promise: null
    };
    jobs.set(key, job);

    job.promise = task()
        .then(() => {
            job.state = 'done';
        })
        .catch((err) => {
            job.state = 'failed';
            job.error = err?.message || String(err);
        })
        .then(() => {
            job.finishedAt = new Date();
            emitDone(job);
        });

    return { alreadyRunning: false, job };
};

const getSingleJob = (key) => jobs.get(key) || null;

const getSingleJobStatus = (key) => serializeJob(getSingleJob(key));

const isSingleJobActive = (key) => isJobActive(getSingleJob(key));

module.exports = {
    startSingleJob,
    getSingleJob,
    getSingleJobStatus,
    isSingleJobActive,
    serializeJob
};
