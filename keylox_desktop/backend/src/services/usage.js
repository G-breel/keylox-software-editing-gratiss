'use strict';

/**
 * Pencatatan penggunaan AI backend — `api-contract.md` v1.2 §4.3, §2.16, R3.3.
 *
 * In-memory per device (MVP). Production: persist ke `ai_usage_records`
 * (`+ provider`, `+ est_cost_usd`) yang menopang view `v_ai_usage_daily` (§15.11).
 * Tidak ada prompt/respons yang dicatat (hanya angka & identitas panggilan).
 *
 * `est_cost_usd` dihitung dari `pricePer1M` registry × token; `null` bila harga
 * provider `null` (mis. `openrouter`/`custom`) → UI hanya menampilkan token.
 */

const registry = require('./providerRegistry');

const MAX_RECORDS = 10000;

/**
 * Estimasi biaya USD (§2.16). `null` bila provider tanpa harga / angka tidak valid.
 * @param {string} providerId
 * @param {number} tokensIn
 * @param {number} tokensOut
 * @returns {number|null}
 */
function estimateCostUsd(providerId, tokensIn, tokensOut) {
  const provider = providerId ? registry.PROVIDERS[String(providerId).trim().toLowerCase()] : null;
  const price = provider && provider.pricePer1M;
  if (!price || typeof price.in !== 'number' || typeof price.out !== 'number') return null;
  const inTok = Number(tokensIn);
  const outTok = Number(tokensOut);
  if (!Number.isFinite(inTok) || !Number.isFinite(outTok)) return null;
  const cost = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost * 1e6) / 1e6;
}

const usage = new Map(); // deviceId -> { date, tokensIn, tokensOut, requests, estCostUsd }
/** Rekaman per panggilan (bentuk kolom `ai_usage_records`) — untuk ringkasan/biaya. */
const records = [];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUsage(deviceId) {
  const rec = usage.get(deviceId) || { date: todayKey(), tokensIn: 0, tokensOut: 0, requests: 0, estCostUsd: 0 };
  if (rec.date !== todayKey()) {
    rec.date = todayKey();
    rec.tokensIn = 0;
    rec.tokensOut = 0;
    rec.requests = 0;
    rec.estCostUsd = 0;
  }
  usage.set(deviceId, rec);
  return rec;
}

function record(deviceId, tokensIn = 0, tokensOut = 0) {
  const rec = getUsage(deviceId);
  rec.tokensIn += tokensIn;
  rec.tokensOut += tokensOut;
  rec.requests += 1;
  usage.set(deviceId, rec);
  return rec;
}

/** Hitung percobaan permintaan saja (dipakai untuk kuota/abuse protection). */
function countRequest(key) {
  const rec = getUsage(key);
  rec.requests += 1;
  usage.set(key, rec);
  return rec;
}

/**
 * Catat token (+ provider/model/jobType/biaya) tanpa menambah counter request
 * (request sudah dihitung middleware).
 * @param {string} key deviceId
 * @param {number} tokensIn
 * @param {number} tokensOut
 * @param {{provider?:string, model?:string, jobType?:string, cacheHit?:boolean}} [opts]
 */
function recordTokens(key, tokensIn = 0, tokensOut = 0, opts = {}) {
  const rec = getUsage(key);
  rec.tokensIn += tokensIn;
  rec.tokensOut += tokensOut;
  const estCostUsd = estimateCostUsd(opts.provider, tokensIn, tokensOut);
  if (estCostUsd !== null) rec.estCostUsd = Math.round(((Number(rec.estCostUsd) || 0) + estCostUsd) * 1e6) / 1e6;
  usage.set(key, rec);

  records.push({
    deviceId: key,
    recordedAt: new Date().toISOString(),
    provider: opts.provider ? String(opts.provider) : null,
    model: opts.model ? String(opts.model) : null,
    jobType: opts.jobType ? String(opts.jobType) : null,
    inputTokens: Number(tokensIn) || 0,
    outputTokens: Number(tokensOut) || 0,
    estCostUsd,
    cacheHit: opts.cacheHit === true,
  });
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  return rec;
}

function allUsage() {
  const out = {};
  for (const [k, v] of usage.entries()) out[k] = v;
  return out;
}

/** Rekaman per panggilan (read-only copy) — dipakai ringkasan biaya/provider. */
function allRecords() {
  return records.slice();
}

function __resetForTest() {
  usage.clear();
  records.length = 0;
}

module.exports = {
  getUsage,
  record,
  countRequest,
  recordTokens,
  allUsage,
  allRecords,
  estimateCostUsd,
  __resetForTest,
};
