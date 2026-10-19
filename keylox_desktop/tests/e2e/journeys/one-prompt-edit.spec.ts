// E2E journey: one prompt → finished, exportable video (G-21 / AC-10).
//
// The flagship journey. If this breaks, the product's core promise breaks, which
// is exactly why it earns a browser test (see ../README.md).
//
// NOT EXECUTED in STAGE 7 — `@playwright/test` is not installed. Run later with:
//   npx playwright test -c tests/e2e/playwright.config.ts -g "one prompt"
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppHandle } from '../helpers/electronApp';

test.describe('one-prompt full edit (G-21)', () => {
  let app: AppHandle;

  test.beforeEach(async () => {
    // Setup is programmatic: seed a project with >= 10 media assets via the main
    // process IPC (AC-10), so the test never depends on a shared seed folder.
    app = await launchApp();
    await app.window.evaluate(async () => {
      const api = (window as unknown as { keylox: { project: { createWithMedia(c: unknown): Promise<unknown> } } }).keylox;
      await api.project.createWithMedia({ mediaCount: 10, fixture: 'mixed-1080p' });
    });
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('AC-10: one prompt yields a video ready to export without extra steps', async () => {
    const { window } = app;

    // Act through the real UI, selecting like a user.
    await window.getByRole('textbox', { name: /perintah|command/i })
      .fill('buatkan video 30 detik dari 10 klip ini, potong bagian sepi, kasih subtitle');

    // Wait on the network response that matters, not on time (AC-6: parse <= 4s p95).
    const parseResponse = window.waitForResponse(
      (r) => r.url().includes('/ai/parse-command') && r.status() === 200
    );
    await window.getByRole('button', { name: /jalankan|apply|preview/i }).click();
    const res = await parseResponse;
    expect(res.ok()).toBeTruthy();

    // AC-3 / AC-8: destructive ops surface a diff summary + Apply/Batal confirm.
    const confirm = window.getByRole('dialog');
    if (await confirm.isVisible().catch(() => false)) {
      await expect(confirm.getByRole('heading', { name: /ringkasan|summary/i })).toBeVisible();
      await confirm.getByRole('button', { name: /apply|terapkan/i }).click();
    }

    // The end state that AC-10 defines: an exportable video exists.
    await expect(window.getByRole('status')).toContainText(/siap export|ready to export/i, {
      timeout: 60_000,
    });
  });
});
