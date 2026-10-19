'use strict';

// Unit tests: anti-SSRF + allowlist provider (api-contract §3.7 butir 3,
// 06-security.md §5.3). Runner: `node --test "tests/backend/*.test.js"`.
//
// Murni fungsi — tanpa server, tanpa jaringan. Semua kasus di bawah adalah
// bentuk serangan yang KONTRAKNYA menyuruh kita tolak.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');
const registry = require(path.join(BACKEND_DIR, 'src', 'services', 'providerRegistry.js'));

const GEMINI = registry.PROVIDERS.gemini;

function reasonOf(fn) {
  try {
    fn();
  } catch (err) {
    return { code: err.code, httpStatus: err.httpStatus, reason: err.details && err.details.reason };
  }
  return null;
}

function expectBlocked(baseUrl, reason) {
  const out = reasonOf(() => registry.assertBaseUrlAllowed(baseUrl, GEMINI));
  assert.ok(out, `baseUrl seharusnya ditolak: ${baseUrl}`);
  assert.equal(out.code, 'ERR_PROVIDER_BASE_URL_NOT_ALLOWED');
  assert.equal(out.httpStatus, 400);
  assert.equal(out.reason, reason, `reason salah untuk ${baseUrl}: ${JSON.stringify(out)}`);
  return out;
}

// ---------------------------------------------------------------- allowlist

test('host provider yang sah (allowlist) diterima', () => {
  assert.equal(registry.assertBaseUrlAllowed('https://generativelanguage.googleapis.com', GEMINI),
    'https://generativelanguage.googleapis.com');
  assert.equal(registry.assertBaseUrlAllowed('https://generativelanguage.googleapis.com/', GEMINI),
    'https://generativelanguage.googleapis.com');
});

test('header baseUrl kosong/absen → null (pakai default SDK)', () => {
  assert.equal(registry.assertBaseUrlAllowed(undefined, GEMINI), null);
  assert.equal(registry.assertBaseUrlAllowed('', GEMINI), null);
  assert.equal(registry.assertBaseUrlAllowed('   ', GEMINI), null);
});

test('host arbitrer ditolak (baseUrl dari klien tidak dipercaya)', () => {
  expectBlocked('https://evil.example.com', 'host_not_allowlisted');
  expectBlocked('https://attacker.tld/v1', 'host_not_allowlisted');
  expectBlocked('https://generativelanguage.googleapis.com.evil.tld', 'host_not_allowlisted');
});

test('provider lain tidak boleh memakai host gemini (dan sebaliknya)', () => {
  const out = reasonOf(() => registry.assertBaseUrlAllowed('https://api.openai.com', GEMINI));
  assert.equal(out.reason, 'host_not_allowlisted');
});

test('skema non-HTTPS ditolak', () => {
  expectBlocked('http://generativelanguage.googleapis.com', 'insecure_scheme');
  expectBlocked('ftp://generativelanguage.googleapis.com', 'unsupported_scheme');
  expectBlocked('file:///etc/passwd', 'unsupported_scheme');
});

test('kredensial di dalam URL ditolak', () => {
  expectBlocked('https://user:pass@generativelanguage.googleapis.com/', 'credentials_in_url');
});

test('port & path non-default ditolak', () => {
  expectBlocked('https://generativelanguage.googleapis.com:8443', 'port_not_allowed');
  expectBlocked('https://generativelanguage.googleapis.com/v1beta', 'path_not_allowed');
});

test('URL rusak ditolak', () => {
  expectBlocked('not a url', 'malformed_url');
});

// ------------------------------------------------- privat / link-local / metadata

test('endpoint metadata cloud ditolak', () => {
  expectBlocked('https://169.254.169.254/computeMetadata/v1/', 'cloud_metadata');
  expectBlocked('https://169.254.169.254/latest/meta-data/', 'cloud_metadata');
  expectBlocked('https://metadata.google.internal/', 'cloud_metadata');
  expectBlocked('https://metadata.goog/', 'cloud_metadata');
});

test('rentang privat/link-local IPv4 ditolak', () => {
  expectBlocked('https://10.0.0.5/', 'private_ip');
  expectBlocked('https://172.16.3.4/', 'private_ip');
  expectBlocked('https://172.31.255.254/', 'private_ip');
  expectBlocked('https://192.168.1.10/', 'private_ip');
  expectBlocked('https://169.254.10.10/', 'private_ip');
  expectBlocked('https://0.0.0.0/', 'private_ip');
});

