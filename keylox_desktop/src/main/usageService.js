'use strict';

/**
 * Transparansi token & biaya — `api-contract.md` v1.2 §2.16 (ADR-04).
 *
 * Main process memegang catatan penggunaan AI in-memory (tidak ada layer SQLite di
 * main; backend mencatat ke `ai_usage_records` — §4.3). Biaya DIHITUNG di main dari
 * `pricePer1M` registry × token; `null` bila `pricePer1M` provider `null`.
 *
 * `est_cost_usd` adalah ESTIMASI, bukan tagihan (§2.16 butir 2).
 * Modul murni Node → dapat diuji unit tanpa Electron.
 */

const { getProvider } = require('../shared/providerRegistry');
const { USAGE_RANGES, DEFAULT_USAGE_RANGE, validateUsageSummary } = require('../shared/usage.schema');

const MAX_RECORDS = 10000;

/**
 * Estimasi biaya USD dari harga indikatif registry × token (§2.16 butir 1–2).
 * @param {string} providerId
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number|null} `null` bila harga provider `null`/tak diketahui
 */
function estimateCostUsd(providerId, inputTokens, outputTokens) {
  const provider = getProvider(providerId);
  const price = provider && provider.pricePer1M;
  if (!price || typeof price.in !== 'number' || typeof price.out !== 'number') return null;
  const inTok = Number(inputTokens);
  const outTok = Number(outputTokens);
  if (!Number.isFinite(inTok) || !Number.isFinite(outTok)) return null;
  const cost = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost * 1e6) / 1e6;
}

function rangeStartMs(range) {
  const now = Date.now();
  if (range === 'today') {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

/**
 * @param {object} [deps]
 * @param {() => number} [deps.now]
 */
function createUsageService(deps = {}) {
  const now = deps.now || (() => Date.now());
  /** @type {Array<object>} */
  const records = [];

  /**
   * Catat satu panggilan AI.
   * @returns {object} rekaman tersimpan
   */
  function record(entry) {
    const e = entry && typeof entry === 'object' ? entry : {};
    const inputTokens = Math.max(0, Math.trunc(Number(e.inputTokens) || 0));
    const outputTokens = Math.max(0, Math.trunc(Number(e.outputTokens) || 0));
    const estCostUsd = estimateCostUsd(String(e.provider || ''), inputTokens, outputTokens);
    const rec = {
      recordedAt: e.recordedAt || new Date(now()).toISOString(),
      provider: String(e.provider || 'unknown'),
      model: String(e.model || 'unknown'),
      jobType: String(e.jobType || 'unknown'),
      inputTokens,
      outputTokens,
      estCostUsd,
      cacheHit: e.cacheHit === true,
      latencyMs: Number.isFinite(Number(e.latencyMs)) ? Number(e.latencyMs) : null,
    };
    records.push(rec);
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    return rec;
  }

  /**
   * Ringkasan penggunaan (§2.16 `UsageSummary`).
   * @param {{range?: string, provider?: string, model?: string}} [options]
   * @returns {object} UsageSummary tervalidasi
   */
  function summary(options = {}) {
    const range = USAGE_RANGES.includes(options.range) ? options.range : DEFAULT_USAGE_RANGE;
    const start = rangeStartMs(range);
    const filtered = records.filter((r) => {
      if (Date.parse(r.recordedAt) < start) return false;
      if (options.provider && r.provider !== options.provider) return false;
      if (options.model && r.model !== options.model) return false;
      return true;
    });

    const totals = { calls: filtered.length, inputTokens: 0, outputTokens: 0 };
    let costSum = 0;
    let anyCost = false;
    for (const r of filtered) {
      totals.inputTokens += r.inputTokens;
      totals.outputTokens += r.outputTokens;
      if (typeof r.estCostUsd === 'number') {
        costSum += r.estCostUsd;
        anyCost = true;
      }
    }
    const estCostUsd = anyCost ? Math.round(costSum * 1e6) / 1e6 : null;

    const result = {
      range,
      totals: { calls: totals.calls, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, estCostUsd },
      items: filtered.map((r) => ({
        recordedAt: r.recordedAt,
        provider: r.provider,
        model: r.model,
        jobType: r.jobType,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        estCostUsd: r.estCostUsd,
        cacheHit: r.cacheHit,
      })),
    };
    // Guard internal: bentuk ringkasan wajib lolos skema §2.16.
    const check = validateUsageSummary(result);
    if (!check.ok) {
      throw new Error('usageService.summary: bentuk UsageSummary tidak valid.');
    }
    return result;
  }

  /**
   * Hapus riwayat penggunaan (§2.15.4 `data:wipeLocal({scope:'usage'|'all'})`).
   * @returns {{deleted: number, freedBytes: number}}
   */
  function wipe() {
    const deleted = records.length;
    records.length = 0;
    return { deleted, freedBytes: 0 };
  }

  function count() {
    return records.length;
  }

  return { record, summary, wipe, count, estimateCostUsd };
}

module.exports = { createUsageService, estimateCostUsd };
