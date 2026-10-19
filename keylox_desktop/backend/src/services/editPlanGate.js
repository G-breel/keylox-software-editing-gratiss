'use strict';

/**
 * Gerbang validasi output AI (menutup `SEC-PROMPT-01`, `api-contract.md` §3.3).
 *
 * Aturan kontrak yang ditegakkan di sini:
 *  1. SEMUA output AI berbentuk EditPlan WAJIB lolos `EditPlanOutputSchema`
 *     (Zod `.strict()`) SEBELUM `ok(...)` dikirim. Tidak ada jalur bypass.
 *  2. **Tolak, jangan sanitasi diam-diam.** `ensure(result, defaults)` — yang hanya
 *     mengisi default — bukan validasi dan tidak boleh jadi satu-satunya penjaga.
 *  3. Invarian lintas-field: op destruktif / `operationClass:'D'` tanpa
 *     `requiresConfirm:true` DITOLAK meski bentuknya valid (§3.3 butir 3 & 4).
 *
 * Schema KANONIK berasal dari Stage 4 di `keylox_desktop/src/shared/editPlan.schema.js`
 * dan di-`require` lewat path relatif dari `backend/src/` (TIDAK ada salinan/duplikat
 * di backend). Bila berkas itu belum ada / belum bisa dimuat:
 *  - mode mock/dev (`MOCK_AI=true`): validasi schema dilewati + peringatan keras
 *    (supaya rangkaian test Stage 7/8 tetap jalan saat Stage 4 paralel), sementara
 *    invarian destruktif TETAP ditegakkan;
 *  - mode lain (production/provider nyata): **fail-closed** — output AI ditolak
 *    dengan `ERR_AI_INVALID_RESPONSE`, bukan diteruskan tanpa validasi.
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');

const config = require('../config');
const logger = require('../logger');
const { makeError, ErrorCodes } = require('../errors');
const gemini = require('./gemini');

// Path kanonik (relatif dari `backend/src/services/`):
//   ../../../src/shared/editPlan.schema.js  → keylox_desktop/src/shared/editPlan.schema.js
const CANONICAL_CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', 'src', 'shared', 'editPlan.schema.js'),
  path.resolve(__dirname, '..', '..', '..', 'src', 'shared', 'editPlan.schema.cjs'),
  path.resolve(__dirname, '..', '..', '..', 'src', 'shared', 'editPlan.schema.mjs'),
  // Alternatif bila Stage 4 menaruh schema di dalam paket backend itu sendiri.
  path.resolve(__dirname, '..', 'shared', 'editPlan.schema.js'),
];

const RE_PROBE_MS = 5000;   // dev: schema Stage 4 bisa mendarat belakangan
const MAX_RETRY = 2;        // §3.3 butir 4: retry ≤ 2× lalu fallback manual
const MAX_ISSUES = 10;

// Daftar opType berisiko tinggi. Dipakai HANYA bila schema kanonik tidak
// mengekspor daftarnya sendiri; `delete` adalah op yang disasar regression
// prompt-injection 06-security §5.1 ("hapus semua clip").
const FALLBACK_DESTRUCTIVE_OP_TYPES = ['delete'];

let destructiveOps = new Set(FALLBACK_DESTRUCTIVE_OP_TYPES);
let state = { gate: null, checkedAt: 0, unavailableWarned: false };

function isUnavailable() {
  return !state.gate || !state.gate.available;
}

function warnUnavailableOnce(reason) {
  if (state.unavailableWarned) return;
  state.unavailableWarned = true;
  logger.warn(
    { reason: reason || (state.gate && state.gate.reason) || 'schema_file_not_found', paths: CANONICAL_CANDIDATES },
    'EditPlanOutputSchema kanonik belum tersedia — validasi schema output AI dilewati HANYA pada mode MOCK_AI (fail-closed di mode lain)',
  );
}

// ------------------------------------------------------------------ loading
/**
 * Jalankan loader dengan jalur resolusi tambahan `backend/node_modules`.
 * Schema kanonik hidup di `keylox_desktop/src/`, di luar paket backend, sehingga
 * `require('zod')` di dalamnya bisa gagal resolve. Shim ini HANYA aktif bila
 * resolusi normal gagal, dan dipasang/dilepas kembali dalam satu panggilan.
 */
