# 05 — Bugs & Risiko (Stage 7 / QE)

> **Status:** hasil eksekusi tes nyata pada Stage 7 (QE).
> **Runner:** Vitest (unit) + `node:test` (backend). Node v24.11.0, npm 11.6.1, Windows.
> **Prinsip:** dokumen ini hanya memuat temuan yang **benar-benar** muncul dari
> eksekusi / pembacaan kode. Tidak ada bug yang dikarang. Yang **belum teruji**
> dinyatakan eksplisit sebagai `NOT-TESTED`, bukan diklaim lulus.
> **Kontrak beku:** `api-contract.md`, `04-schema.sql` tidak diubah oleh temuan ini.

---

## 0. Ringkasan Eksekutif

**0 blocker, 0 critical.**

> **`[DIPERBARUI v1.2 — menutup REJ-13]`** Angka di bawah adalah **snapshot Stage 7** (41 unit + 33 backend = 74). Angka **terkini** (Stage 10 review, `08-review.md` §9): **159 unit Vitest + 91 backend = 250 tes lulus**, `secret-scan` **55 berkas** bersih. Snapshot lama dipertahankan sebagai jejak, dengan koreksi di §2.

Seluruh 250 tes yang berjalan hari ini lulus (159 unit + 91 backend). Tidak ada
kegagalan tes. Karena itu **tidak ada bug fungsional blocker/critical** yang dapat
dilaporkan dari eksekusi — melaporkannya berarti mengarang. Item di bawah adalah
(1) satu temuan **keamanan major** (penyimpanan plaintext, kini ditangani via BYOK — lihat BUG-01), dan
(2) item **minor / belum teruji** yang memang belum dieksekusi atau memang
keterbatasan yang diketahui.

| Severity | Total | FIXED | OPEN | NOT-TESTED |
|---|---|---|---|---|
| blocker | 0 | 0 | 0 | 0 |
| critical | 0 | 0 | 0 | 0 |
| major | 1 | 1 | 0 | 0 |
| minor | 5 | 0 | 1 | 4 |
| **TOTAL** | **6** | **1** | **1** | **4** |

---

## 1. Daftar Bug

### BUG-01 — Setelan sensitif disimpan plaintext di `localStorage`; kontrak BYOK (safeStorage) belum terpasang

- **Severity:** `major` (keamanan)
- **Status:** `FIXED` `[v1.2]` — BYOK terpasang (`src/main/secretStore.js` + `safeStorage`, IPC `settings:*`; kontrak v1.1 §2.12). Jalur `localStorage` untuk rahasia **dilarang** & `settings:set` menolak `apiKey` (`ERR_VALIDATION_SECRET_IN_PLAIN_SETTING`). *(Snapshot Stage 7 di bawah dipertahankan; lihat catatan penutup.)*
- **Link:** `keylox_desktop/src/renderer/components/SettingsModal.tsx:10`, `:15`
  (lihat juga `keylox/docs/superapp/byok-api-key.md:14`, `:58-63`)
- **Langkah reproduksi:**
  1. Buka aplikasi, buka Settings, isi *Backend Base URL*, klik **Save**
     (`SettingsModal.tsx:13-18`).
  2. Di DevTools renderer jalankan `localStorage.getItem('backendBaseUrl')`.
  3. Cari sumber: `rg "localStorage" keylox_desktop/src`.
- **Expected:** Setelan rahasia (API key), bila ada, disimpan **terenkripsi OS**
  lewat Electron `safeStorage.encryptString()` di main process, file
  `userData/secure/settings.enc`; renderer **tidak pernah** memegang key penuh
  (`byok-api-key.md` §3).
- **Actual:** Persistensi setelan memakai `localStorage` **plaintext**
  (`SettingsModal.tsx:15`). Riwayat desain mencatat sumber key pernah diletakkan di
  `localStorage` plaintext (`byok-api-key.md:14`, tabel "Sebelum → Sesudah").
  **Klarifikasi jujur atas kode saat ini:** `rg "apiKey|api_key|GEMINI" keylox_desktop/src`
  tidak menemukan key di `localStorage` — field key sudah tidak ada, jadi
  *saat ini* tidak ada rahasia yang tersimpan. Namun lapisan penyimpanannya tetap
  plaintext & tidak terenkripsi, dan secure store BYOK belum dipasang, sehingga
  begitu UI BYOK ditambahkan field key, ia akan mewarisi risiko yang sama.
  Pemindai `secret-scan.mjs` juga **tidak** memindai `localStorage` runtime (hanya
  memindai berkas), jadi tidak akan menangkap kebocoran ini.
- **Rencana penanganan (kini TERLAKSANA):** Implementasi BYOK (`byok-api-key.md` §9): IPC
  `settings:setSecret`/`settings:hasSecret` ke main, `safeStorage` terenkripsi,
  redaction pola `AIza...`/`sk-...`, dan migrasi yang **menghapus** nilai lama dari
  `localStorage`. **`[v1.2]`** Verifikasi: `src/main/secretStore.js` (tulis/baca `settings.enc`),
  `src/main/redact.js`, `tests/unit/secretStore.test.ts`, `tests/unit/redact.test.ts` —
  key tak pernah menyentuh renderer (`settings:hasSecret` hanya mengembalikan `masked`).

