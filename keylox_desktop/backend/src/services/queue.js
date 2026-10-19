'use strict';

const logger = require('../logger');
const { v4: uuidv4 } = require('uuid');

// In-memory job queue (MVP). Redis/BullMQ optional: if REDIS_URL set, could swap.
const jobs = new Map(); // jobId -> job record
const queue = []; // pending jobIds
let processing = false;
let concurrency = 2;
let active = 0;

/**
 * @param {object} [credentials] Kredensial BYOK untuk job ini.
 *   Disimpan **hanya di memori proses** selama job berjalan, lalu dihapus di
 *   `finally` (`api-contract.md` §3.7 butir 1: key tidak disimpan). Tidak pernah
 *   ikut ke respons `GET /ai/jobs/:jobId` (route memilih field secara eksplisit).
 */
function createJob(jobType, inputRef, params, deviceId, credentials = null) {
  const jobId = uuidv4();
  const job = {
    jobId,
    jobType,
    status: 'queued',
    progress: 0,
    inputRef,
    params: params || {},
    deviceId,
    credentials,
    queuedReason: 'none',
    result: null,
    resultRef: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    cancelRequested: false,
  };
  jobs.set(jobId, job);
  queue.push(jobId);
  tick();
  return job;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    const idx = queue.indexOf(jobId);
    if (idx >= 0) queue.splice(idx, 1);
    return true;
  }
  if (job.status === 'running') {
    job.cancelRequested = true;
    return true;
  }
  return false;
}

// Processor registry: task handlers registered by jobType
const processors = new Map();
function registerProcessor(jobType, fn) {
  processors.set(jobType, fn);
}

async function processJob(job) {
  const proc = processors.get(job.jobType);
  if (!proc) {
    job.status = 'failed';
    job.errorCode = 'ERR_SYSTEM';
    job.errorMessage = `No processor for ${job.jobType}`;
    job.finishedAt = new Date().toISOString();
    return;
  }
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  try {
    const result = await proc(job, (p) => {
      if (job.cancelRequested) throw new Error('cancelled');
      job.progress = Math.max(0, Math.min(1, p));
    });
    if (job.cancelRequested) {
      job.status = 'cancelled';
    } else {
      job.status = 'succeeded';
      job.progress = 1;
      job.result = result;
      job.resultRef = result && result.resultRef ? result.resultRef : null;
    }
  } catch (err) {
    if (job.cancelRequested || (err && err.message === 'cancelled')) {
      job.status = 'cancelled';
    } else {
      job.status = 'failed';
      job.errorCode = err.code || 'ERR_AI_INVALID_RESPONSE';
      job.errorMessage = err.message || 'Job failed';
      logger.error({ jobId: job.jobId, err: err.message }, 'job failed');
    }
  } finally {
    job.finishedAt = new Date().toISOString();
    // Kredensial BYOK tidak pernah bertahan lebih lama dari umur job.
    job.credentials = null;
    active--;
    tick();
  }
}

function tick() {
  while (active < concurrency && queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);
    if (!job || job.status !== 'queued') continue;
    active++;
    processJob(job);
  }
}

function stats() {
  return { total: jobs.size, queued: queue.length, active, concurrency };
}

module.exports = { createJob, getJob, cancelJob, registerProcessor, stats };