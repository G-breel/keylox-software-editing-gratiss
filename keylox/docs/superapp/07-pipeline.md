# 07 — Pipeline (CI/CD, Build & Rilis)

> **Stage 9 (DevOps) — Keylox Desktop.**
> Semua angka dan keluaran di dokumen ini adalah **hasil eksekusi nyata** di mesin
> pengembangan pada **2026-10-19 (+07:00)**, bukan asumsi. Yang belum dijalankan
> ditandai eksplisit **NOT-VERIFIED** (§9) — tidak ada klaim hijau yang dipinjam.
>
> **Catatan penomoran:** `byok-api-key.md` sudah memakai judul "07 — BYOK". Berkas
> ini diminta sebagai `07-pipeline.md`, jadi nomor 07 kini dipakai dua kali.
> Usulan: ganti judul byok menjadi `08 — BYOK` (dokumen tidak diubah di Stage 9
> untuk menghindari tabrakan referensi antar-stage).

---

## 1. Ringkasan

| Aspek | Status | Bukti |
|---|---|---|
| Repo git + `.gitignore` (rahasia & artefak) | ✅ | §8.1 |
| CI GitHub Actions (5 job, gate secret-scan) | ✅ ditulis & divalidasi sintaks | §3, §8.2 |
| Secret-scan sebagai gate keras | ✅ | §6.1, §8.3 |
| Lint + typecheck | ✅ | §8.4 |
| Test unit (159) + backend (91) | ✅ | §8.5 |
| Build renderer (vite) | ✅ | §8.6 |
| **Build .exe nyata (NSIS + portable)** | ✅ **berhasil** | §7, §8.7 |
| Smoke test paket (aplikasi benar-benar jalan) | ✅ | §8.8 |
| Isi paket bersih dari rahasia/berkas internal | ✅ | §6.3, §8.9 |
| Code signing / SmartScreen | ❌ **NOT-VERIFIED** | §9.2 |
| CI berjalan di runner GitHub | ❌ **NOT-VERIFIED** | §9.1 |

**Toolchain terverifikasi:** Node `v24.11.0`, npm `11.6.1`, git `2.51.2.windows.1`,
Electron `33.4.11`, electron-builder `25.1.8`, Vite `8.3.4`, Vitest `5.0.5`,
TypeScript `7.0.2`, platform Windows 10.0.26100.

---

## 2. Diagram pipeline

```
                        ┌──────────────────────────────────────────────┐
   push main / PR ─────►│  install:  npm ci  (cache npm lockfile)      │
                        └───────────────────┬──────────────────────────┘
                                            ▼
                        ┌──────────────────────────────────────────────┐
                        │ [1] secret-scan            ◄── GATE KERAS    │
                        │     AIza… | sk-… | AKIA… | PEM | JWT|key=    │
                        │     + git ls-files: tolak .env/*.enc di repo │
                        │     exit 1  ⇒  PIPELINE MATI DI SINI         │
                        └───────────────────┬──────────────────────────┘
                                            ▼
                        ┌──────────────────────────────────────────────┐
                        │ [2] lint (node --check) + tsc --noEmit       │
                        └───────────────────┬──────────────────────────┘
                                            ▼
                   ┌────────────────────────┴────────────────────────┐
                   ▼                                                 ▼
     ┌──────────────────────────┐                    ┌──────────────────────────┐
     │ [3a] test unit (vitest)  │                    │ [3b] test backend        │
     │      8 file / 159 tes    │                    │      node:test / 91 tes  │
     │                          │                    │      MOCK_AI, no network │
     └────────────┬─────────────┘                    └─────────────┬────────────┘
                  └──────────────────┬─────────────────────────────┘
                                     ▼
                        ┌──────────────────────────────────────────────┐
                        │ [4] build renderer: secret-scan → vite build │
                        │     + secret-scan ULANG atas dist/renderer   │
                        │     + npm run icons (deterministik)          │
                        │     → artifact: renderer-dist                │
                        └───────────────────┬──────────────────────────┘
                                            ▼
                        ┌──────────────────────────────────────────────┐
                        │ [5] package .exe (MANUAL / workflow_dispatch)│
                        │     npm run build → NSIS + portable          │
                        └──────────────────────────────────────────────┘
```

