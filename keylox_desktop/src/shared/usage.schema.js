'use strict';

/**
 * `UsageSummary` — skema Zod kanonik untuk channel `usage:get` (`api-contract.md`
 * v1.2 §2.16). Dipakai main process (`usageService.summary`) dan unit test.
 *
 * Bentuk TS (rujukan):
 * ```ts
 * interface UsageSummary {
 *   range: string;
 *   totals: { calls: number; inputTokens: number; outputTokens: number; estCostUsd: number | null };
 *   items: Array<{
 *     recordedAt: string; provider: string; model: string; jobType: string;
 *     inputTokens: number; outputTokens: number; estCostUsd: number | null; cacheHit: boolean;
 *   }>;
 * }
 * ```
 *
 * Aturan §2.16 butir 1–2: biaya dihitung di main dari `pricePer1M` registry × token;
 * `estCostUsd === null` bila `pricePer1M` provider `null`; nilai negatif/NaN ditolak.
 */

const { z } = require('zod');

/** Angka non-negatif & finitif (menolak NaN/Infinity/negatif — §2.16 butir 2). */
const nonNegative = z.number().finite().nonnegative();
/** Token = integer ≥ 0. */
const tokenCount = z.number().int().nonnegative();

const UsageItemSchema = z.object({
  recordedAt: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  jobType: z.string().min(1),
  inputTokens: tokenCount,
  outputTokens: tokenCount,
  estCostUsd: nonNegative.nullable(),
  cacheHit: z.boolean(),
}).strict();

const UsageSummarySchema = z.object({
  range: z.string().min(1),
  totals: z.object({
    calls: tokenCount,
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    estCostUsd: nonNegative.nullable(),
  }).strict(),
  items: z.array(UsageItemSchema),
}).strict();

/** Rentang waktu yang dikenal (§2.16). `all` = tanpa batas bawah. */
const USAGE_RANGES = Object.freeze(['today', '7d', '30d', 'all']);
const DEFAULT_USAGE_RANGE = 'all';

/**
 * Validasi ringan; TIDAK melempar (dipakai tes & guard internal).
 * @param {unknown} value
 * @returns {{ok: boolean, issues?: unknown[]}}
 */
function validateUsageSummary(value) {
  const result = UsageSummarySchema.safeParse(value);
  if (result.success) return { ok: true };
  return { ok: false, issues: result.error.issues };
}

module.exports = {
  UsageItemSchema,
  UsageSummarySchema,
  USAGE_RANGES,
  DEFAULT_USAGE_RANGE,
  validateUsageSummary,
};
