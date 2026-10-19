# Test fixtures

Shared, **deterministic** inputs for the test suite. Nothing here is generated at
runtime; a test that depends on "whatever was in the seed folder" is already
broken (see `../README.md`, rule: *tests own their data*).

> **Current status:** this directory is a manifest + contract. The heavy media
> fixtures are **not committed** (they would bloat the repo). Tests that need
> them generate them locally, or the E2E stage downloads them via the script
> described below. Unit and backend suites need **no** fixtures.

## What each runner needs

| Runner | Fixtures needed today | Where they come from |
|---|---|---|
| `npm run test:unit` (Vitest) | none | inline objects in each test |
| `npm run test:backend` (`node --test`) | none | inline payloads / `MOCK_AI=true` |
| E2E (later) | media clips below | generated on demand, see below |

## Media fixture plan (for the E2E stage)

These names are referenced by `../e2e/**` specs. Keep them tiny and boring.

| File | Purpose | Spec / AC |
|---|---|---|
| `media/sample-1080p-3s.mp4` | basic import + timeline + undo | AC-4 |
| `media/mixed-1080p/` (≥10 clips) | one-prompt full edit | G-21 / AC-10 |
| `media/person-walking-1080p.mp4` | tracking binding to a subject | TR-05 / TR-09 |
| `media/occlusion-fast-720p.mp4` | track drift + re-link after occlusion | AC-12 / TR-04 |
| `media/corrupt-header.mp4` | negative: corrupt media must not crash | §6.1.2 negative cases |
| `media/missing-reference/` | negative: relink flow | AC-4 / relink |

## Generating fixtures (later stage)

Fixtures are produced with the bundled FFmpeg so they are reproducible and small
(a few seconds, low bitrate). A future `tests/fixtures/generate.ps1` should:

```powershell
# 3s 1080p test pattern — deterministic, tiny
ffmpeg -y -f lavfi -i testsrc=size=1920x1080:rate=30:duration=3 `
       -pix_fmt yuv420p tests/fixtures/media/sample-1080p-3s.mp4

# "corrupt" file: valid header truncated mid-stream (must be rejected, not crash)
ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=30:duration=1 `
       -t 0.3 tests/fixtures/media/corrupt-header.mp4
```

Rules:
1. **Deterministic content only** — `testsrc`/`smptebars`, fixed duration, fixed
   fps. No real footage, no PII (privacy §13).
2. **Small** — a few seconds, 360p–1080p, low bitrate. The suite must stay fast.
3. **Never committed if large** — media lives in `.gitignore`; the generator is
   the source of truth.