Aturan pipeline:

- **Tidak ada rahasia di CI.** Nol `secrets.*` dipakai. Tes backend menyuntikkan
  `MOCK_AI=true` + `JWT_SECRET` dummy milik harness (`tests/backend/helpers/server.js`).
- **Gate pertama = secret-scan.** Job lain `needs: secret-scan`; temuan key ⇒
  pipeline berhenti sebelum satu byte pun dikompilasi.
- **`fail-fast: false`** pada matriks tes: kegagalan unit tidak menyembunyikan
  kegagalan backend.
- **Runner `windows-latest`** = platform primer produk (00-spec §2.2) *dan* sama
  dengan lingkungan verifikasi. Lane Linux/macOS **belum** dinyalakan karena
  sebagian tes memakai asumsi path Windows (mis. `tests/unit/securityGuards.test.ts`
  menguji `\\?\C:\…`, `\\.\PIPE\…`) dan portabilitasnya belum diuji di POSIX.

---

## 3. Berkas CI

`.github/workflows/ci.yml` (root repo).

| Job | `needs` | Isi | Pemicu |
|---|---|---|---|
| `secret-scan` | — | `npm ci`; `secret-scan` (seluruh tree incl. `backend/.env.example`); cek `git ls-files` | push `main`, PR, manual |
| `lint-typecheck` | `secret-scan` | `npm run lint` (`node --check main.js/preload.js`), `npx tsc --noEmit` | idem |
| `test` | `lint-typecheck` | matriks `unit` (vitest) & `backend` (`node --test`) | idem |
| `build-renderer` | `test` | `npm run build:renderer`, scan ulang bundle, `npm run icons`, unggah artefak | idem |
| `package-windows` | `build-renderer` | `npm run build` + unggah `.exe` | **manual saja** |

`package-windows` sengaja **manual**: `electron-builder` mengunduh Electron
(~115 MB) + `winCodeSign` + NSIS dari GitHub pada cache dingin. Di CI itu wajar;
di mesin tanpa internet tahap ini gagal — jadi ia tidak boleh memblokir tiap PR.

Validasi lokal yang dilakukan: YAML di-parse (`js-yaml`) dan graf `needs`
diperiksa — 5 job, urutan benar (§8.2). **Job tidak pernah dijalankan di runner
GitHub** (repo belum punya remote) ⇒ §9.1.

---

## 4. Konfigurasi environment (dev / staging / prod)

### 4.1 Prinsip

1. **Rahasia hanya lewat environment/OS keychain, tidak pernah di kode.**
   Aplikasi desktop memakai `safeStorage` (DPAPI di Windows) → `userData/secure/settings.enc`;
   backend memakai environment proses / secret manager.
2. **Build gagal bila rahasia terdeteksi** (`secret-scan`, §6.1) — ini aturan rilis
   dari `byok-api-key.md` §6.
3. **Installer tidak pernah berisi key.** Key milik user diisi di UI Settings dan
   disimpan terenkripsi; mode PROXY memakai `X-Provider-Key` per-request.
   Dibuktikan dengan pemeriksaan isi `app.asar` (§6.3).

### 4.2 Desktop (Electron)

| Variabel | Dev | Staging | Prod | Catatan |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` | `production` mematikan `allowLocalhostDev` pada secret store & AI client |
| `KEYLOX_BACKEND_ORIGIN` | *(kosong)* | `https://staging-api.keylox.app` | `https://api.keylox.app` | Dipakai menyusun CSP `connect-src` di `main.js`. **Dibaca saat runtime** → lihat §10 butir 4 |
| `KEYLOX_E2E` | `1` (hanya E2E) | — | — | bersama `NODE_ENV=test` membuka channel seeding `project:createWithMedia` |
| API key provider | via UI Settings → `safeStorage` | idem | idem | **tidak ada** var env key di aplikasi desktop |

### 4.3 Backend proxy (`keylox_desktop/backend`)

Templat lengkap & tersinkron: **`backend/.env.example`** (26 variabel; seluruh
`process.env.*` yang dibaca `backend/src/**` ada di dalamnya — diverifikasi §6.4).