function requireWithFallbackPaths(absPath) {
  const extra = path.resolve(__dirname, '..', '..', 'node_modules');
  const originalResolve = Module._resolveFilename;
  const patched = function patchedResolve(request, parent, isMain, options) {
    try {
      return originalResolve.call(this, request, parent, isMain, options);
    } catch (err) {
      if (parent && Array.isArray(parent.paths) && !parent.paths.includes(extra)) {
        return originalResolve.call(this, request, { ...parent, paths: [...parent.paths, extra] }, isMain, options);
      }
      throw err;
    }
  };
  Module._resolveFilename = patched;
  try {
    return { ok: true, mod: require(absPath) };
  } catch (err) {
    return { ok: false, err };
  } finally {
    Module._resolveFilename = originalResolve;
  }
}

async function loadModule(absPath) {
  const first = requireWithFallbackPaths(absPath);
  if (first.ok) return first.mod;
  // Berkas bisa berupa ESM murni (`export const`), terutama saat ditulis untuk
  // dipakai renderer/main via Vite. Node ≥22 bisa `require(esm)`, tetapi bila
  // tidak, fallback ke dynamic import.
  try {
    const imported = await import(pathToFileURL(absPath).href);
    return imported && imported.default ? imported.default : imported;
  } catch (e) {
    throw first.err || e;
  }
}

function pickSchema(mod) {
  if (!mod) return null;
  const root = mod.__esModule && mod.default ? mod.default : mod;
  const keys = ['EditPlanOutputSchema', 'EditPlanSchema', 'editPlanOutputSchema', 'editPlanSchema', 'outputSchema', 'schema'];
  for (const k of keys) {
    const v = root && root[k];
    if (!v) continue;
    if (typeof v.safeParse === 'function') return v;
    if (typeof v.parse === 'function') {
      return {
        safeParse(value) {
          try { return { success: true, data: v.parse(value) }; }
          catch (e) { return { success: false, error: e }; }
        },
      };
    }
  }
  if (root && typeof root.safeParse === 'function') return root;
  for (const k of ['createEditPlanOutputSchema', 'makeEditPlanOutputSchema', 'createEditPlanSchema']) {
    if (typeof (root && root[k]) === 'function') {
      try {
        const made = root[k]();
        if (made && typeof made.safeParse === 'function') return made;
      } catch (e) { /* abaikan; dianggap tidak tersedia */ }
    }
  }
  return null;
}

function pickValidator(mod) {
  if (!mod) return null;
  const root = mod.__esModule && mod.default ? mod.default : mod;
  for (const k of ['validateEditPlanOutput', 'validateEditPlan', 'assertEditPlanOutput', 'verifyEditPlanOutput']) {
    if (typeof (root && root[k]) === 'function') return root[k];
  }
  return null;
}

function pickDestructiveOps(mod) {
  if (!mod) return null;
  const root = mod.__esModule && mod.default ? mod.default : mod;
  const list = [root && root.DESTRUCTIVE_OP_TYPES, root && root.destructiveOpTypes, root && root.HIGH_RISK_OP_TYPES]
    .find((v) => Array.isArray(v) && v.length > 0);
  return list ? list.map(String) : null;
}

function mapIssues(error) {
  if (Array.isArray(error)) {
    return error.slice(0, MAX_ISSUES).map((i) => ({
      path: Array.isArray(i && i.path) ? i.path.join('.') : String((i && i.path) || ''),
      message: String((i && i.message) || 'invalid').slice(0, 160),
    }));
  }
  const issues = (error && Array.isArray(error.issues)) ? error.issues : [];
  return issues.slice(0, MAX_ISSUES).map((i) => ({
    path: Array.isArray(i.path) ? i.path.join('.') : String(i.path || ''),
    message: String(i.message || 'invalid').slice(0, 160),
  }));
}

function runValidator(validator, value) {
  try {
    const out = validator(value);
    if (out === true || out === undefined) return { ok: true, issues: [] };
    if (out === false) return { ok: false, issues: [{ path: '', message: 'validator_rejected' }] };
    if (out && typeof out === 'object') {
      const ok = out.ok === true || out.success === true || out.valid === true;
      return { ok, issues: ok ? [] : mapIssues(out.error || out.issues) };
    }
    return { ok: true, issues: [] };
  } catch (e) {
    return { ok: false, issues: mapIssues((e && e.error) || (e && e.issues) || e) };
  }
}

