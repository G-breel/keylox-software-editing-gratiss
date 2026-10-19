# Tests — Keylox Desktop

The Stage 7 (QE) test skeleton. Two runners that **actually run today**, plus an
E2E skeleton that is documented but intentionally not executed yet.

```
tests/
├─ unit/                  # Vitest  — pure renderer logic (TypeScript)
│  ├─ aiParser.test.ts
│  └─ editorStore.undo-redo.test.ts
├─ backend/               # node:test — real backend over HTTP
│  ├─ api.smoke.test.js
│  ├─ editPlan.schema.unit.test.js
│  └─ helpers/{server.js, editPlanContract.js}
├─ e2e/                   # Playwright + Electron — SKELETON, not run (see its README)
└─ fixtures/              # deterministic inputs — contract + plan (see its README)
```

## Run

```powershell
npm test                # everything that runs today: unit + backend
npm run test:unit       # Vitest only   (tests/unit/**/*.test.ts)
npm run test:unit:watch # Vitest watch
npm run test:backend    # node:test only (tests/backend/*.test.js)
```

Both are dependency-light on purpose: Vitest is the single added dev dependency;
the backend runner is Node's built-in `node:test`, so it needs **no** install.

## Why these two runners (and not one)

| Layer | Runner | Why |
|---|---|---|
| Renderer logic (store, parser) | **Vitest** | Runs TS directly, jsdom-ready, watches fast. Zustand/immer already in the tree. |
| Backend contract | **`node --test`** | Zero deps. Boots the real `backend/src/index.js` as a child process, so it tests the *production wiring* and is immune to how that file gets refactored. |

## Design rules the suite follows

These are not style preferences; breaking them is how suites rot into
retry-until-green:

1. **No hard sleeps.** No `waitForTimeout`, no `setTimeout` to "let things
   settle". Wait on a condition (element state, a response, a URL change).
2. **Tests own their data.** Every test builds its own inputs inline. Nothing
   depends on a shared seed or on another test's leftovers.
3. **Setup via API/IPC, assert via UI.** Seeding state is programmatic; only the
   journey under test is driven through the interface.
4. **Role-first selectors.** `getByRole` before `getByTestId`; brittle CSS
   chains never.
5. **Zero retries.** `retry: 0` in `vitest.config.mts` and `retries: 0` in the
   E2E config. Pass-on-retry is a *flake signal*, not a pass.
6. **Failures are debuggable from artifacts.** E2E captures trace + screenshot +
   video on failure only.

## Layer strategy (the pyramid)

- **Unit (Vitest):** pure logic — the undo/redo reducer, the offline
  rule-based AI parser, the EditPlan contract schemas. Fast, exhaustive,
  boundary-heavy. This is where most coverage lives.
- **Integration/API (`node --test`):** the backend contract — envelope shape,
  validation errors (400), auth/quota hooks, cache behaviour (AC-11), and a
  schema-valid EditPlan (AC-8). No browser.
- **E2E (Playwright, later):** only the journeys where the *integration itself*
  is the risk — one-prompt edit→export (AC-10), import→undo/redo, tracking
  attach + manual correction (TR-14). Kept deliberately small.
- **Manual/exploratory:** perceptual quality (does the cut "feel" right, is
  tracking visually smooth), device/GPU matrix, installers.

## Relationship to the specs

- Feature set + acceptance criteria: `../keylox/docs/superapp/00-spec.md`
  (AC-1..AC-12, M14 TR-01..TR-15).
- HTTP contract: `../keylox/docs/superapp/api-contract.md` §3.
- Full plan, matrix, negative/boundary cases and release criteria:
  **`../keylox/docs/superapp/05-test-plan.md`**.

The contract (`api-contract.md`) and schema (`04-schema.sql`) are **not** changed
by this test work; the backend tests validate against the contract as written.
