#!/usr/bin/env node
/**
 * Secret scanner Keylox (Stage 8 gate — lihat docs/superapp/byok-api-key.md §6).
 *
 * Aturan: build gagal bila terdeteksi string yang menyerupai rahasia di kode
 * yang ikut ter-bundle, atau pola fallback rahasia yang tidak aman.
 * Nilai rahasia TIDAK pernah dicetak (hanya termask) agar log CI tidak bocor.
 *
 * Pemakaian:
 *   node scripts/secret-scan.mjs [path ...]
 * Tanpa argumen: memindai jalur default proyek.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_TARGETS = [
  'main.js',
  'preload.js',
  'index.html',
  'src',
  'scripts',
  'backend/src',
  'backend/.env.example',
  'dist/renderer',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.vite']);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.html', '.css', '.md', '.example', '.sql', '.yml', '.yaml']);

const RULES = [
  { name: 'GEMINI_API_KEY (format AIza)', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'GEMINI_API_KEY (format AQ.)', re: /AQ\.[A-Za-z0-9_-]{25,}/g },
  { name: 'OpenAI key (sk-)', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'AWS access key id (AKIA)', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Private key PEM', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'JWT secret hardcoded', re: /JWT_SECRET\s*[:=]\s*['"][^'"]{4,}['"]/g },
  { name: 'Rahasia API key hardcoded', re: /\b(api[_-]?key|apikey|secret|password|passwd|token)\b\s*[:=]\s*['"][A-Za-z0-9_\-./+]{16,}['"]/gi },
  { name: 'Fallback rahasia tidak aman (env || literal)', re: /process\.env\.[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z0-9_]*\s*\|\|\s*['"][^'"]+['"]/g },
  { name: 'Rahasia di query string URL', re: /[?&](key|api_key|apikey|access_token|token)=[A-Za-z0-9_\-.]{16,}/g },
];

function mask(value) {
  const v = String(value);
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}${'*'.repeat(Math.min(12, v.length - 6))}${v.slice(-2)}`;
}

function walk(target, files = []) {
  let st;
  try {
    st = statSync(target);
  } catch {
    return files;
  }
  if (st.isDirectory()) {
    for (const entry of readdirSync(target)) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(join(target, entry), files);
    }
    return files;
  }
  const ext = target.slice(target.lastIndexOf('.'));
  if (TEXT_EXT.has(ext) || target.endsWith('.env.example')) files.push(target);
  return files;
}

const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS.map((t) => join(ROOT, t));
const files = targets.flatMap((t) => walk(t));

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  for (const rule of RULES) {
    lines.forEach((line, idx) => {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(line);
      if (m) {
        findings.push({
          file: relative(ROOT, file).split(sep).join('/'),
          line: idx + 1,
          rule: rule.name,
          sample: mask(m[0]),
        });
      }
    });
  }
}

if (findings.length === 0) {
  console.log(`secret-scan: BERSIH (${files.length} berkas dipindai, 0 temuan).`);
  process.exit(0);
}

console.error(`secret-scan: ${findings.length} temuan — build dihentikan.`);
for (const f of findings) {
  console.error(`  [${f.rule}] ${f.file}:${f.line}  sample=${f.sample}`);
}
console.error('Perbaikan: pindahkan rahasia ke environment/OS keychain; rotasi nilai yang sudah terekspos.');
process.exit(1);
