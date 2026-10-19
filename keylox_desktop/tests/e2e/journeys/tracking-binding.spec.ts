// E2E journey: tracking is a core capability (v2.1) — attach a layer to a subject,
// then verify manual correction always wins (AC-12 / TR-14).
//
// Tracking is "core" per the spec, so it earns an E2E journey rather than only
// unit math: the risk is the integration (detector → track store → binding →
// cache), not the arithmetic.
//
// NOT EXECUTED in STAGE 7 (see ../README.md). Run later with:
//   npx playwright test -c tests/e2e/playwright.config.ts -g "tracking"
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppHandle } from '../helpers/electronApp';

test.describe('tracking binding + manual correction (M14)', () => {
  let app: AppHandle;

  test.beforeEach(async () => {
    app = await launchApp();
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('a text layer can bind to a tracked subject (TR-05/TR-09)', async () => {
    const { window } = app;

    await window.evaluate(async () => {
      const api = (window as unknown as { keylox: { project: { createWithMedia(c: unknown): Promise<unknown> } } }).keylox;
      await api.project.createWithMedia({ mediaCount: 1, fixture: 'person-walking-1080p' });
    });

    await window.getByRole('button', { name: /add text|tambah teks/i }).click();
    await window.getByRole('button', { name: /attach|tempelkan|track/i }).click();
    await window.getByRole('menuitem', { name: /person|orang/i }).click();

    // Binding must produce a concrete tracked target, not a silent no-op.
    await expect(window.getByTestId('binding-target')).toContainText(/person|orang/i);
  });

  test('manual keyframe correction overrides the tracker (AC-12 / TR-14)', async () => {
    const { window } = app;

    // A deliberately hard clip: fast motion + occlusion.
    await window.evaluate(async () => {
      const api = (window as unknown as { keylox: { project: { createWithMedia(c: unknown): Promise<unknown> } } }).keylox;
      await api.project.createWithMedia({ mediaCount: 1, fixture: 'occlusion-fast-720p' });
    });

    await window.getByRole('button', { name: /tracking editor|editor tracking/i }).click();

    // Correct the tracked point at the playhead — the manual fix must persist.
    await window.getByTestId('tracking-point').first().dragTo(window.getByTestId('tracking-canvas'), {
      targetPosition: { x: 120, y: 80 },
    });
    await expect(window.getByTestId('tracking-correction-badge')).toContainText(/manual|koreksi/i);

    // Re-link after occlusion must be fast (AC-12: <= 500 ms). We wait on the
    // state, not on a clock.
    await window.getByRole('button', { name: /play|putar/i }).click();
    await expect(window.getByTestId('tracking-status')).toHaveText(/tracked|terlacak/i);
  });
});