| Variabel | Dev | Staging | Prod |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | `0.0.0.0` (di belakang proxy) / `8787` | idem |
| `GEMINI_API_KEY` | boleh (key dev) | **kosong** | **kosong** |
| `GEMINI_MODEL` / `GEMINI_MODEL_VERSION` | `gemini-2.5-flash` / `1` | dipin & diumumkan | idem |
| `BYOK_REQUIRE_USER_KEY` | `false` | `true` | `true` |
| `ALLOW_INSECURE_PROVIDER_KEY_LOCALHOST` | `true` | `false` | `false` |
| `ALLOWED_ORIGINS` / `ALLOW_NULL_ORIGIN` | kosong / `true` | origin staging / `false` | origin prod / `false` |
| `TRUST_PROXY` | `false` | `true` (di belakang reverse proxy tepercaya) | `true` |
| `JWT_SECRET` | dummy lokal | secret manager (≥32 char) | secret manager (rotasi berkala) |
| `RATE_LIMIT_*`, `DAILY_QUOTA`, `AUTH_RATE_LIMIT_MAX`, `PROVIDER_KEY_RATE_LIMIT_*` | default | nilai staging | nilai prod |
| `REDIS_URL` | kosong | redis staging (BullMQ) | redis prod |
| `TELEMETRY_ENABLED` | `false` | `false` | `false` |
| `MOCK_AI` | `true` bila offline | `false` | `false` |
| `LOG_LEVEL` | `info`/`silent` saat tes | `info` | `info` |

Aturan mutlak: **jangan pernah bind ke `0.0.0.0` tanpa reverse proxy**, dan
**jangan pernah** menaruh `GEMINI_API_KEY` di staging/prod (mode BYOK).

---

## 5. Perintah rilis (build & package)

```powershell
cd keylox_desktop
npm ci                       # deterministik dari lockfile
npm run secret-scan          # gate 1
npm run lint                 # gate 2a (node --check)
npm run typecheck            # gate 2b (tsc --noEmit)
npm test                     # gate 3 (unit 159 + backend 91)
npm run build                # gate 4 + 5: renderer (vite) → electron-builder --win
```

`npm run build` = `prebuild` (`npm run icons`) → `secret-scan` → `vite build` →
`electron-builder --win`. `npm run ci` menjalankan seluruh gate lokal dalam satu
perintah (tanpa packaging).

| Script | Fungsi |
|---|---|
| `test` / `test:unit` / `test:backend` | vitest (8 file, 159 tes) + `node --test` (91 tes) |
| `secret-scan` | pemindai rahasia (9 rule) — exit 1 bila ada temuan |
| `lint` | `node --check main.js preload.js` (gerbang sintaks proses main) |
| `typecheck` | `tsc --noEmit` |
| `icons` | generate `assets/icon.ico` + `assets/icon.png` (deterministik, tanpa dependensi) |
| `build:renderer` | `secret-scan` → `vite build` → `dist/renderer` |
| `pack` | `build:renderer` + `electron-builder --dir` (smoke test tanpa installer) |
| `build` / `build:mac` / `build:linux` | paket NSIS+portable / dmg / AppImage+deb |

### 5.1 Ikon (sebelumnya hilang)

`assets/` **tidak ada** di repo, padahal `build.win.icon = assets/icon.ico` —
artinya rilis `.exe` sebelumnya akan gagal ("cannot find icon"). Diselesaikan
dengan `scripts/make-icons.mjs`: menggambar keyhole Keylox lalu menulis
`icon.ico` (16/24/32/48/64/128/256 px, DIB 32bpp) dan `icon.png` (512 px) memakai
hanya `node:zlib` — **tanpa biner opaque**, hasil deterministik, dan otomatis
dijalankan oleh hook `prebuild`/`prebuild:mac`/`prebuild:linux`/`prepack`.
macOS memakai `icon.png` (bukan `.icns` yang dipakai versi lama config — berkas itu
tidak pernah ada); konversi `.icns` native belum diverifikasi (§9.2).

### 5.2 Pengerasan paket (`build.files`)

Sebelum Stage 9: `files: ["**/*"]` **dan** `directories.output: "dist"`,
sementara bundle renderer juga hidup di `dist/renderer`. Dua masalah nyata:

