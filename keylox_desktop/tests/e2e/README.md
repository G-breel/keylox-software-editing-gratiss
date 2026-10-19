# E2E (Playwright + Electron) — SKELETON, NOT EXECUTED YET

> **Status: skeleton only.** These specs are the intended shape of the
> merge-blocking end-to-end suite, but they are **not run in this stage** because
> the heavy dependencies (`@playwright/test` + the Electron binary) are not part
> of the "jangan install ulang semua" scope of STAGE 7. They are written so a
> later stage can `npm i -D @playwright/test` and make them green without a
> rewrite.

Nothing under `tests/e2e/` is picked up by the two runners that **do** run today:

- `npm run test:unit` → `vitest run`, `include: ['tests/unit/**/*.test.ts']`
- `npm run test:backend` → `node --test "tests/backend/*.test.js"`

So adding this folder does not change the green result of `npm test`.

## What belongs here (and what does not)

E2E owns only the journeys where **the integration itself is the risk** — the
money paths. Everything provable at unit or API level stays down the pyramid
(see `../README.md` and `../../../keylox/docs/superapp/05-test-plan.md`).

| In scope (E2E) | Out of scope (push down) |
|---|---|
| one-prompt edit → export (G-21 / AC-10) | intent parsing correctness → unit |
| import media → timeline → undo/redo | EditPlan schema validity → backend test |
| tracking attach + manual correction (TR-14) | drift math → math unit test |
| relink missing media | path resolution → unit |

## How to enable (later stage)

```powershell
npm i -D @playwright/test
npx playwright install chromium      # Electron uses the bundled Chromium, no download needed
npx playwright test -c tests/e2e/playwright.config.ts
```

`playwright.config.ts` here captures trace + screenshot + video **only on
failure** and sets `retries: 0`: a stable suite blocks the merge on the first
attempt. Enable retries only to *measure* flake, never to hide it.

## Conventions the specs already assume

1. **No `waitForTimeout`.** Wait on element state, a network response, or a URL
   change.
2. **Setup via IPC/API, assert via UI.** Login/seed state is created
   programmatically, not by driving the UI.
3. **Role-first selectors** (`getByRole`), `getByTestId` only as an escape
   hatch. Test ids the app should expose are listed in `docs/superapp/05-test-plan.md`
   §"Test-id contract".
4. **Deterministic data.** Each spec creates its own project/media (temp dir
   under the OS temp), never a shared seed.