test('loopback ditolak oleh pemeriksaan host (pengecualian dev diuji terpisah)', () => {
  // `assertBaseUrlAllowed` memberi pengecualian dev untuk loopback (byok §2.2),
  // sehingga pengecualian itu diuji di level proses production (byok.proxy.test.js)
  // dan pemeriksaan murninya di sini.
  assert.equal(registry.blockedHostReason('127.0.0.1'), 'private_ip');
  assert.equal(registry.blockedHostReason('::1'), 'private_ip');
  assert.equal(registry.blockedHostReason('localhost'), 'internal_name');
});

test('rentang privat IPv6 ditolak', () => {
  expectBlocked('https://[fd00::1]/', 'private_ip');
  expectBlocked('https://[fe80::1]/', 'private_ip');
});

test('nama internal/lokal ditolak', () => {
  expectBlocked('https://api.internal/', 'internal_name');
  expectBlocked('https://printer.local/', 'internal_name');
});

test('bentuk IP ter-obfuskasi ditolak (normalisasi URL tidak boleh menipu)', () => {
  expectBlocked('http://2130706433/', 'obfuscated_ip_literal');
  expectBlocked('http://0x7f000001/', 'obfuscated_ip_literal');
  expectBlocked('http://0177.0.0.1/', 'obfuscated_ip_literal');
});

// ------------------------------------------------------------ key & provider

test('format key yang sah diterima dan di-trim', () => {
  const geminiKey = ['AIza', 'k'.repeat(35)].join('');
  assert.equal(registry.assertProviderKeyFormat('gemini', geminiKey), geminiKey);
  assert.equal(registry.assertProviderKeyFormat('gemini', `  ${geminiKey}  `), geminiKey);
  const aqKey = ['AQ.', 'a'.repeat(30)].join('');
  assert.equal(registry.assertProviderKeyFormat('gemini', aqKey), aqKey);
});

test('format key yang tidak sah ditolak tanpa menggemakan nilainya', () => {
  for (const bad of ['', '   ', 'short', 'AIza-terlalu-pendek', 'sk-abc', 'x'.repeat(600), 'AIza with space 0000000000000000000000000000000000']) {
    const out = reasonOf(() => registry.assertProviderKeyFormat('gemini', bad));
    assert.ok(out, `seharusnya ditolak: ${JSON.stringify(bad).slice(0, 30)}`);
    assert.equal(out.code, 'ERR_PROVIDER_KEY_INVALID');
    assert.equal(out.httpStatus, 401);
    assert.ok(!JSON.stringify(out).includes(bad) || bad.length < 6, 'error tidak boleh memuat nilai key');
  }
});

test('X-Provider default openrouter; provider tak dikenal → ERR_PROVIDER_UNSUPPORTED', () => {
  assert.equal(registry.resolveProvider(undefined).id, 'openrouter');
  assert.equal(registry.resolveProvider('').id, 'openrouter');
  assert.equal(registry.resolveProvider('GEMINI').id, 'gemini');
  // v1.2: registry backend kini memuat 13 provider (§2.13) — `openai` SUPPORTED.
  assert.equal(registry.resolveProvider('openai').id, 'openai');
  assert.equal(registry.resolveProvider('groq').id, 'groq');

  const unknown = reasonOf(() => registry.resolveProvider('cohere'));
  assert.equal(unknown.code, 'ERR_PROVIDER_UNSUPPORTED');
  assert.equal(unknown.httpStatus, 400);
});

test('provider tak dikenal ditolak dan label-nya disanitasi (tanpa pantulan mentah)', () => {
  const out = reasonOf(() => registry.resolveProvider('telegram<script>alert(1)</script>'));
  assert.equal(out.code, 'ERR_PROVIDER_UNSUPPORTED');
  assert.equal(out.httpStatus, 400);
});

test('loopback dev: hanya bila flag dev aktif (production menolaknya)', () => {
  // Proses test ini bukan production → flag dev aktif secara default.
  const allowed = registry.assertBaseUrlAllowed('http://localhost:8788', GEMINI);
  assert.equal(allowed, 'http://localhost:8788');
  assert.equal(registry.isLoopbackAddress('127.0.0.1'), true);
  assert.equal(registry.isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(registry.isLoopbackAddress('10.1.2.3'), false);
});
