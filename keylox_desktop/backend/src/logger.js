'use strict';

const pino = require('pino');
const config = require('./config');
const { redactDeep, redactString } = require('./utils/redact');

/**
 * Logger dengan dua lapis proteksi rahasia (Stage BYOK, api-contract §3.7):
 *
 *  1. `redact.paths` — jalur yang diketahui: header `X-Provider-Key`, `Authorization`,
 *     `X-Device-Id`, plus field rahasia umum (`apiKey`, `token`, …).
 *  2. `hooks.logMethod` — REDAKSI BERBASIS POLA pada SEMUA argumen log (objek, pesan,
 *     dan nilai interpolasi). Ini yang menutup jalur tak terduga: pesan error provider,
 *     URL dengan query `?key=...`, stack trace, `details` dari error, dsb.
 *
 * Konsekuensi: tidak ada pola `AIza…` / `sk-…` / `AQ.…` yang bisa keluar lewat log,
 * bahkan bila pemanggil log tidak sengaja menyerahkan key (byok-api-key.md §3).
 */

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-device-id"]',
  'req.headers["x-provider-key"]',
  'req.headers["x-provider-base-url"]',
  'headers.authorization',
  'headers["x-provider-key"]',
  'x-provider-key',
  'X-Provider-Key',
  '*.apiKey',
  '*.providerKey',
  '*.password',
  '*.token',
  '*.secret',
];

function buildLoggerOptions() {
  return {
    level: config.logLevel,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    hooks: {
      logMethod(args, method) {
        const sanitized = args.map((arg) =>
          (typeof arg === 'string' ? redactString(arg) : redactDeep(arg)));
        return method.apply(this, sanitized);
      },
    },
    transport: config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  };
}

const logger = pino(buildLoggerOptions());

module.exports = logger;
module.exports.buildLoggerOptions = buildLoggerOptions;