function buildGate(raw) {
  const schema = pickSchema(raw);
  const validator = pickValidator(raw);
  const ops = pickDestructiveOps(raw);
  if (ops) destructiveOps = new Set(ops);

  return {
    available: true,
    schema,
    validatePlan(plan) {
      let result = { ok: true, issues: [] };
      if (validator) result = runValidator(validator, plan);
      else if (schema) {
        const parsed = schema.safeParse(plan);
        result = parsed.success ? { ok: true, issues: [] } : { ok: false, issues: mapIssues(parsed.error) };
      }
      return result;
    },
  };
}

async function loadCanonical() {
  for (const candidate of CANONICAL_CANDIDATES) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = await loadModule(candidate);
      const gate = buildGate(raw);
      if (!gate.schema && !pickValidator(raw)) {
        return { available: false, source: candidate, reason: 'no_editplan_export' };
      }
      return { available: true, source: candidate, gate };
    } catch (err) {
      return {
        available: false,
        source: candidate,
        reason: `load_failed:${(err && err.code) || (err && err.name) || 'ERROR'}`,
      };
    }
  }
  return { available: false, source: null, reason: 'schema_file_not_found' };
}

/**
 * Status gate (memoized). Berkas yang belum ada / belum bisa dimuat di-probe ulang
 * setiap `RE_PROBE_MS` supaya mendaratnya schema Stage 4 tidak butuh restart kode.
 */
async function getGate({ force = false } = {}) {
  const fresh = state.gate && Date.now() - state.checkedAt < RE_PROBE_MS;
  if (state.gate && !force && (state.gate.available || fresh)) return state.gate;

  const loaded = await loadCanonical();
  state = {
    gate: loaded.available
      ? { ...loaded.gate, source: loaded.source }
      : { available: false, source: loaded.source, reason: loaded.reason },
    checkedAt: Date.now(),
    unavailableWarned: loaded.available ? false : state.unavailableWarned,
  };
  if (!loaded.available) {
    destructiveOps = new Set(FALLBACK_DESTRUCTIVE_OP_TYPES);
    warnUnavailableOnce(loaded.reason);
  }
  return state.gate;
}

function gateStatus() {
  const g = state.gate;
  return {
    available: Boolean(g && g.available),
    source: (g && g.source) || null,
    reason: g && g.available ? null : ((g && g.reason) || 'not_probed'),
    destructiveOpTypes: [...destructiveOps],
    mockAi: config.mockAi,
  };
}

// -------------------------------------------------------------- invariant
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Invarian lintas-field yang TIDAK bisa dijamin schema biasa (§3.3 butir 3 & 4).
 * Selalu dievaluasi — termasuk saat schema kanonik belum tersedia.
 */
function checkPlanInvariants(plan, ctx = {}) {
  const reasons = [];
  if (!isPlainObject(plan)) return { ok: false, reasons: ['editplan_not_object'] };

  const requiresConfirm = plan.requiresConfirm === true;
  const ops = Array.isArray(plan.ops) ? plan.ops : [];

  if (plan.isDestructive === true && !requiresConfirm) reasons.push('destructive_plan_without_confirm');

  const risky = ops
    .filter((op) => op && destructiveOps.has(String(op.opType)))
    .map((op) => String(op.opType));
  if (risky.length > 0 && !requiresConfirm) reasons.push(`destructive_op_without_confirm:${risky[0]}`);

  if (ctx.operationClass === 'D' && !requiresConfirm) reasons.push('class_d_without_confirm');

  return { ok: reasons.length === 0, reasons };
}

function invalidResponse(message, reasons) {
  return makeError(ErrorCodes.AI_INVALID_RESPONSE, message, {
    httpStatus: 502,
    retryable: true,
    details: { issues: (reasons || []).slice(0, MAX_ISSUES).map((r) => (typeof r === 'string' ? { path: '', message: r } : r)) },
  });
}

// ------------------------------------------------------------- assertions
/** Validasi satu EditPlan (schema kanonik + invarian). Melempar ERR_AI_INVALID_RESPONSE. */
function assertEditPlanOutput(plan, ctx = {}) {
  if (isUnavailable() && !config.mockAi) {
    throw invalidResponse('Skema EditPlan kanonik tidak tersedia; output AI ditolak (fail-closed).', ['schema_unavailable']);
  }
  if (isUnavailable()) warnUnavailableOnce();

  if (!isUnavailable()) {
    const verdict = state.gate.validatePlan(plan);
    if (!verdict.ok) throw invalidResponse('Output AI tidak lolos skema EditPlan.', verdict.issues);
  }

  const invariants = checkPlanInvariants(plan, ctx);
  if (!invariants.ok) {
    throw invalidResponse('Output AI memuat operasi destruktif tanpa konfirmasi.', invariants.reasons);
  }
  return plan;
}