---

### BUG-02 — E2E Playwright + Electron belum dijalankan (jalur uang belum tervalidasi end-to-end)

- **Severity:** `minor`
- **Status:** `NOT-TESTED`
- **Link:** `keylox_desktop/tests/e2e/README.md:1`, `keylox_desktop/tests/e2e/playwright.config.ts:3`,
  `keylox_desktop/package.json:11`
- **Langkah reproduksi:**
  1. `cd keylox_desktop`
  2. `npm test` → hanya menjalankan `test:unit` + `test:backend` (`package.json:11`).
  3. `npx playwright test -c tests/e2e/playwright.config.ts` → gagal: `@playwright/test`
     tidak ada di `devDependencies` (`package.json:59-71`).
- **Expected:** Journey berisiko-integrasi tervalidasi di browser: one-prompt →
  export (AC-10), import → timeline → undo/redo, tracking attach + koreksi manual
  (TR-14).
- **Actual:** 3 spec ada sebagai **skeleton** (`tests/e2e/journeys/*.spec.ts`),
  **0 dijalankan**. Karena itu tes ini **tidak** dihitung lulus (§2 Test Plan).

---

### BUG-03 — Kontrak `data-testid` (§8 Test Plan) belum diekspos aplikasi

- **Severity:** `minor`
- **Status:** `NOT-TESTED` (blocker untuk E2E BUG-02)
- **Link:** `keylox_desktop/tests/e2e/journeys/tracking-binding.spec.ts:37`, `:52`, `:55`, `:60`
  (spesifikasi: `05-test-plan.md` §8)
- **Langkah reproduksi:**
  1. `rg "data-testid" keylox_desktop/src -g "*.tsx"`
  2. Amati hasil: **0 kecocokan**.
- **Expected:** Aplikasi mengekspos titik stabil `app-ready`, `prompt-input`,
  `prompt-apply`, `timeline-clip`, `tracking-point`, `tracking-canvas`,
  `tracking-status`, `tracking-correction-badge`, `binding-target`, `export-status`,
  `error-banner` (`05-test-plan.md` §8).
- **Actual:** Tidak ada `data-testid` di seluruh renderer. Uji E2E yang memanggil
  `getByTestId('tracking-point'|'tracking-canvas'|'tracking-correction-badge'|
  'tracking-status'|'binding-target')` **akan gagal** saat dijalankan.

---

### BUG-04 — Permukaan IPC E2E tidak cocok dengan preload nyata

- **Severity:** `minor`
- **Status:** `PARTIALLY-RESOLVED` `[v1.2]` — **kontrak** sudah memutuskan permukaan resmi `window.keylox.*` + channel seeding `project:createWithMedia` (v1.1 §2.11.1/§2.11.2). Implementasi `preload.js` (alias `window.api` + namespace) tetap **tugas Stage 4/5**; E2E tetap belum dijalankan (BUG-02).
- **Link:** `keylox_desktop/preload.js:36-46`,
  `keylox_desktop/tests/e2e/journeys/one-prompt-edit.spec.ts:18-21`,
  `keylox_desktop/tests/e2e/journeys/tracking-binding.spec.ts:27-30`
- **Langkah reproduksi:**
  1. Baca `preload.js` → `contextBridge.exposeInMainWorld('api', { openFiles, openFolder, saveFile, readDir, stat, openInFolder, probe, exportVideo, thumbnail })`.
  2. Baca spec E2E → memanggil `window.keylox.project.createWithMedia({...})`.
- **Expected:** Setup data lewat IPC tersedia (mis. `window.keylox.project.createWithMedia`)
  agar E2E menentukan datanya sendiri (aturan "tests own their data").
- **Actual:** Preload hanya mengekspos **`window.api`** dan **tidak** ada namespace
  `project`/`createWithMedia`. `beforeEach` di spec akan melempar sebelum tes
  berjalan. Ketidakcocokan ini adalah temuan nyata, terlepas dari BUG-02.

---

### BUG-05 — Uji perangkat keras / persepsi belum dijalankan (iGPU, 4K, akurasi tracking)

- **Severity:** `minor`
- **Status:** `NOT-TESTED`
- **Link:** `keylox/docs/superapp/05-test-plan.md` §7.1-§7.2; `00-spec.md` §6.1.2 (AC-12)
- **Langkah reproduksi:**
  1. `rg -l "hwaccel|nvenc|qsv|iGPU" keylox_desktop/tests` → hanya referensi di
     dokumen/matrix, **tidak ada tes yang mengeksekusi**.
  2. Tidak ada proyek uji `4k`/`electron-4k` yang berjalan (project hanya terdaftar
     di `tests/e2e/playwright.config.ts:34`, tidak dieksekusi).
- **Expected:** Fallback CPU otomatis saat iGPU/driver lama; 4K export selesai tanpa
  OOM; drift tracking ≤ 2%/30 s; re-link oklusi ≤ 500 ms; TR-14 koreksi manual selalu
  menang (AC-12, TR-01..TR-15).