1. Berkas internal bisa ikut terbundel: `backend/.env`, `backend/**`, `tests/**`,
   serta `err.txt`/`out.txt` (sisa log runtime). `.env` **terbukti** masuk ke dalam
   `app.asar` pada build pertama Stage 9 (`\err.txt` dan `\out.txt` muncul di daftar
   asar sebelum diperbaiki) — potensi kebocoran ke dalam installer.
2. Bundle renderer berada di dalam folder keluaran electron-builder → ambigu.

Perbaikan yang diverifikasi:

- `directories.output: "release"` (keluaran installer dipisah dari `dist/renderer`
  yang **wajib** ikut ke dalam paket) → `dist/renderer/index.html` terkonfirmasi
  ada di dalam asar.
- `files` diberi negasi: `!**/.env`, `!**/.env.*`, `!**/*.enc|pem|key|p12|pfx`,
  `!**/*.log`, `!err.txt`, `!out.txt`, `!backend/**`, `!tests/**`, `!scripts/**`,
  `!src/renderer/**`, `!release/**`, `!**/*.map`, `!**/*.md`.
- `artifactName` per-target: `${productName}-${version}-${os}-${arch}-setup.${ext}`
  (NSIS) dan `…-portable.${ext}` (portable). Tanpa ini, build pertama menghasilkan
  **satu** berkas `.exe`: target portable menimpa installer NSIS dengan nama sama.

---

## 6. Keamanan pipeline

### 6.1 Gate `secret-scan`

`scripts/secret-scan.mjs` memindai kode yang ikut ter-bundle dan berkas contoh env
dengan 9 rule: `AIza…` (Gemini), `AQ.…`, `sk-…` (OpenAI), `AKIA…` (AWS), PEM
private key, `JWT_SECRET` hardcoded, rahasia generik `key/secret/password/token`,
**fallback tidak aman** (env rahasia yang di-`||` dengan literal string), dan
rahasia di query-string URL. Nilai temuan **tidak pernah dicetak** (hanya termask)
supaya log CI tidak jadi kanal kebocoran baru. Temuan ⇒ `exit 1` ⇒ **CI merah,
rilis berhenti**.

### 6.2 `.gitignore` root (baru)

Mengabaikan: `node_modules/` (semua level), `dist/`, `build/`, `out/`, `release/`,
`.env` + `.env.*` (kecuali `!.env.example`), `*.enc`, `*.pem/key/p12/pfx/keystore/jks`,
log runtime (`err.txt`, `out.txt`, `*.log`), artefak rilis (`*.exe`, `*.dmg`,
`*.AppImage`, `*.blockmap`, …), artefak tes (Playwright), Gradle/Android, dan
`tok.json`.

### 6.3 Temuan keamanan (dilaporkan, tidak disembunyikan)

| # | Temuan | Dampak | Tindakan |
|---|---|---|---|
| F-1 | `err.txt` + `out.txt` ikut ke `app.asar` pada build pertama | Berkas akar proyek terkirim ke user | ✅ diperbaiki (negasi `files`) — diverifikasi 0 berkas terlarang |
| F-2 | Nama artefak NSIS vs portable bentrok → installer tertimpa | Rilis kehilangan installer NSIS | ✅ diperbaiki (`artifactName` per-target) |
| F-3 | `assets/icon.ico` tidak ada tapi dirujuk config | Build `.exe` gagal | ✅ generator ikon + hook `prebuild` |
| F-4 | `tok.json` (root, 382 B) memuat 1 string berbentuk JWT (`eyJ…&#42;&#42;&#42;…`) | Bila token hidup: kebocoran kredensial | ⚠️ **di-gitignore** (tidak ikut commit). **Perlu keputusan pemilik: rotasi & hapus** bila masih berlaku |
| F-5 | `MOCK_AI` dibaca `backend/src/config.js` tapi hanya muncul sebagai komentar di `.env.example` | Developer bisa salah kira mock aktif | ✅ ditambahkan sebagai key eksplisit (`MOCK_AI=false`) |
| F-6 | Tanpa code signing | SmartScreen memblokir/memperingatkan pengguna | ❌ belum — butuh sertifikat (10) |
| F-7 | `keylox/.env` ada di disk dan tidak pernah boleh di-commit | Kebocoran kredensial backend | ✅ ter-ignore (verifikasi §8.1). Isinya tidak dibaca/dicetak oleh Stage 9 |

