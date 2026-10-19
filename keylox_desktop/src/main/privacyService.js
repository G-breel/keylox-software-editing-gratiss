'use strict';

/**
 * Layanan privasi & data — `api-contract.md` v1.2 §2.15 (ADR-05).
 *
 * Tanggung jawab:
 *  - mode `local-only | standard | cloud` (default `standard`), disimpan via
 *    `settings.enc` (pref `privacy.mode`) sebelum lapisan DB tersedia (GAP-01);
 *  - konfirmasi `freeTierTraining` (`privacy:confirmExternal`) — `ERR_PRIVACY_CONSENT_REQUIRED`;
 *  - gerbang `local-only` → blokir cloud sebelum jaringan (`ERR_PRIVACY_LOCAL_ONLY_BLOCKED`);
 *  - `provider:custom` selalu dikonfirmasi ulang per sesi (privasi tak diketahui).
 *
 * Modul murni Node + DI (`store`) → dapat diuji unit tanpa Electron.
 */

const { KeyloxError } = require('./errors');
const { getProvider } = require('../shared/providerRegistry');
const {
  PRIVACY_MODES,
  DEFAULT_PRIVACY_MODE,
  PRIVACY_MODE_PREF_KEY,
} = require('../shared/constants');
const { PrivacySetModeSchema, PrivacyConfirmExternalSchema } = require('../shared/privacy.schema');

function prefKeyFor(provider) {
  return `privacy.confirm.${String(provider)}`;
}

/**
 * `jobType` yang mengirim **frame/gambar atau audio** ke provider (§privacy-data §3.3).
 * Untuk job ini, mode `standard`/`cloud` WAJIB konfirmasi eksplisit — tidak cukup
 * hanya mengandalkan `freeTierTraining` (mis. Groq transcribe, OpenAI vision).
 * @type {ReadonlySet<string>}
 */
const MEDIA_CONTENT_JOB_TYPES = new Set([
  'scene_detect', 'ocr', 'thumbnail', 'vision_color', 'transcribe', 'asr',
]);

/**
 * @param {object} deps
 * @param {{getPreference: Function, setPreference: Function}} deps.store
 */
