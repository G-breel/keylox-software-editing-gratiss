'use strict';

/**
 * `data:exportLocal` — ekspor data lokal (`api-contract.md` v1.2 §2.15.5).
 *
 * Kontrak keras (§2.15.5): **`includeSecrets:true` dilarang menyertakan nilai key
 * utuh.** Modul ini hanya pernah menulis `{ hasKey, masked, provider, model }` —
 * tidak ada jalur yang menulis API key ke berkas ekspor.
 *
 * Modul murni Node + DI (`fsImpl`) → dapat diuji unit tanpa Electron.
 * Catatan deviasi: kontrak menyebut ZIP; kita menulis **JSON** karena repo tidak
 * punya dependensi arsip (lihat laporan). Isi & jaminan rahasia tetap sama.
 */

const nodeFs = require('fs');
const nodePath = require('path');
const { KeyloxError } = require('./errors');

/**
 * Bangun payload ekspor (murni — tanpa efek samping).
 * @param {object} input
 * @param {object} [input.settings] Preferensi non-rahasia (provider/model/mode/…)
 * @param {Array<object>|null} [input.secrets] Hasil `store.listSecrets()` — `masked` saja
 * @param {object|null} [input.usage] Ringkasan `UsageSummary` (§2.16)
 * @param {string} [input.appVersion]
 * @param {() => string} [input.now]
 * @returns {object}
 */
function buildExportPayload(input = {}) {
  const now = input.now ? input.now() : new Date().toISOString();
  const payload = {
    format: 'keylox.local-export',
    formatVersion: 1,
    exportedAt: now,
    appVersion: input.appVersion ? String(input.appVersion) : null,
    settings: input.settings && typeof input.settings === 'object' ? { ...input.settings } : {},
    usage: input.usage || null,
  };
  // Info rahasia HANYA bila diminta, dan HANYA bentuk status (tidak pernah nilai key).
  if (Array.isArray(input.secrets)) {
    payload.providerStatus = input.secrets.map((s) => ({
      provider: String(s.provider),
      hasKey: s.hasKey === true,
      masked: typeof s.masked === 'string' ? s.masked : null,
      model: typeof s.model === 'string' ? s.model : null,
    }));
  }
  return payload;
}

/**
 * Tulis payload ekspor ke disk. Kegagalan FS dipetakan ke `ERR_FS_PERMISSION`
 * (§2.15.5) tanpa pernah membocorkan isi.
 * @param {{filePath: string, payload: object, fsImpl?: object}} input
 * @returns {{filePath: string, size: number}}
 */
function writeExportFile(input) {
  const { filePath, payload } = input || {};
  const fsImpl = (input && input.fsImpl) || nodeFs;
  if (typeof filePath !== 'string' || !filePath) {
    throw new KeyloxError('ERR_FS_PERMISSION', 'Lokasi ekspor tidak valid.');
  }
  let json;
  try {
    json = JSON.stringify(payload, null, 2);
  } catch {
    throw new KeyloxError('ERR_FS_PERMISSION', 'Data ekspor tidak dapat diserialisasi.');
  }
  try {
    fsImpl.mkdirSync(nodePath.dirname(filePath), { recursive: true });
    fsImpl.writeFileSync(filePath, json, { encoding: 'utf8' });
  } catch {
    logger2SafeWarn();
    throw new KeyloxError('ERR_FS_PERMISSION', 'Berkas ekspor tidak dapat ditulis.', {
      details: { reason: 'write_failed' },
    });
  }
  return { filePath, size: Buffer.byteLength(json, 'utf8') };
}

/** Dipisah agar pesan/jejak tidak ikut memuat path/urutan stack. */
function logger2SafeWarn() {
  /* sengaja kosong: tidak ada path berkas atau isi payload yang dicatat. */
}

module.exports = { buildExportPayload, writeExportFile };
