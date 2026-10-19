import { defineConfig } from 'vitest/config';

// Stage 7 (QE) — Vitest runner for the RENDERER (TypeScript) unit tests.
//
// Why a separate config: `vite.config.ts` sets `root: 'src/renderer'` (correct
// for the Electron renderer bundle) which would hide `tests/` from Vitest.
// Vitest defaults `root` to the directory of THIS config, so the project root
// stays the test root and only pure-TS unit tests are picked up.
//
// Backend integration tests use Node's built-in runner instead:
//   `node --test tests/backend`
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
    // Determinism: no retries — a flaky expectation must fail, not be hidden.
    retry: 0,
  },
});