function createPrivacyService(deps) {
  const { store } = deps || {};
  if (!store || typeof store.getPreference !== 'function' || typeof store.setPreference !== 'function') {
    throw new Error('createPrivacyService: store (getPreference/setPreference) wajib.');
  }

  /** Konfirmasi sesi (`once`/`session`) — tidak dipersistenkan ke `always` (§2.15.3). */
  const sessionConfirmations = new Map();

  function getMode() {
    let value = null;
    try {
      const pref = store.getPreference(PRIVACY_MODE_PREF_KEY);
      value = pref && pref.value;
    } catch {
      value = null;
    }
    return PRIVACY_MODES.includes(value) ? value : DEFAULT_PRIVACY_MODE;
  }

  function setMode(mode) {
    const parsed = PrivacySetModeSchema.safeParse({ mode });
    if (!parsed.success) {
      throw new KeyloxError(
        'ERR_VALIDATION_PAYLOAD',
        `Mode privasi harus salah satu dari: ${PRIVACY_MODES.join(', ')}.`
      );
    }
    store.setPreference(PRIVACY_MODE_PREF_KEY, parsed.data.mode);
    return { ok: true, mode: parsed.data.mode };
  }

  function hasConsent(provider) {
    if (sessionConfirmations.has(provider)) return true;
    try {
      const pref = store.getPreference(prefKeyFor(provider));
      const raw = pref && pref.value;
      if (typeof raw === 'string' && raw) {
        // Preferensi hanya boleh primitif; konfirmasi `always` disimpan sebagai JSON string.
        try {
          const parsed = JSON.parse(raw);
          return Boolean(parsed && parsed.grantedAt);
        } catch {
          return raw === 'true';
        }
      }
      return Boolean(raw);
    } catch {
      return false;
    }
  }

  /**
   * §2.15.3 — catat konfirmasi. `scope:'always'` dipersist; `once`/`session` hanya sesi.
   * @returns {{ok:true, grantedAt:string}}
   */
  function confirmExternal(input) {
    const parsed = PrivacyConfirmExternalSchema.safeParse(input && typeof input === 'object' ? input : {});
    if (!parsed.success) {
      throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Payload privacy:confirmExternal tidak valid.');
    }
    const { provider, purpose, scope } = parsed.data;
    const grantedAt = new Date().toISOString();
    const record = { grantedAt, purpose: purpose || null, scope };
    if (scope === 'always') {
      // `settings.enc` hanya menerima nilai primitif → simpan JSON string.
      store.setPreference(prefKeyFor(provider), JSON.stringify(record));
    } else {
      sessionConfirmations.set(provider, record);
    }
    return { ok: true, grantedAt };
  }

  /** Bila konfirmasi ber-scope `once`, konsumsi setelah dipakai. */
  function consumeOnce(provider) {
    const rec = sessionConfirmations.get(provider);
    if (rec && rec.scope === 'once') sessionConfirmations.delete(provider);
  }

  /**
   * Gerbang sebelum `ai:invoke` menyentuh jaringan (§2.12.5, §2.15).
   * @param {string} providerId
   * @param {{jobType?: string}} [options]
   * @returns {{mode:string, provider:string}}
   */
  function assertCanInvoke(providerId, options = {}) {
    const provider = getProvider(providerId);
    if (!provider) {
      throw new KeyloxError('ERR_PROVIDER_UNSUPPORTED', `Provider '${String(providerId).slice(0, 40)}' belum didukung.`);
    }
    const mode = getMode();

    // local-only memblokir SEMUA panggilan cloud; provider lokal tetap jalan (§2.15).
    if (mode === 'local-only' && provider.privacy.leavesDevice !== false) {
      throw new KeyloxError(
        'ERR_PRIVACY_LOCAL_ONLY_BLOCKED',
        'Mode privasi "local-only" memblokir panggilan AI cloud. Pakai model lokal atau ubah mode privasi.',
        { details: { provider: providerId, mode, jobType: options.jobType || null } }
      );
    }

    // Provider yang memakai tier gratis untuk training wajib dikonfirmasi (§2.13.4).
    // Job media (frame/audio) juga wajib konfirmasi eksplisit (§privacy-data §3.3, R4.2).
    const jobType = typeof options.jobType === 'string' ? options.jobType : null;
    const isMediaJob = jobType !== null
      && MEDIA_CONTENT_JOB_TYPES.has(jobType)
      && provider.privacy.leavesDevice !== false;
    const needsConsent = provider.privacy.freeTierTraining === true || providerId === 'custom' || isMediaJob;
    if (needsConsent && !hasConsent(providerId)) {
      throw new KeyloxError(
        'ERR_PRIVACY_CONSENT_REQUIRED',
        `Provider '${providerId}' membutuhkan konfirmasi sebelum konten dikirim keluar device.`,
        {
          details: {
            provider: providerId,
            mode,
            reason: provider.privacy.freeTierTraining === true || providerId === 'custom'
              ? 'free_tier_training'
              : 'media_content',
            jobType,
          },
        }
      );
    }
    if (needsConsent) consumeOnce(providerId);

    return { mode, provider: providerId };
  }

  /** Dipakai `data:exportLocal` — status konfirmasi tanpa nilai sensitif. */
  function confirmationState() {
    const out = {};
    for (const [provider, rec] of sessionConfirmations.entries()) {
      out[provider] = { ...rec, persisted: false };
    }
    return out;
  }

  return {
    getMode,
    setMode,
    confirmExternal,
    hasConsent,
    assertCanInvoke,
    confirmationState,
    PRIVACY_MODES,
  };
}

module.exports = { createPrivacyService };