### 6.4 Audit kelengkapan env

`process.env.*` yang dibaca `backend/src/**` = **26 nama**; `.env.example` sebelum
Stage 9 memuat 25 key aktif (kurang `MOCK_AI`) → ditambal. Setelah perbaikan:
**26 dari 26 key = 100% cakupan** (`dibaca kode = 26`, `di .env.example = 26`,
`kurang: (kosong)`, `ekstra: (kosong)`). Tidak ada rahasia nyata di dalam templat.

### 6.5 Isi paket (gate akhir)

`npx asar list release/win-unpacked/resources/app.asar` → **1762 entri**, dan
pencarian pola `\.env|\.enc|\.pem|err\.txt|out\.txt|^\\backend|^\\tests|^\\scripts|^\\src\\renderer`
menghasilkan **0 baris**. `dist/renderer/index.html` ada (1), FFmpeg terbundel
(188 entri, diekstrak ke `app.asar.unpacked/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`).

---

## 7. Versi artefak & deploy/rollback

### 7.1 Artefak terbangun (2026-10-19)

| Artefak | Ukuran | SHA-256 (64 hex) | Ditandatangani |
|---|---|---|---|
| `release/Keylox-1.0.0-win-x64-setup.exe` (NSIS) | 95.66 MB | `c8feac961e5818c3330ebf418d70e81de0bf795e71f0b1a74ce2a159bfa7bf05` | ❌ NotSigned |
| `release/Keylox-1.0.0-win-x64-portable.exe` | 95.44 MB | `0a1d40507f9116a23c82122c2f8ebf810c145fecc6201f562b4afb9dd240a20` | ❌ NotSigned |
| `release/Keylox-1.0.0-win-x64-setup.exe.blockmap` | 0.1 MB | (peta diff auto-update) | — |
| `release/win-unpacked/` | 355.6 MB | aplikasi ter-unpack (elektron+asar) | — |

Metadata `Keylox.exe`: `ProductName=Keylox`, `ProductVersion=1.0.0.0`,
`FileVersion=1.0.0`, `CompanyName=Keylox`.

### 7.2 Skema versi

- Sumber tunggal: `version` di `keylox_desktop/package.json` (`1.0.0`).
- Format artefak: `Keylox-<version>-<os>-<arch>-<target>.exe` — nama berkas
  membawa versi sehingga rollback bisa ditunjuk persis.
- Versi backend (`keylox_desktop/backend/package.json`) dan versi kontrak
  (`api-contract v1.1`) bergerak terpisah; tambahkan `GEMINI_MODEL_VERSION` bila
  model/model-prompt berubah (sudah ada di env backend).

### 7.3 Langkah deploy (desktop)

1. Gate CI hijau (`secret-scan` → `lint/typecheck` → tes → build renderer).
2. `npm run build` (atau job `package-windows` manual) di Windows.
3. Verifikasi: `Get-FileHash` = hash CI; jalankan `release/win-unpacked/Keylox.exe`
   (smoke, §8.8); cek `app.asar` tidak memuat berkas terlarang (§6.5).
4. Tandatangani + publikasikan (§10).
5. Uji pasang di VM bersih (NSIS) sebelum mengumumkan.

### 7.4 Rollback

| Lapisan | Mekanisme | Catatan |
|---|---|---|
| Desktop | Distribusikan ulang installer **versi sebelumnya** (`Keylox-1.0.0-…-setup.exe`); NSIS non-silent (`oneClick:false`) bisa dipasang di atas versi baru | Belum ada auto-update ⇒ rollback = manual, komunikasikan ke user |
| Auto-update | *Belum aktif*. Rencana: `electron-updater` + `latest.yml`; rollback = un-publish rilis + publish balik berkas lama | `.blockmap` sudah dihasilkan, fondasi siap |
| Data user | Key & preferensi ada di `userData` (terenkripsi `safeStorage`), **tidak** di folder instalasi ⇒ uninstall/rollback tidak menghapus key | Tidak ada migrasi skema yang diperlukan untuk 1.0.x |
| Backend | Deploy artefak versi sebelumnya (image/commit), `JWT_SECRET` **tidak** dirotasi saat rollback (rotasi = semua token invalid) | Rollback model AI = set `GEMINI_MODEL` kembali |

