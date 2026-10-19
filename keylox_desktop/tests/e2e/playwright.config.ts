// E2E skeleton — Playwright driving the packaged/built Electron app.
//
// NOT EXECUTED in STAGE 7 (deps intentionally not installed, see README.md).
// Kept in-tree so the shape of the merge-blocking suite is reviewable now and
// enforceable later. Retries stay 0: a flaky test must fail, not be retried.
//
// Run (later):  npx playwright test -c tests/e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // Journeys are the only thing at the top of the pyramid; keep the count small.
  testMatch: ['journeys/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // pass-on-retry == flake == not "done"
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    // Forensics-first: every CI failure is debuggable without a local repro.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  outputDir: 'test-results',

  // One project per environment axis the product must survive.
  projects: [
    { name: 'electron-1080p', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'electron-4k', use: { viewport: { width: 3840, height: 2160 } } },
  ],
});
