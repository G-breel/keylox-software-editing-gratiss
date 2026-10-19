// E2E journey: import media → edit on the timeline → undo/redo → relink.
//
// Covers the non-AI spine of the editor plus the two boundary cases the spec
// calls out explicitly (missing media / relink, and reversibility AC-4).
//
// NOT EXECUTED in STAGE 7 (see ../README.md). Run later with:
//   npx playwright test -c tests/e2e/playwright.config.ts -g "import media"
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type AppHandle } from '../helpers/electronApp';

test.describe('import media, edit, undo/redo, relink', () => {
  let app: AppHandle;

  test.beforeEach(async () => {
    app = await launchApp();
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('imported clip lands on the timeline and is reversible (AC-4)', async () => {
    const { window } = app;

    // Setup via IPC: create the project + a temp media file the app can import.
    const projectId = await window.evaluate(async () => {
      const api = (window as unknown as { keylox: { project: { create(n: string): Promise<{ id: string }> } } }).keylox;
      const p = await api.project.create('e2e-undo');
      return p.id;
    });
    expect(projectId).toBeTruthy();

    await window.getByRole('button', { name: /import|impor/i }).click();
    // The file dialog is OS-native; the app must expose an import-by-path affordance
    // for tests (see the test-id contract in 05-test-plan.md §"Test-id contract").
    await window.getByTestId('import-dialog-path').fill('tests/fixtures/media/sample-1080p-3s.mp4');
    await window.getByRole('button', { name: /add to timeline|tambahkan/i }).click();

    // Auto-waiting assertion on the final state, not on a timer.
    const timelineClip = window.getByTestId('timeline-clip').first();
    await expect(timelineClip).toBeVisible();
    const clipsBefore = await window.getByTestId('timeline-clip').count();

    // Undo must remove it in ONE step (AC-4).
    await window.getByRole('button', { name: /undo|batalkan/i }).click();
    await expect(window.getByTestId('timeline-clip')).toHaveCount(clipsBefore - 1);

    // Redo restores it.
    await window.getByRole('button', { name: /redo|ulangi/i }).click();
    await expect(window.getByTestId('timeline-clip')).toHaveCount(clipsBefore);
  });

  test('missing media offers relink instead of crashing', async () => {
    const { window } = app;

    // Seed a project whose manifest points at a file that no longer exists.
    await window.evaluate(async () => {
      const api = (window as unknown as { keylox: { project: { createBrokenRef(): Promise<void> } } }).keylox;
      await api.project.createBrokenRef();
    });

    await window.getByRole('button', { name: /import|impor|open|buka/i }).click();
    // The UI must surface a relink affordance, never a hard crash.
    await expect(window.getByRole('dialog', { name: /relink|temukan media/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /locate|temukan/i })).toBeVisible();
  });
});