---

## 8. Bukti eksekusi nyata

Semua perintah dijalankan pada 2026-10-19 di `C:\apk\laragon\www\keylox\`.

### 8.1 `git init` + verifikasi `.gitignore`

```
Initialized empty Git repository in C:/apk/laragon/www/keylox/.git/

$ git check-ignore -v keylox\.env keylox_desktop\node_modules keylox_desktop\backend\node_modules keylox_desktop\dist keylox_desktop\err.txt keylox_desktop\out.txt tok.json
keylox/.gitignore:1:.env                  "keylox\\.env"
keylox_desktop/.gitignore:1:node_modules/ "keylox_desktop\\node_modules"
keylox_desktop/backend/.gitignore:1:node_modules/  "keylox_desktop\\backend\\node_modules"
keylox_desktop/.gitignore:2:dist/         "keylox_desktop\\dist"
.gitignore:42:err.txt                     "keylox_desktop\\err.txt"
.gitignore:43:out.txt                     "keylox_desktop\\out.txt"
.gitignore:25:tok.json                    tok.json

$ git status --short
?? .github/            ?? keylox/                ?? ai_video_editor.html
?? .gitignore          ?? keylox_desktop/        ?? comfyui_colab_manga.ipynb
?? android_video_editor/  ?? comic_2panel.html   ?? naruto_turnaround.html
# → 118 berkas siap-commit; 0 entri cocok pola dist/|release/|node_modules
# → keylox/.env TIDAK muncul (ter-ignore)
```

> Catatan: status ini adalah **pre-commit** (repo baru, belum ada commit).
> Stage 9 **tidak** melakukan commit — keputusan pemilik apakah berkas non-Keylox
> di root (`ai_video_editor*.html`, `comic_2panel.html`, `naruto_turnaround.html`,
> `comfyui_colab_manga.ipynb`, `android_video_editor/`) ikut ke repo yang sama.

### 8.2 Validasi sintaks workflow

```
$ node -e "yaml.load(ci.yml) …"
YAML OK — name=CI
on: ["push","pull_request","workflow_dispatch"]
defaults: {"run":{"working-directory":"keylox_desktop"}}
- secret-scan    runs-on=windows-latest needs=[]                steps=5
- lint-typecheck runs-on=windows-latest needs="secret-scan"     steps=5
- test           runs-on=windows-latest needs="lint-typecheck"  steps=6
- build-renderer runs-on=windows-latest needs="test"            steps=7
- package-windows runs-on=windows-latest needs="build-renderer" steps=6 if=github.event_name == 'workflow_dispatch'
total jobs=5
```

### 8.3 Gate 1 — secret-scan

```
$ npm run secret-scan
> node scripts/secret-scan.mjs
secret-scan: BERSIH (55 berkas dipindai, 0 temuan).
EXIT=0

$ node scripts/secret-scan.mjs main.js preload.js index.html src scripts backend backend/.env.example
secret-scan: BERSIH (56 berkas dipindai, 0 temuan).      # varian yang dipakai CI
EXIT=0

$ node scripts/secret-scan.mjs ../keylox/docs
secret-scan: BERSIH (10 berkas dipindai, 0 temuan).      # dokumen pun dipindai
DOC_SCAN_EXIT=0
```

### 8.4 Gate 2 — lint + typecheck

```
$ npm run lint
> node --check main.js && node --check preload.js
EXIT=0

$ npx tsc --noEmit
tsc: 0 error
EXIT=0                                            # TypeScript 7.0.2
```

### 8.5 Gate 3 — tes

```
$ npm run test:unit                        # vitest 5.0.5
 Test Files  8 passed (8)
      Tests  159 passed (159)
   Duration  880ms