/**
 * Opsi klarifikasi (§3.2 `options: [{label, plan}]`) juga bisa memuat EditPlan.
 * - Plan berbentuk penuh (planId + planVersion + ops) → divalidasi schema kanonik.
 * - Plan preview parsial → minimal invarian destruktif ditegakkan (menutup jalur
 *   "selundupkan op destruktif lewat opsi klarifikasi").
 */
function assertOptionPlans(options) {
  if (!Array.isArray(options)) return;
  for (const option of options) {
    const plan = option && option.plan;
    if (!isPlainObject(plan)) continue;
    const isFullPlan = plan.planId !== undefined && plan.planVersion !== undefined && Array.isArray(plan.ops);
    if (isFullPlan) {
      assertEditPlanOutput(plan);
      continue;
    }
    const invariants = checkPlanInvariants(plan);
    if (!invariants.ok) {
      throw invalidResponse('Opsi klarifikasi memuat operasi destruktif tanpa konfirmasi.', invariants.reasons);
    }
  }
}

/** Validasi hasil `/ai/parse-command` & `/ai/refine` (AiParseResult + editPlan). */
function assertParseResult(res) {
  if (!isPlainObject(res)) throw invalidResponse('Output AI bukan objek hasil parse.', ['not_object']);
  const plan = res.editPlan;
  if (plan === undefined || plan === null) {
    if (isUnavailable() && config.mockAi) {
      warnUnavailableOnce();
      return res;
    }
    throw invalidResponse('Output AI tidak memuat editPlan.', [{ path: 'editPlan', message: 'required' }]);
  }
  assertEditPlanOutput(plan, { operationClass: res.operationClass });
  assertOptionPlans(res.options);
  return res;
}

/** Validasi hasil `/ai/chat`: `reply` wajib, `plan` opsional tapi wajib valid bila ada. */
function assertChatResult(res) {
  if (!isPlainObject(res)) throw invalidResponse('Output chat AI bukan objek.', ['not_object']);
  if (typeof res.reply !== 'string') {
    throw invalidResponse('Output chat AI tidak memuat reply.', [{ path: 'reply', message: 'required' }]);
  }
  if (res.plan !== undefined && res.plan !== null) assertEditPlanOutput(res.plan);
  return res;
}

function summarizeIssues(err) {
  const issues = err && err.details && Array.isArray(err.details.issues) ? err.details.issues : [];
  return issues.slice(0, 5).map((i) => String((i && i.message) || '').slice(0, 80));
}

/**
 * Generate + validasi + retry ≤ 2× (§3.3 butir 4). Output tidak valid TIDAK pernah
 * di-cache (`cachedGenerate`), sehingga retry benar-benar memanggil ulang model.
 *
 * @param {object} params
 *  - jobType, input, prompt, genOpts, reqKey, keyFingerprint
 *  - assertFn: (result) => result (melempar ERR_AI_INVALID_RESPONSE bila tidak valid)
 */
async function generateValidated({ jobType, input, prompt, genOpts = {}, reqKey, keyFingerprint, assertFn }) {
  await getGate();
  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      return await gemini.cachedGenerate(
        jobType,
        input,
        () => gemini.generateJson(prompt, { ...genOpts, reqKey }),
        {
          reqKey,
          keyFingerprint,
          noCache: attempt > 0,
          validate: (value) => {
            assertFn(value);
            return { ok: true, issues: [] };
          },
        },
      );
    } catch (err) {
      lastErr = err;
      if (!err || err.code !== ErrorCodes.AI_INVALID_RESPONSE || attempt === MAX_RETRY) throw err;
      logger.warn(
        { attempt: attempt + 1, jobType, issues: summarizeIssues(err) },
        'output AI tidak lolos validasi; mencoba ulang',
      );
    }
  }
  throw lastErr;
}

function __resetGateForTest() {
  state = { gate: null, checkedAt: 0, unavailableWarned: false };
  destructiveOps = new Set(FALLBACK_DESTRUCTIVE_OP_TYPES);
}

module.exports = {
  CANONICAL_CANDIDATES,
  MAX_RETRY,
  getGate,
  gateStatus,
  assertEditPlanOutput,
  assertParseResult,
  assertChatResult,
  checkPlanInvariants,
  generateValidated,
  __resetGateForTest,
};
