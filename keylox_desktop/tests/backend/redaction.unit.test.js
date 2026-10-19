'use strict';

// Unit tests: redaksi rahasia di log (byok-api-key.md §3, api-contract §2.12
// invarian 4 & §3.7). Runner: `node --test "tests/backend/*.test.js"`.
//
// Membuktikan bahwa pola key TIDAK BISA keluar lewat logger: baik lewat field
// terlarang (`X-Provider-Key`) maupun lewat string bebas (pesan error provider,
// URL dengan query, stack trace, objek bersarang).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Writable } = require('node:stream');

const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');
const pino = require(require.resolve('pino', { paths: [BACKEND_DIR] }));
const loggerModule = require(path.join(BACKEND_DIR, 'src', 'logger.js'));
const { maskSecret, redactString, redactDeep } = require(path.join(BACKEND_DIR, 'src', 'utils', 'redact.js'));

const FAKE_GEMINI_KEY = ['AIza', 'k'.repeat(35)].join('');   // format §2.12.1
const FAKE_OPENAI_KEY = ['sk-', 'z'.repeat(24)].join('');
const SECRET_RUN = 'k'.repeat(20);                           // potongan di tengah key

function capture() {
  let text = '';
  const stream = new Writable({
    write(chunk, _enc, cb) { text += chunk.toString(); cb(); },
  });
  const options = { ...loggerModule.buildLoggerOptions(), level: 'debug' };
  delete options.transport; // stream in-memory tidak cocok dengan transport worker
  return { log: pino(options, stream), text: () => text };
}

test('logger meredaksi nilai header X-Provider-Key', () => {
  const cap = capture();
  cap.log.info({ headers: { 'x-provider-key': FAKE_GEMINI_KEY, 'x-device-id': 'dev-1' } }, 'request masuk');

  const out = cap.text();
  assert.ok(out.length > 0, 'log harus tertulis');
  assert.equal(out.includes(FAKE_GEMINI_KEY), false, 'key utuh bocor ke log');
  assert.equal(out.includes(SECRET_RUN), false, 'potongan key bocor ke log');
  // Dua lapis proteksi sah: `redact.paths` pino ([REDACTED]) untuk field yang dikenal,
  // atau mask kontrak §2.12 (AIza••••••••) dari hook pola. Keduanya menutup key.
  const masked = out.includes('AIza\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
  const censored = out.includes('[REDACTED]');
  assert.ok(masked || censored, 'nilai header X-Provider-Key tidak termask/tersensor');
});

test('logger meredaksi pola key di dalam pesan bebas (pesan error provider)', () => {
  const cap = capture();
  cap.log.warn({ err: new Error(`upstream 401 API key not valid: ${FAKE_OPENAI_KEY}`) }, `gagal memanggil provider dengan ${FAKE_OPENAI_KEY}`);

  const out = cap.text();
  assert.equal(out.includes(FAKE_OPENAI_KEY), false, 'key di pesan gagal teredaksi');
  assert.equal(out.includes('z'.repeat(20)), false, 'potongan key bocor');
});

test('logger meredaksi key di query string dan di objek bersarang', () => {
  const cap = capture();
  cap.log.debug({
    url: `https://generativelanguage.googleapis.com/v1beta/models?key=${FAKE_GEMINI_KEY}`,
    nested: { deeper: { apiKey: FAKE_GEMINI_KEY, providerKey: FAKE_GEMINI_KEY } },
    list: [FAKE_GEMINI_KEY],
  }, 'trace');

  const out = cap.text();
  assert.equal(out.includes(FAKE_GEMINI_KEY), false, 'key bocor lewat struktur bersarang/query');
  assert.equal(out.includes(SECRET_RUN), false, 'potongan key bocor');
  // Field ini TIDAK ada di `redact.paths` pino, jadi harus ditutup hook pola dan
  // muncul dalam bentuk mask kontrak §2.12 invarian 6.
  assert.ok(out.includes('AIza\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'), 'bentuk mask kontrak tidak terlihat di query/nested');
});

test('logger tidak mengubah log non-rahasia', () => {
  const cap = capture();
  cap.log.info({ method: 'POST', url: '/ai/parse-command', keyFp: 'a1b2c3d4' }, 'request');
  const out = cap.text();
  assert.ok(out.includes('/ai/parse-command'));
  assert.ok(out.includes('a1b2c3d4'), 'fingerprint 8 char harus tetap terlihat untuk debugging');
});

test('maskSecret mengikuti kontrak §2.12 invarian 6', () => {
  assert.equal(maskSecret('pendek'), '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
  const masked = maskSecret('AIza0123456789abcdef');
  assert.equal(masked.startsWith('AIza'), true);
  assert.equal(masked.endsWith('cdef'), true);
  assert.equal(masked.includes('0123456789'), false);
});

test('redactDeep aman untuk struktur siklik, Buffer, dan Error', () => {
  const cyclic = { name: 'root' };
  cyclic.self = cyclic;
  const out = redactDeep({ cyclic, buf: Buffer.from('rahasia'), err: new Error('boom') });
  assert.equal(out.cyclic.self, '[circular]');
  assert.equal(out.buf, '[Buffer]');
  assert.equal(out.err.message, 'boom');
});

test('redactString meredaksi Bearer token (Authorization tidak ikut bocor)', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZXYtMSJ9.signature-part-abc';
  const out = redactString(`Authorization: Bearer ${token}`);
  assert.equal(out.includes(token), false);
});