$ npm run test:backend                     # node --test
ℹ tests 91
ℹ pass 91
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6147.9045
EXIT=0
```

Total **250 tes hijau** (159 unit + 91 backend), tanpa jaringan (backend dijalankan
dengan `MOCK_AI=true` oleh harness).

### 8.6 Gate 4 — build renderer

```
$ npm run build:renderer
secret-scan: BERSIH (55 berkas dipindai, 0 temuan).
vite v8.3.4 building client environment for production...
✓ 35 modules transformed.
dist/renderer/index.html                   0.81 kB │ gzip:  0.49 kB
dist/renderer/assets/index-DsZ8SLfb.css   11.04 kB │ gzip:  3.36 kB
dist/renderer/assets/index-D7J_vlPV.js   282.02 kB │ gzip: 86.20 kB
✓ built in 626ms
EXIT=0
```

> Peringatan (bukan error): Vite memperingatkan `configLoader: 'native'` — ESM di
> `vite.config.ts` yang dimuat sebagai CJS. Belum memblokir; rapikan di rilis
> berikutnya (§10 butir 6).

### 8.7 Gate 5 — build `.exe` (nyata, **BERHASIL**)

```
$ npm run build
icons: assets/icon.ico (16,24,32,48,64,128,256 px, 372526 B) di-generate.
icons: assets/icon.png (512 px, 40026 B) di-generate.
secret-scan: BERSIH (55 berkas dipindai, 0 temuan).
✓ built in 626ms
  • electron-builder  version=25.1.8 os=10.0.26100
  • packaging       platform=win32 arch=x64 electron=33.4.11 appOutDir=release\win-unpacked
  • downloading     url=https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-win32-x64.zip size=115 MB parts=8
  • downloaded      … duration=16.096s                       # cache dingin (run pertama)
  • updating asar integrity executable resource  executablePath=release\win-unpacked\Keylox.exe
  • building        target=nsis     file=release\Keylox-1.0.0-win-x64-setup.exe     archs=x64 oneClick=false perMachine=false
  • building block map  blockMapFile=release\Keylox-1.0.0-win-x64-setup.exe.blockmap
  • building        target=portable file=release\Keylox-1.0.0-win-x64-portable.exe  archs=x64
  • no signing info identified, signing is skipped  signHook=false cscInfo=null
BUILD_EXIT=0   durasi=42.2s (cache hangat; run pertama ±2 menit karena unduhan)

$ Get-ChildItem release -File
Name                                       MB
Keylox-1.0.0-win-x64-portable.exe       95.44
Keylox-1.0.0-win-x64-setup.exe          95.66
Keylox-1.0.0-win-x64-setup.exe.blockmap   0.1
builder-debug.yml                        0.01
```

Jaringan tersedia saat build dijalankan (`Test-NetConnection github.com:443 → True`),
jadi unduhan Electron/NSIS/winCodeSign berhasil dan **packaging tidak gagal**.
Pada mesin tanpa internet, run pertama tetap akan gagal di tahap unduhan ini —
sebutkan bila itu terjadi (`ELECTRON_MIRROR`/cache offline adalah jalannya).

### 8.8 Smoke test paket (aplikasi dijalankan)

```
$ Start-Process release\win-unpacked\Keylox.exe -PassThru
pid=14484
HASIL: proses HIDUP setelah 9s; MainWindowTitle='Keylox - AI Video Editor';
       WorkingSet=100.4 MB
