'use strict';

// Test helper: boot the REAL backend entrypoint (`backend/src/index.js`) on an
// ephemeral port with MOCK_AI=true, and wait until /health answers.
//
// Why spawn a real process instead of building a Fastify instance in-process:
// the backend is under active development by another stage (Stage 7/API). This
// harness exercises the exact production wiring (index.js: CORS, security
// headers, rate limit, auth+quota hooks, routes) and stays correct no matter how
// that file is refactored. No socket is left open; the child is always killed.

const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BACKEND_DIR = path.join(__dirname, '..', '..', '..', 'backend');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @returns {Promise<{ baseUrl: string, stop: () => Promise<void>, logs: () => string }>}
 */
/**
 * Update helper: `startServer({ env })` — override env tambahan (dipakai test BYOK
 * untuk menyalakan `BYOK_REQUIRE_USER_KEY`, `NODE_ENV=production`, skenario mock, dst).
 */
async function startServer({ timeoutMs = 25000, env: envOverrides = {} } = {}) {
  const port = await getFreePort();
  const env = {
    ...process.env,
    NODE_ENV: 'test',                 // -> not production, no pino-pretty transport
    MOCK_AI: 'true',                  // -> gemini.generateJson returns {} , no network
    GEMINI_API_KEY: '',               // -> no Gemini client
    PORT: String(port),
    HOST: '127.0.0.1',
    // >= 32 chars so resolveJwtSecret() does not fall back / exit.
    JWT_SECRET: 'qe-test-secret-do-not-use-in-production-0123456789',
    ALLOWED_ORIGINS: '',
    LOG_LEVEL: 'silent',
    ...envOverrides,
    PORT: String(port),               // PORT tidak boleh ditimpa oleh override
  };

  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (d) => { logs += d.toString(); });
  child.stderr.on('data', (d) => { logs += d.toString(); });

  let exited = false;
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code) => { exited = true; resolve(code); });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`Backend exited before becoming ready (code ${child.exitCode}).\n--- backend logs ---\n${logs}`);
    }
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        return {
          baseUrl,
          logs: () => logs,
          stop: async () => {
            if (exited) return;
            child.kill('SIGTERM');
            const winner = await Promise.race([
              exitPromise.then(() => 'exited'),
              sleep(4000).then(() => 'timeout'),
            ]);
            if (winner === 'timeout') child.kill('SIGKILL');
          },
        };
      }
    } catch (err) {
      lastErr = err;
    }
    await sleep(200);
  }

  child.kill('SIGKILL');
  throw new Error(
    `Backend did not become ready within ${timeoutMs}ms (last error: ${lastErr && lastErr.message}).\n--- backend logs ---\n${logs}`
  );
}

module.exports = { startServer, getFreePort, BACKEND_DIR };
