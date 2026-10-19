// E2E helper — launch the built Electron app from Playwright and wait for the
// renderer to be READY (hydration marker), never on a wall-clock sleep.
//
// NOT EXECUTED in STAGE 7 (see ../README.md).
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';

const APP_ROOT = path.join(__dirname, '..', '..'); // keylox_desktop/

export interface AppHandle {
  app: ElectronApplication;
  window: Page;
}

/**
 * Boot Electron and return the first window once the app signals readiness.
 *
 * Readiness contract (must be implemented in the renderer): set
 * `document.documentElement.dataset.appReady = 'true'` after the editor store
 * hydrates. Waiting on that condition replaces the classic
 * `waitForTimeout(...)` race and is what makes this suite deterministic.
 */
export async function launchApp(env: Record<string, string> = {}): Promise<AppHandle> {
  const app = await electron.launch({
    args: ['.'],
    cwd: APP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Point the renderer's backend client at an isolated test backend; the
      // backend itself is seeded in the test's setup, not driven through the UI.
      KEYLOX_API_URL: process.env.KEYLOX_API_URL ?? '',
      ...env,
    },
  });

  const window = await app.firstWindow();
  await window.waitForSelector('html[data-app-ready="true"]', { timeout: 30_000 });
  return { app, window };
}

export async function closeApp({ app }: AppHandle): Promise<void> {
  await app.close();
}