cleanup: proses dihentikan; sisa proses Keylox: 0
```

Membuktikan paket **tidak korup** dan proses main + `BrowserWindow` berjalan
dengan bundel renderer terpasang. Isi tampilan renderer tidak diperiksa secara
visual (tidak ada assertion DOM di Stage 9).

### 8.9 Gate isi paket

```
$ npx asar list release\win-unpacked\resources\app.asar
entri asar=1762
BERSIH: 0 berkas terlarang di dalam paket   # pola .env|.enc|.pem|err.txt|out.txt|backend|tests|scripts|src\renderer
ada dist/renderer/index.html?  1
ffmpeg dibundel?             188 entri
```

Daftar top-level asar: `dist/renderer/**`, `index.html`, `main.js`, `preload.js`,
`package.json`, `src/main/*.js`, `src/shared/editPlan.schema.js` (+ `node_modules/`
produksi). Tidak ada `err.txt`, `out.txt`, `backend/`, `tests/`, `scripts/`,
`src/renderer/`.

### 8.10 Pemeriksaan sinkronisasi lockfile

```
$ npm ci --dry-run --no-audit --no-fund
added 63 packages in 1s
CI_DRYRUN_EXIT=0      # tidak ada EUSAGE → package.json ⇄ package-lock.json sinkron
```

---

## 9. Status VERIFIED vs NOT-VERIFIED

### 9.1 NOT-VERIFIED — pipeline di runner GitHub

`ci.yml` di-parse dan grafnya diperiksa **lokal**, tetapi **belum pernah dijalankan
`actions/runner`** karena repo belum punya remote dan belum ada commit. Maka
`secret-scan`/`lint`/`test`/`build-renderer` sebagai **job CI** berstatus
NOT-VERIFIED; yang VERIFIED adalah perintah-perintahnya (§8.3–§8.6) dijalankan
lokal dengan exit code 0. Verifikasi runner = tugas pertama setelah push.

### 9.2 NOT-VERIFIED lainnya (jujur, belum dijalankan)

| Item | Alasan |
|---|---|
| Code signing Windows + timestamping | Tidak ada sertifikat EV/OV di mesin ini; `Get-AuthenticodeSignature → NotSigned` |
| SmartScreen / reputasi installer | Turunan dari signing |
| Build macOS (`dmg`) & `.icns` | Butuh macOS + `iconutil`/notarization |
| Build Linux (`AppImage`, `deb`) | Belum dijalankan; `icon.png` sudah dipakai |
| Pemasangan NSIS di VM bersih | Yang diuji = `win-unpacked\Keylox.exe`, bukan hasil install |
| E2E Playwright (3 journey) | Tidak dijalankan di Stage 9 (butuh fixture media + Electron harness); statusnya sama seperti Stage 7 |
| Auto-update (`electron-updater`) | Belum diimplementasikan (`latest.yml` belum ada) |
| Lane CI Linux/macOS | Portabilitas tes POSIX belum diverifikasi |
| Ukuran/lamanya `npm ci` penuh di CI (unduh Electron 115 MB) | hanya `--dry-run` yang diverifikasi |

---

## 10. Sisa pekerjaan menuju rilis

1. **Push ke GitHub + jalankan CI pertama**; lalu nyalakan branch protection
   (`secret-scan`, `lint-typecheck`, `test`, `build-renderer` sebagai *required checks*).
2. **Putuskan F-4 (`tok.json`)**: rotasi + hapus berkas, atau buktikan token sudah mati.
   Sekaligus audit `keylox/.env` (rotasi bila pernah ter-push ke mana pun).
3. **Sertifikat code signing** (OV/EV) + `CSC_LINK`/`CSC_KEY_PASSWORD` di secret CI;
   aktifkan timestamping. Tambahkan macOS notarization bila macOS masuk lingkup.
4. **`KEYLOX_BACKEND_ORIGIN` saat runtime**: CSP dibaca dari env proses, tetapi
   aplikasi yang dipasang lewat shortcut tidak mewarisi env shell. Pindahkan ke
   konfigurasi build-time (mis. `define`/`extraMetadata`) atau ke store preferensi
   yang divalidasi, supaya origin backend produksi benar-benar terkunci.
5. **Tambahkan ESLint** (sekarang `lint` = `node --check` saja) + jalankan
   `tsc --noEmit` juga atas `tests/**` (sekarang hanya `src/renderer` + `vite.config.ts`).
6. **Rapikan peringatan Vite `configLoader: 'native'`** (ESM di `vite.config.ts`).
7. **Auto-update** (`electron-updater` + `latest.yml`) dan kebijakan kanal
   (stable/beta) — `.blockmap` sudah dihasilkan tiap build.
8. **Uji installer NSIS di VM bersih** (install → jalankan → uninstall → sisa file),
   termasuk perilaku `oneClick:false` + `allowToChangeInstallationDirectory`.
9. **E2E di CI** (lane non-blocking dulu, lalu merge-blocking setelah stabil) sesuai
   `05-test-plan.md` §10.
10. **SLA & observability rilis**: catat pass-rate, MTTR, dan ukuran artefak per
    rilis; target MTTR < 30 menit dan pass-rate gate ≥ 99.5%.

---

*Stage 9 (DevOps) — Keylox Desktop · 2026-10-19 · semua bukti di §8 dihasilkan oleh
perintah yang benar-benar dijalankan pada mesin ini; ketiadaan bukti dinyatakan
sebagai NOT-VERIFIED, bukan hijau.*