- **Actual:** Semua klaim di atas **belum diukur**. Ini risiko nyata pada MVP
  (matriks device + kualitas persepsi), bukan bug yang terbukti.

---

### BUG-06 — Parser offline bersifat single-intent (keterbatasan diketahui)

- **Severity:** `minor`
- **Status:** `OPEN` (by design, terdokumentasi)
- **Link:** `keylox_desktop/src/renderer/lib/aiParser.ts:17-65`,
  `keylox_desktop/tests/unit/aiParser.test.ts:153-157`
- **Langkah reproduksi:**
  1. `node -e "const {parseCommand}=require('./src/renderer/lib/aiParser')"` (di
     lingkungan TS) atau jalankan unit test terkait.
  2. Amati: `parseCommand('brightness 1.2 and export')` → `{ a: 'brightness', v: 1.2 }`.
- **Expected:** Kalimat majemuk idealnya memetakan beberapa op, atau secara eksplisit
  jatuh ke jalur Gemini agar tidak ada op yang hilang diam-diam.
- **Actual:** Hanya op **pertama** yang cocok yang dikembalikan; sisanya diabaikan.
  Ini **diuji & terdokumentasi sengaja** sebagai perilaku yang diketahui
  (`aiParser.test.ts:153-157`). Mitigasi saat ini: `PromptBar` memecah perintah per
  baris (`PromptBar.tsx:155`) dan fallback ke Gemini bila ada baris yang `null`.
  Bukan regresi; dicatat sebagai batasan UX.

---

## 2. Test yang Dijalankan (hasil nyata)

Dijalankan di `C:\apk\laragon\www\keylox\keylox_desktop`, Node v24.11.0, npm 11.6.1.

> **`[DIPERBARUI v1.2 — REJ-13]`** Angka di bawah dulu snapshot Stage 7 (41+33=74, 42 berkas). **Nilai terkini** (Stage 10): **159 unit + 91 backend = 250**, `secret-scan` **55 berkas**.

| Perintah | Layer | Tes | Lulus | Gagal | Durasi |
|---|---|---|---|---|---|
| `npm run test:unit` | Unit (Vitest) | 159 | **159** | 0 | ~1.5 s |
| `npm run test:backend` | Integration/API (`node:test`) | 91 | **91** | 0 | ~5 s |
| `npm test` | Total | **250** | **250** | **0** | ~6.5 s |
| `npm run secret-scan` | Keamanan (statik) | — | **BERSIH** (55 berkas, 0 temuan) | — | ~0.2 s |

Keluaran ringkas (terkini):
```
# Unit (Vitest)
 ✓ tests/unit/*.test.ts   (159 tests total)
 Test Files  N passed      Tests  159 passed (159)

# Backend (node --test)
 ℹ tests 91   ℹ pass 91   ℹ fail 0

# Secret scan
 secret-scan: BERSIH (55 berkas dipindai, 0 temuan).
```

> **Catatan historis Stage 7:** snapshot lama melaporkan `aiParser` 25 + `editorStore` 16 = 41 unit dan 33 backend, serta `secret-scan` 42 berkas. Sejak itu bertambah `secretStore`, `redact`, `securityGuards`, `editPlanSchema`/`editPlanToCommands`, `aiClient`, dan rangkaian backend (ssrf, byok.proxy, editPlanGate, dll).

Mencakup antara lain: `/health` (+alias `/v1`), envelope 404 seragam,
`/ai/parse-command` mengembalikan **EditPlan valid skema (AC-8)**, validasi 400
(`rawText` hilang / >4000 char / `X-Device-Id` non-UUID), **cache hit (AC-11)**,
`/ai/usage`, `/ai/jobs` (CRUD + validasi), `/auth/token` + otorisasi Bearer
(device crossing → 401), unit schema `OP_TYPES` (grup M14) serta batas
`confidence`/`commandRef`/`diffSummary`, dan undo/redo store (P-05/AC-4).

> E2E Playwright **tidak** dihitung lulus karena memang belum dijalankan (BUG-02..BUG-04).

---

## 3. Catatan bagi Stage 8 (handoff)

1. **BUG-01** adalah satu-satunya item ber-severity tinggi; ia masuk lingkup BYOK,
   bukan patch Stage 7. Pastikan `secret-scan.mjs` juga memindai jejak
   `localStorage`/runtime bila memungkinkan, atau tambahkan meta-check pada `preload`.
2. **BUG-02..BUG-04** saling terkait: sebelum mengaktifkan lane E2E sebagai
   merge-blocking, wajib (a) pasang `@playwright/test`, (b) ekspos `data-testid` §8,
   (c) samakan permukaan IPC setup (`window.keylox.project.createWithMedia` atau
   sesuaikan spec ke `window.api`).
3. **BUG-05** membutuhkan matriks perangkat/manual — jadwalkan bersama rilis MVP
   (AC-12 & kriteria rilis `00-spec.md` §12).
4. Nol blocker/critical terbuka saat ini; gate rilis Stage 7 dari sisi tes **hijau**
   untuk cakupan yang benar-benar dieksekusi (unit + backend).
