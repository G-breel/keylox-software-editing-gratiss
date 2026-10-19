'use strict';

/**
 * Skema Zod payload kanal privasi & data — `api-contract.md` v1.2 §2.15.
 *
 * Dipakai main process (validasi payload IPC sebelum menyentuh settings/DB) dan
 * unit test. Data murni (CJS), tanpa rahasia.
 *
 * Payload yang dicakup:
 *  - `privacy:getMode`     → `{}`
 *  - `privacy:setMode`     → `{ mode }`
 *  - `privacy:confirmExternal` → `{ provider, purpose, scope }`
 *  - `data:wipeLocal`      → `{ scope, confirm: true }`
 *  - `data:exportLocal`    → `{ includeSecrets? }`
 */

const { z } = require('zod');
const { PRIVACY_MODES, CONFIRM_SCOPES, WIPE_SCOPES } = require('./constants');

const PrivacyModeSchema = z.enum(PRIVACY_MODES);
const ConfirmScopeSchema = z.enum(CONFIRM_SCOPES);
const WipeScopeSchema = z.enum(WIPE_SCOPES);

const PrivacyGetModeSchema = z.object({}).strict();

const PrivacySetModeSchema = z.object({
  mode: PrivacyModeSchema,
}).strict();

const PrivacyConfirmExternalSchema = z.object({
  provider: z.string().min(1).max(64),
  purpose: z.string().max(280).optional(),
  scope: ConfirmScopeSchema,
}).strict();

/** `data:wipeLocal` WAJIB `confirm:true` (§2.15.4) — tanpa itu ERR_VALIDATION_PAYLOAD. */
const DataWipeLocalSchema = z.object({
  scope: WipeScopeSchema,
  confirm: z.literal(true),
}).strict();

const DataExportLocalSchema = z.object({
  includeSecrets: z.boolean().optional(),
}).strict();

module.exports = {
  PrivacyModeSchema,
  ConfirmScopeSchema,
  WipeScopeSchema,
  PrivacyGetModeSchema,
  PrivacySetModeSchema,
  PrivacyConfirmExternalSchema,
  DataWipeLocalSchema,
  DataExportLocalSchema,
};
