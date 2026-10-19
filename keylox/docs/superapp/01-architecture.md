# Arsitektur Keylox — Stage 2

> **Dokumen:** `01-architecture.md` · **Stage 2** dari SUPERAPP_PIPELINE  
> **Sumber kebenaran:** `00-spec.md` v2.2 (desktop Electron, 205 fitur, 251 perintah AI) · `api-contract.md` **v1.2** · `byok-api-key.md` (ADR-03/ADR-04) · `privacy-data.md` (ADR-05)  
> **Status:** Draft — mengikuti spec v2.2 + **REWORK v1.2** (Okt 2026), menunggu GATE 2  
> **Bahasa:** Indonesia · Kontrak ini adalah hukum untuk Stage 4 (Prompt/LLM) dan Stage 5 (Render/Media)

> ### Catatan Versi — Arsitektur v1.2 (Okt 2026)
> Revisi ini menyelaraskan arsitektur dengan kontrak `api-contract.md` **v1.2** dan menutup temuan review Stage 10 (`08-review.md` REJ-01..REJ-14). Ringkas:
> 1. **§5.1 ditulis ulang** — bagian lama mengklaim "tidak ada API key Gemini yang bisa diinput user". Sejak **BYOK (v1.1)** klaim itu **stale**; registry multi-provider (ADR-03) menegaskan key **user** boleh ada, **hanya** di `safeStorage` OS, **hanya** di main process.
> 2. **Modul baru (§3):** `providerRegistry`, `capabilityService`, `privacyService`, `usageService` (main) + padanan backend/renderer.
> 3. **§2 struktur preload diperbaiki (REJ-11):** preload nyata adalah **`preload.js` di root repo**, bukan `src/preload/index.ts`.
> 4. **ADR-03/04/05 (addendum §10)** dirujuk eksplisit (multi-provider, kemampuan+token, privasi-by-design).
> 5. **Invarian ditegaskan:** renderer **tidak pernah** memegang provider key; cache backend tidak menyimpan konten di disk; 1 perintah AI = 1 grup undo.

---

## 0. Ringkasan Eksekutif

Keylox adalah **aplikasi desktop Electron** (Windows primary, macOS/Linux secondary) dengan arsitektur **main/renderer terpisah**, **native FFmpeg** untuk pipeline media berat, dan **AI cloud multi-provider** yang dipanggil lewat salah satu dari dua jalur: **DIRECT (BYOK — key milik user)** atau **PROXY (backend relay)**. Jalur dipilih otomatis dari Settings dan **tidak terlihat** oleh renderer. Semua kemampuan editing, **tracking (M14)**, dan export berjalan **on-device**; cloud hanya untuk pemahaman bahasa/video (NL→EditPlan, ASR, scene detect, OCR, vision). **Tidak ada API key milik developer di binary** (dijaga `scripts/secret-scan.mjs`); key **user** boleh ada tetapi **hanya** di `safeStorage` OS dan **hanya** diakses main process.

**Pola arsitektur utama:** *Modular Monolith dalam satu proses Electron (main) + renderer (Chromium)* dengan boundary jelas: **UI (renderer) → IPC → Main Services → Adapters (FFmpeg, MediaPipe, OS, Provider HTTP)**. Tracking Engine adalah satu modul tunggal (`M14`) yang melayani semua konsumen (teks, efek, mask, cutout, kamera). Lapisan provider AI dipusatkan pada **Provider Registry** sebagai sumber kebenaran tunggal (ADR-03).

---

## 1. Tech Stack & Alasan Pemilihan

### 1.1 Tabel stack

| Lapisan | Teknologi | Versi target | Alasan pemilihan |
|---|---|---|---|
| **Shell desktop** | Electron | 30+ | Cross-platform (Win/macOS/Linux) dari satu codebase; akses Node.js native; Chromium untuk UI kompleks; distribusi `.exe` via electron-builder (NSIS + portable); mendukung multi-window, menu bar, tray, notifikasi OS |
| **UI framework** | React + TypeScript | React 18 | Ekosistem matang; komponen reusable untuk timeline multi-track; type safety; performa dengan virtualization |
| **Build tooling** | Vite + electron-vite | latest | HMR cepat untuk dev; bundling main/preload/renderer terpisah; tree-shaking |
| **State management** | Zustand + Immer | latest | Ringan, tanpa boilerplate Redux; immer untuk immutable update pada timeline besar; selector untuk performa |
| **Styling** | Tailwind CSS | 3.x | Utility-first; konsisten; purge untuk bundle kecil |
| **Media engine (encode/decode/export)** | FFmpeg (binary statis) | 6.x/7.x | Parity codec (H.264/H.265, AAC, MOV/MP4/MKV); hardware accel (NVENC/QuickSync/VAAPI); filter graph untuk color/effect; terbukti di desktop |
| **On-device AI (detektor)** | MediaPipe Tasks (npm `@mediapipe/tasks-*`) | latest | Model open-source (Apache 2.0); Face/Hand/Pose/Gesture/Object/ImageSegmenter/InteractiveSegmenter/ImageClassifier/ImageEmbedder; berjalan di CPU/GPU via WASM/WebGL |
| **Tracking Engine** | Modul internal `M14` di atas MediaPipe + optical flow | internal | Satu sumber kebenaran (transform per frame); melayani semua konsumen |
| **Render graph (preview)** | WebGL 2 / Canvas 2D (fallback) | — | Shader GLSL untuk 17 efek; kompositing GPU; fallback CPU untuk blur |
| **AI cloud** | **Multi-provider via Provider Registry** (`api-contract.md` §2.13; ADR-03) — `gemini`, `openai`, `anthropic`, `openrouter`, `groq`, `deepseek`, `mistral`, `xai`, `together`, `cerebras`, `ollama`, `lmstudio`, `custom` | — | NL→EditPlan, ASR, scene detect, OCR, vision color-matching, metadata, TTS; jalur **DIRECT (BYOK)** / **PROXY (backend relay)**; model default per registry |
| **Backend (proxy & queue)** | Cloud Run / Functions (Node) + Redis (queue) | — | key **user** per-request (BYOK) **atau** key backend (dev/tanpa-BYOK); rate limit; cache ber-hash (TTL ≤ 5 mnt); job async; **tidak** menulis prompt/respons ke disk (§3.8 kontrak) |
| **Storage lokal** | SQLite (better-sqlite3) + file system | — | Proyek, indeks aset, cache hasil AI; performa tinggi di Node main process |
| **Archive proyek** | `.keylox` = ZIP (manifest + SQLite + assets) | — | Portabel, dapat di-share, relink dialog jika media hilang |
| **Packaging** | electron-builder | latest | NSIS installer + portable `.exe`; code signing; auto-update (electron-updater) opsional |
| **Testing** | Vitest + Playwright (E2E) | — | Unit + integrasi + golden-image shader |

### 1.2 Alasan kunci (trade-off)

- **Electron vs Tauri:** Electron dipilih karena ekosistem Node (FFmpeg child_process, better-sqlite3, native modules) dan tooling yang matang; Tauri lebih ringan tapi ekosistem Rust lebih berat untuk tim. Trade-off: ukuran installer lebih besar (~150 MB) dan RAM lebih tinggi — diterima karena fitur editing berat membutuhkan anyway.
- **FFmpeg native vs WebCodecs:** FFmpeg memberikan kontrol penuh (filter graph, HW accel, codec parity) dan stabilitas; WebCodecs lebih ringan tapi coverage codec & filter terbatas. Fallback WebCodecs disiapkan untuk skenario sandbox (RSK-01).
- **MediaPipe vs model proprietary:** wajib open-source (legal). `magic_touch.tflite` dilarang.
- **AI multi-provider — DIRECT (BYOK) vs PROXY:** key milik **developer** tidak boleh di binary (bisa diekstrak) → tetap mutlak. Namun key milik **user** kini diizinkan via BYOK: **DIRECT** (main → provider langsung, tanpa backend) untuk user pribadi, **PROXY** (main → backend → provider) untuk tim/organisasi. Pemilihan otomatis dari Settings (ADR-03). Trade-off: DIRECT menurunkan latensi & biaya infra tetapi memindahkan tanggung jawab rate-limit ke provider; PROXY menambah latensi (target ≤ 4 s p95) tetapi memberi observabilitas biaya & kontrol. Registry multi-provider (13 provider) mencegah vendor lock-in (`byok-api-key.md` §12).
- **Registry sebagai data, bukan `if`:** daftar provider, `modelPatterns`, kapabilitas, harga, dan catatan privasi hidup sebagai **satu berkas data** (`providerRegistry.js`), bukan cabang kode tersebar. Trade-off: sedikit indirection, tetapi menambah provider = menambah baris data, bukan mengubah logika routing.

---

## 2. Struktur Folder / Proyek

```
keylox/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── .env.example
├── build/                      # icon, installer resources
├── resources/                  # FFmpeg binary per platform (bundled)
├── src/
│   ├── main/                   # Node.js process (main)
│   │   ├── index.ts            # entry point, app lifecycle, window mgmt
│   │   ├── windows/            # BrowserWindow factory, multi-window
│   │   ├── ipc/                # IPC handlers (registrasi channel)
│   │   │   ├── project.ipc.ts
│   │   │   ├── media.ipc.ts
│   │   │   ├── tracking.ipc.ts
│   │   │   ├── ai.ipc.ts
│   │   │   ├── export.ipc.ts
│   │   │   ├── settings.ipc.ts
│   │   │   └── system.ipc.ts
│   │   ├── services/           # Business services (main process)
│   │   │   ├── ProjectService.ts
│   │   │   ├── MediaService.ts
│   │   │   ├── FolderIndexService.ts
│   │   │   ├── TrackingService.ts      # wraps TrackingEngine
│   │   │   ├── AiService.ts            # klien AI: routing DIRECT/PROXY
│   │   │   ├── providerRegistry.js     # [v1.2] wrapper/penegak registry (data murni di `shared/`)
│   │   │   ├── providerPolicy.js       # [v1.2] validasi key/baseUrl/anti-SSRF (sudah ada)
│   │   │   ├── capabilityService.js    # [v1.2] gate jobType → kapabilitas (ADR-04)
│   │   │   ├── privacyService.js       # [v1.2] mode privasi + konfirmasi (ADR-05)
│   │   │   ├── usageService.js         # [v1.2] token/cost → ai_usage_records (ADR-04)
│   │   │   ├── secretStore.js          # [v1.2] safeStorage: key per provider (sudah ada)
│   │   │   ├── ExportService.ts        # FFmpeg orchestration
│   │   │   ├── RenderService.ts        # thumbnail/preview frame
│   │   │   ├── SettingsService.ts
│   │   │   └── UpdateService.ts
│   │   ├── ffmpeg/             # FFmpeg wrapper & command builder
│   │   │   ├── FfmpegRunner.ts
│   │   │   ├── commands/       # export, thumbnail, probe, stabilize
│   │   │   └── hwaccel.ts      # deteksi NVENC/QuickSync/VAAPI
│   │   ├── db/                 # SQLite (better-sqlite3) + migrasi
│   │   │   ├── connection.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   ├── workers/            # Worker threads (heavy tasks)
│   │   │   ├── tracking.worker.ts
│   │   │   ├── indexing.worker.ts
│   │   │   └── render.worker.ts
│   │   ├── storage/            # .keylox archive read/write
│   │   ├── logging/            # logger (pino) + telemetry
│   │   └── security/           # safeStorage, keychain, validation
│   ├── preload.js              # [v1.2] contextBridge API (root repo, REJ-11) — expose window.keylox
│   ├── renderer/               # Chromium UI (React)
│   │   ├── main.tsx
│   │   ├── app/                # routes, providers
│   │   ├── components/         # UI components
│   │   ├── features/           # feature slices (project, timeline, ...)
│   │   │   ├── project/
│   │   │   ├── timeline/
│   │   │   ├── tracking/       # TR-14 tracking editor UI
│   │   │   ├── effects/
│   │   │   ├── text/
│   │   │   ├── audio/
│   │   │   ├── export/
│   │   │   └── ai/             # prompt bar, EditPlan preview, chat
│   │   ├── stores/             # Zustand stores
│   │   ├── lib/                # renderer utils, glsl, mediapipe init
│   │   │   ├── mediapipe/
│   │   │   ├── gl/
│   │   │   └── ipc/            # typed IPC client wrappers
│   │   └── styles/
│   └── shared/                 # Kode bersama main & renderer
│       ├── types/              # IPC payload types, domain types
│       ├── schemas/            # Zod schemas (EditPlan, project, ...)
│       ├── providerRegistry.js # [v1.2] DATA provider (ADR-03) — 13 provider, tanpa rahasia
│       ├── constants/
│       └── errors/             # error codes & shapes
├── docs/
│   └── superapp/               # pipeline docs (ini)
├── backend/                    # proxy multi-provider + queue (di `keylox_desktop/backend/`)
│   ├── src/
│   │   ├── routes/             # /v1/ai/*
│   │   ├── middleware/         # auth, rate limit, byok (X-Provider-Key), logging
│   │   ├── services/
│   │   │   ├── providerRegistry.js  # [v1.2] registry + allowlist host + anti-SSRF
│   │   │   ├── cache.js             # [v1.2] TTL ≤ 5 mnt, updateAgeOnGet=false, structural-only
│   │   │   ├── usage.js             # [v1.2] token/cost (ai_usage_records)
│   │   │   └── config.js            # [v1.2] cacheTtlMs default 300000
│   │   └── queue/              # BullMQ workers (ASR, scene detect, ...)
│   └── ...
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

### 2.1 Aturan import (dependency direction)

- `renderer/` **boleh** import `shared/` saja. Tidak boleh import `main/`.
- `main/` **boleh** import `shared/` dan library Node. Tidak boleh import `renderer/`.
- `preload.js` (di **root repo**, bukan `src/preload/`) hanya expose API typed ke renderer; tidak berisi business logic. Objek di-`freeze()` dan hanya memaparkan channel pada allowlist (`INVOKE_CHANNELS`).
- `shared/` tidak boleh import `main/` atau `renderer/` (pure TS + Zod).
- Cross-module di `main/services/` berkomunikasi lewat interface, bukan import langsung antar service berat (hindari circular).
- **`[v1.2]` Invarian rahasia:** provider key **hanya** hidup di `src/main/secretStore.js` (+ `safeStorage`). **Tidak ada** tipe/field/parameter di `shared/` atau `renderer/` yang membawa nilai key utuh. Renderer hanya boleh menerima `hasKey`, `masked`, `model` (`api-contract.md` §2.12).

---

## 3. Batas Modul (Domain Boundaries)

Modul mengikuti §4 spec. Setiap modul punya **owner** (main/renderer) dan **boundary**.

| Modul | Owner utama | Tanggung jawab | I/O eksternal |
|---|---|---|---|
| **M12 AI Core** (inti) | main (AiService) + renderer (UI) | NL→EditPlan; validasi skema; orchestrator; chat; recipes; antrean offline; **routing DIRECT/PROXY** | Backend proxy / provider langsung |
| **Provider Registry** `[v1.2]` (ADR-03) | main (`providerRegistry.js`) + backend (`providerRegistry.js`) | Sumber kebenaran tunggal provider: id, label, adapter, host/baseUrl, keyPattern, modelPatterns, defaultModel, docsUrl, freeTier, capabilities, pricePer1M, privacy | Provider HTTP (endpoint model/health) |
| **Capability Service** `[v1.2]` (ADR-04) | main (`capabilityService.js`) | Gate `jobType` → kapabilitas wajib; badge/disable UI; `verdict` uji 3 tingkat | Provider Registry |
| **Privacy Service** `[v1.2]` (ADR-05) | main (`privacyService.js`) | Mode privasi (`local-only`/`standard`/`cloud`); konfirmasi eksternal; gerbang sebelum keluar jaringan | `user_settings` (`settings.enc` sementara) |
| **Usage Service** `[v1.2]` (ADR-04) | main (`usageService.js`) | Catat token/biaya → `ai_usage_records`; hitung `est_cost_usd` dari registry; ringkasan `usage:get` | SQLite |
| **M14 Tracking Engine** (inti) | main (TrackingService + worker) | Deteksi→tracking persisten; binding; cache; editor data; invalidasi | MediaPipe (renderer/main), FFmpeg (stabilisasi) |
| **M1 Project/Media/Folder** | main (ProjectService, MediaService, FolderIndexService) | Proyek, import batch, indeks, autosave, undo | FS, SQLite |
| **M2 Timeline Engine** | renderer (state) + shared (ops) | Multi-track, trim/split, speed, keyframe | IPC ke main untuk heavy |
| **M3 Transform & Geometry** | renderer (preview) + main (export) | Crop/rotate/scale/reframe/stabilize | FFmpeg, tracking |
| **M4 Color & Filter** | renderer (preview shader) + main (export) | LUT, curves, levels, WB | FFmpeg filtergraph |
| **M5 Effects (GLSL)** | renderer (WebGL) + main (export) | 17 shader + animasi + transisi | FFmpeg (bake saat export) |
| **M6 Compositing** | renderer (preview) + main (export) | Blend, overlay, mask, chroma key | FFmpeg |
| **M7 On-device AI (detektor)** | renderer (MediaPipe) + main (cache) | Segmentasi, landmark, gesture, beauty, embedding | MediaPipe, SQLite |
| **M8 Text & Caption** | renderer | Text overlay, subtitle, tracking text | ASR (via AI service) |
| **M9 Audio** | renderer (preview) + main (export/mix) | Volume, fade, musik, ducking, voiceover | FFmpeg, music catalog (CDN) |
| **M10 Export & Render** | main (ExportService) | Encode, preset, batch, HW accel | FFmpeg, OS notification |
| **M11 Template** | main + renderer | Gallery, apply, save as template | CDN katalog template |
| **Storage/Archive** | main | `.keylox` read/write, migrasi skema | FS |
| **Settings/Auth** | main | Penyimpanan key **per provider** (OS keychain via `safeStorage`), preferensi non-rahasia (`settings:*`), preferensi privasi (`user_settings`), consent | OS keychain, backend |
| **Logging/Telemetry** | main | Log, telemetry opt-in | Backend (agregasi) |

### 3.1 Aturan boundary (wajib)

1. **Domain policies tidak boleh import framework/UI/DB/FFmpeg.** Modul domain (EditPlan ops, tracking transform, project aggregate) hidup di `shared/` dan pure TS.
2. **Aplikasi (use-case) layer** di `main/services/` mengoordinasi workflow, transaksi, authorization, dan panggilan ke port (interface).
3. **Adapters** (FFmpeg, MediaPipe, SQLite, OS) mengimplementasikan port; dapat diganti tanpa menyentuh domain.
4. **Bypass use-case** (controller/renderer memanggil repository langsung) = architectural smell; wajib ADR jika disengaja.
5. **Tracking = satu sumber kebenaran:** konsumen (teks/efek/mask/cutout/kamera) **tidak** menyimpan data gerak sendiri; semua membaca `TrackingKeyframe` via `TrackingBinding`. Duplikasi data tracking dilarang (§11.6 #10 spec).
6. **AI tidak pernah bypass domain:** `EditPlan` diterjemahkan ke operasi domain normal; tidak ada jalur tulis khusus AI (§11.6 #4).
7. **`[v1.2]` Renderer tidak pernah memegang provider key.** Key dibaca/ditulis hanya di main (`secretStore.js`+`safeStorage`); renderer hanya melihat `hasKey`/`masked`/`model`. Dilarang menaruh `apiKey` di store Zustand, `localStorage`, atau `.keylox`.
8. **`[v1.2]` Dua gate sebelum keluar jaringan.** Setiap `ai:invoke` melewati `privacyService` (mode & konfirmasi) **lalu** `capabilityService` (jobType↔kapabilitas) **lalu** cek key; semua di main process. Renderer tidak dapat mem-bypass urutan ini.
9. **`[v1.2]` Registry = satu sumber kebenaran provider.** Tidak ada allowlist host / daftar model / harga yang di-hardcode di luar `providerRegistry.js`. Backend & main membaca berkas data yang sama (disinkronkan).

---

## 4. Alur Data

### 4.1 Alur utama (file → preview → edit plan → export)

```
[Import]  File/Folder
   │
   ▼
MediaService (main) ──probe (FFmpeg)──► MediaAsset (SQLite)
   │                                          │
   │  batch folder ──► FolderIndexService ──► AssetInsight (background worker)
   │
   ▼
Renderer loads project state (Zustand) ◄── IPC project:load
   │
   ▼
[Preview]  WebGL render graph (renderer) ◄── MediaAsset (decoded via <video>/canvas)
   │         └── MediaPipe detektor (on-demand, per frame) ──► landmark/segmentasi
   │
   ▼
[Tracking]  TrackingService.startSession (main worker)
   │         └── MediaPipe per-frame + optical flow ──► TrackingTarget/TrackingKeyframe (SQLite)
   │         └── TrackingBinding ──► konsumen membaca transform per frame
   │
   ▼
[AI]  User prompt ──IPC ai:parseCommand──► AiService ──[gate privasi → gate kapabilitas → cek key]──►
   │         ├── DIRECT : main ──HTTPS──► provider (key dari safeStorage)
   │         └── PROXY  : main ──HTTPS──► backend ──► provider (X-Provider-Key, TLS-only)
   │                                          │
   │                                          └── cache ber-hash (jobType struktural saja, TTL ≤ 5 mnt)
   │
   │   Response: EditPlan (JSON tervalidasi Zod) ──► Renderer
   │
   ▼
[Preview Plan]  EditPlanPreview UI (toggle/ubah urutan/durasi/hapus langkah)  [G-23]
   │
   ▼
[Apply]  Renderer menerapkan ops ke state (1 entri undo) ──► autosave (≤3s setelah perubahan)
   │
   ▼
[Refinement]  "lebih cepat", "jangan terlalu gelap" ──► delta pada hasil sebelumnya
   │
   ▼
[Export]  ExportService (main) ──FFmpeg (HW accel)──► file output ──► OS notification
             └── progress via IPC export:progress (taskbar progress bar)
```

### 4.2 Alur tracking (satu sumber kebenaran)

```
MediaAsset
   │
   ▼
[M7 detektor: MediaPipe per-frame] ──► (landmark, bbox, mask)
   │
   ▼
[M14 Tracking Engine: solver + optical flow]
   │  → TrackingTarget + TrackingKeyframe (transform per frame, tersimpan di SQLite)
   │
   ├──► M8 teks/sticker (S-10, S-13)   : baca transform via TrackingBinding
   ├──► M5 efek spasial (E-01,E-13,E-21): baca transform + landmark
   ├──► M6 mask dinamis (K-03,K-04)     : baca quad/path
   ├──► M7 cutout dinamis (D-01,D-02)   : baca matte + transform
   └──► M3 kamera virtual (X-06,X-08)   : baca gerak kamera terkompensasi
```

Invalidasi: bila `Clip` dipotong/di-speed/di-reverse/diganti media → `TrackingTarget`+`TrackingKeyframe` anak ditandai invalid; `TrackingBinding` tetap hidup dengan status "perlu lacak ulang" (TR-15).

### 4.3 Alur offline / antrean

- Perintah yang butuh cloud → `AICommand.status = queued` dengan `queued_reason = offline/limit`; UI menampilkan status jelas; tidak hilang.
- ≥ 15 perintah lokal (trim, split, speed, volume, mute, fade, transisi, putar, undo) jalan tanpa internet.
- Tracking & export 100% offline (FFmpeg lokal + MediaPipe).
- Saat online kembali → antrean diproses FIFO dengan prioritas pengguna nyata (anti-abuse).

---

## 5. Keputusan Non-Fungsional

### 5.1 Auth & Penyimpanan Kredensial Provider — **[DIPERBARUI v1.2]**

> **Koreksi dokumen (REJ-10):** versi sebelumnya §5.1 berbunyi "Tidak ada API key ... yang bisa diinput user" dan "Tidak ada field API key". Sejak **BYOK (kontrak v1.1)** pernyataan itu **stale**. Sejak **v1.2** berlaku rezim **multi-provider** (ADR-03). Rujukan tunggal sekarang: `byok-api-key.md` + `api-contract.md` §2.12/§2.13/§6.

- **Tidak ada key milik *developer* di binary desktop.** Ini tetap mutlak: `npm run build` **gagal** bila terdeteksi pola key (`AIza…`/`sk-…`) di bundle (`scripts/secret-scan.mjs`). Key **backend** (`GEMINI_API_KEY`) hidup di environment (secret manager) backend saja.
- **Key milik *user* (BYOK) diizinkan** — untuk **13 provider** (registry §2.13). Key disimpan **terenkripsi** di `safeStorage` (`app.getPath('userData')/secure/settings.enc`), **per provider**. Fallback `keytar` bila `safeStorage.isEncryptionAvailable() === false` → `ERR_SECURE_STORAGE_UNAVAILABLE`.
- **Key hanya diakses main process.** Tiga lapis akses: `src/main/secretStore.js` (baca/tulis `settings.enc`), `src/main/providerPolicy.js` (validasi format/anti-SSRF), `src/main/aiClient.js` (memakai key saat request). Renderer **tidak pernah** menerima nilai key utuh — hanya `hasKey`, `masked`, `model` (aksesor §2.11.2).
- **Dua jalur AI (dipilih otomatis dari Settings, bukan oleh renderer):**
  - **DIRECT** (default user pribadi): `backendBaseUrl` kosong → main memanggil provider langsung dengan key `safeStorage`.
  - **PROXY** (tim/organisasi): `backendBaseUrl` diisi → main → backend → provider, mengirim `X-Provider-Key` (**TLS-only, dilarang di-log**) + `X-Provider` + `X-Provider-Base-Url` (hanya `custom`/lokal). Backend **tidak menyimpan** key.
- **Preferensi non-rahasia** (`backendBaseUrl`, tema, bahasa, `provider` aktif, `model`) disimpan via `settings:*`; **preferensi privasi** (`privacy.mode`, `privacy.confirm.<provider>`) disimpan di `user_settings` — sebelum lapisan DB ada (GAP-01), main memakai `settings.enc` (`settings:get/set`, key `privacy.mode`) sebagai sumber sementara.
- **Settings UI menampilkan:** provider + label, key **termask** (`AIza••••••••1234`), model, base URL, badge kapabilitas, tombol **Tes / Ganti / Hapus**, status koneksi, panel **Usage** (token/biaya estimasi), panel **Data & Privasi** (mode + wipe/export), consent, tombol **"Dapatkan API Key Gratis"** (→ `shell:openExternal` ke `provider.docsUrl`). **Tidak pernah** nilai key utuh.
- **Anti-SSRF & allowlist** untuk `baseUrl` ditegakkan di **dua** tempat (main `providerPolicy.js` + backend `providerRegistry.js`): HTTPS wajib (kecuali localhost dev eksplisit), host ∈ registry, tolak rentang privat/metadata/IP ter-obfuskasi.
- **Untuk dev/internal:** env `GEMINI_API_KEY` di backend + flag fallback (`MOCK_AI`, `BYOK_REQUIRE_USER_KEY`) sesuai `api-contract.md` §3.7 butir 2. File `.env` di repo root (gitignored) hanya untuk backend, bukan app.

### 5.2 Error Handling

- **Error shape seragam** (lihat `api-contract.md` §5): `{ code, message, details?, retryable, httpStatus?, timestamp, requestId }`.
- Kode error namespaced: `ERR_AI_*`, `ERR_MEDIA_*`, `ERR_EXPORT_*`, `ERR_TRACKING_*`, `ERR_DB_*`, `ERR_FS_*`, `ERR_VALIDATION_*`, `ERR_SYSTEM_*`, **`ERR_PROVIDER_*`** `[v1.2]`, **`ERR_PRIVACY_*`** `[v1.2]`, `ERR_SECURE_STORAGE_UNAVAILABLE`, `ERR_IPC_*` (daftar lengkap + aksi renderer: `api-contract.md` §5.2/§5.2.1).
- Strategi: retry ≤ 2× dengan exponential backoff untuk error jaringan/timeout AI; fallback ke mode manual untuk operasi yang gagal; tidak ada crash tanpa pesan yang bisa ditindaklanjuti.
- File parsial export selalu dibersihkan; kode error dapat ditindaklanjuti (R-08).
- Crash reporter (Sentry opt-in) tanpa PII; log lokal ring buffer (rotasi).

### 5.3 State Management

- **Renderer:** Zustand stores per domain (`useProjectStore`, `useTimelineStore`, `useTrackingStore`, `useAiStore`, `useExportStore`). Immer untuk immutable update. Selector granular untuk performa (hindari re-render timeline besar).
- **Main:** Service stateless-ish dengan SQLite sebagai sumber kebenaran; in-memory cache LRU untuk metadata media & hasil probe.
- **Sinkronisasi:** Main adalah owner data persisten; renderer memegang working copy (optimistic). Autosave ≤ 3 s setelah perubahan atau ≤ 30 s idle; checkpoint ≥ 3 (P-04).
- **Undo/redo:** `UndoRecord` di SQLite per proyek; **`[v1.2]` 1 perintah AI = 1 grup undo** via `undo_records.group_id` (bukan N entri). Renderer `applyPlan` membungkus seluruh `ops` satu `EditPlan` dalam **satu** grup; pola lama (`updateClip`/`addClip`/`removeClip` masing-masing push snapshot → akar REJ-01) **dilarang** pada jalur AI. ≥ 50 langkah; < 150 ms.

### 5.4 Logging & Observability

- Logger: pino (main) dengan level konfigurabel; ring buffer di renderer (console + IPC forward).
- Telemetri adopsi per fitur + funnel "prompt → apply → export" + pemetaan perintah ke `command_ref`; **tanpa PII**; opt-out tersedia.
- AI usage: `AIUsageRecord` (token in/out, latensi, cache hit) `[v1.2]` + `provider`, `est_cost_usd` untuk monitoring biaya (RSK-02); ditampilkan di panel **Usage** via `usage:get`. Biaya dihitung dari registry × token; `null` bila harga tak diketahui.
- **`[v1.2]` Cache backend:** TTL ≤ 5 menit, `updateAgeOnGet=false`, **hanya** `jobType` struktural (`scene_detect`/`thumbnail`/`vision_color`/`reframe`/`index_asset`) yang di-cache; backend **tidak** menulis prompt/respons ke disk.
- Crash-free target ≥ 99.5% session di GA.
- Log lokal dapat diekspor untuk support (satu aksi).

### 5.5 Offline Mode

- Editing inti (trim, filter, color, effect, tracking, export) 100% offline via FFmpeg lokal + MediaPipe.
- ≥ 15 perintah AI lokal jalan offline (trim, split, speed, volume, mute, fade, transisi, putar, undo).
- Perintah cloud (Gemini) diantre dengan status jelas (G-33); tidak hilang.
- Model MediaPipe diunduh on-demand dari CDN dengan manifest versi; cache lokal; bila offline & model belum ada → fitur terkait disable dengan pesan jelas (bukan crash).
- Music/template catalog: cache lokal; refresh saat online.

---

## 6. Strategi Performa

### 6.1 Hardware Acceleration (Encode/Export)

- **Deteksi HW accel** saat startup: NVENC (NVIDIA), QuickSync (Intel), VAAPI (Linux), VideoToolbox (macOS). Simpan profil di settings.
- FFmpeg invocation: `-c:v h264_nvenc` / `hevc_nvenc` / `h264_qsv` / `h264_vaapi` bila tersedia; fallback ke `libx264`/`libx265` (software) tanpa crash (R-13).
- Multi-core: `-threads auto` atau `-threads N` berdasar `os.cpus().length`; target encode 1080p30 ≥ 1.2× realtime, 4K ≥ 0.5× realtime di laptop 8-core.
- Export berjalan di **worker thread / child process** (FFmpeg child_process) agar UI tidak blokir; progress via stderr parsing + IPC.

### 6.2 Worker Threads

- `tracking.worker.ts`: analisis tracking batch (TR-01/TR-02 pada klip panjang; TR-03..TR-07 realtime preview pada resolusi turun).
- `indexing.worker.ts`: AI indexing folder (P-12), embedding (D-11) — chunked, dapat dibatalkan, tidak memblokir UI.
- `render.worker.ts`: thumbnail generation, preview frame extraction, waveform.
- Export tetap menggunakan `child_process` FFmpeg (bukan worker thread) karena FFmpeg binary; worker thread hanya untuk tugas JS/CPU.

### 6.3 Manajemen Memori (4K)

- **Chunked processing:** video 4K diproses per-chunk (mis. 4 s) untuk tracking & export; release buffer setelah chunk selesai.
- **Object pooling** untuk frame buffer WebGL; hindari alokasi per-frame.
- **Peak RAM target:** ≤ 2 GB saat edit 1080p; ≤ 4 GB saat export 4K; tidak OOM pada laptop 8 GB.
- **Preview adaptif:** resolusi preview turun otomatis saat beban tinggi (tracking aktif, banyak shader); mode performa otomatis.
- **Cache eviction:** LRU cache untuk thumbnail/indeks/hasil AI dengan batas 2 GB total; auto-evict.
- **Tracking batch offline:** untuk klip panjang, analisis tracking dijadwalkan sebagai `TrackingSession` (bukan realtime) dengan progres & dapat dibatalkan.
- **Release on background:** saat app diminimize, lepaskan buffer besar; resume saat kembali.

### 6.4 Strategi Performa Tambahan

- Virtualisasi timeline (react-window) untuk ≥ 200 klip tanpa lag > 2 fps drop.
- Thumbnail strip di-cache (SQLite blob ref) dan di-generate di background.
- MediaPipe model di-load lazy dan di-dispose saat tidak dipakai; model Lite untuk low-end.
- Shader varian low-end (half-res + skip pass) agar laptop kelas bawah tetap ≥ 24 fps preview.
- Debounce/throttle pada scrub & slider; requestAnimationFrame untuk render loop.

---

## 7. Strategi iGPU Fallback (AI Image Gen)

Spec §12.1 mencatat **ComfyUI (generatif AI, v3) dijalankan di Google Colab / mesin terpisah, bukan di app desktop** (butuh NVIDIA GPU VRAM ≥ 8 GB). Karena target pengguna adalah laptop kelas menengah (sering iGPU / tanpa GPU dedicated), maka:

1. **ComfyUI lokal dinonaktifkan sepenuhnya di app desktop.** Tidak ada fitur generatif video penuh (O-09 out of scope MVP).
2. **AI image generation (thumbnail/cover, E-25 look dari referensi, G-10) menggunakan provider cloud ber-kapabilitas `vision`** (default `gemini`; registry §2.13) — bukan model lokal. Ini memastikan bekerja di iGPU.
3. **Untuk fitur yang membutuhkan GPU berat (render 4K, tracking multi-objek ≥ 5, 17 shader sekaligus):** degradasi bertahap:
   - Turunkan resolusi preview lebih dulu (bukan matikan tracking).
   - Batas objek tracking adaptif per tier (RSK-19).
   - Interval inferensi MediaPipe dapat dinaikkan (mis. tiap 2 frame) pada low-end.
   - Tracking batch offline untuk klip panjang.
4. **Deteksi GPU tier** saat startup → pilih preset performa (low/mid/high) yang mengatur: resolusi preview, jumlah shader pass, interval inferensi, batas objek tracking.
5. **Tidak ada fitur yang hard-require GPU dedicated** di MVP; semuanya punya fallback CPU (meski lebih lambat) dengan pesan jelas.

---

## 8. Dependency & Boundary Rules (ringkas)

- Domain policies (`shared/`) tidak import framework, ORM, messaging, HTTP, DB.
- Application/use-case services (`main/services/`) koordinasi workflow, transaksi, authorization, panggilan ke port.
- Adapters (FFmpeg, MediaPipe, SQLite, OS) implement port.
- Cross-context communication via explicit contracts, events, APIs, atau anti-corruption layer.
- Bypass use-case (renderer memanggil repository langsung) = architectural smell; wajib ADR.
- Tracking: satu sumber kebenaran (`TrackingKeyframe`); duplikasi data tracking dilarang.
- AI: tidak bypass domain; `EditPlan` → operasi domain normal.

---

## 9. Observability & Telemetry

- Event adopsi per fitur, funnel prompt→apply→export, pemetaan perintah ke `command_ref`.
- Tanpa PII; opt-out tersedia.
- AI usage tracking (token, latensi, cache hit) untuk monitoring biaya.
- Crash reporter opt-in (Sentry) tanpa PII.
- Log lokal ring buffer + ekspor untuk support.

---

## 10. ADR (Architectural Decision Records) Ringkas

### ADR-001: Platform = Electron desktop (bukan mobile)
- **Status:** Accepted (v2.2)
- **Context:** Spec v2.2 mengubah platform dari mobile ke desktop Electron.
- **Decision:** Electron 30+ dengan native FFmpeg; distribusi `.exe` (NSIS + portable).
- **Consequences:** Akses Node.js native (FFmpeg, SQLite); UI kompleks (timeline multi-track); ukuran installer ~150 MB; RAM lebih tinggi. Mobile ditunda ke v3+.

### ADR-002: AI cloud via backend proxy (bukan langsung dari app)
- **Status:** **Accepted** — **sebagian superseded oleh ADR-03 (v1.2)**: proxy tetap jalur default **PROXY**, tetapi kini berdampingan dengan jalur **DIRECT (BYOK)**.
- **Context:** API key milik **developer** tidak boleh di binary.
- **Decision:** Panggilan AI dapat melalui backend proxy (Cloud Run/Functions) dengan auth + rate limit + cache (mode PROXY); key **user** (BYOK) dapat dipakai langsung dari main process (mode DIRECT).
- **Consequences:** +latensi (target ≤ 4 s p95) pada PROXY; +infra cost; keamanan & observabilitas biaya terjaga. Mode degradasi saat offline.

### ADR-003: Native FFmpeg (bukan WebCodecs) untuk export
- **Status:** Accepted
- **Context:** Butuh codec parity, filter graph, HW accel.
- **Decision:** FFmpeg binary statis per platform; fallback WebCodecs bila tersedia (RSK-01).
- **Consequences:** +ukuran installer; +kompleksitas distribusi; performa & parity terjamin.

### ADR-004: Tracking Engine tunggal (M14) melayani semua konsumen
- **Status:** Accepted (v2.1)
- **Context:** Spec menetapkan tracking sebagai inti; banyak konsumen (teks, efek, mask, cutout, kamera).
- **Decision:** Satu solver + optical flow; output = transform per frame (`TrackingKeyframe`); konsumen membaca via `TrackingBinding`; tidak ada duplikasi data tracking.
- **Consequences:** Konsistensi & hemat CPU; ketergantungan pada satu modul (jika gagal, semua konsumen terdampak) → mitigasi: TR-14 editor koreksi manual.

### ADR-005: State management = Zustand (renderer) + SQLite (main)
- **Status:** Accepted
- **Context:** Timeline besar; butuh performa & immutable update.
- **Decision:** Zustand + Immer di renderer; SQLite di main sebagai sumber kebenaran persisten.
- **Consequences:** Optimistic update di renderer; sinkronisasi via autosave; risiko drift state (mitigasi: checkpoint & recovery).

### ADR-006: iGPU fallback — ComfyUI lokal dinonaktifkan, AI image gen via Gemini cloud
- **Status:** Accepted
- **Context:** Target pengguna laptop kelas menengah (sering iGPU); ComfyUI butuh VRAM ≥ 8 GB.
- **Decision:** Tidak ada ComfyUI lokal; AI image gen (thumbnail/cover/E-25) via Gemini cloud; degradasi bertahap untuk fitur berat.
- **Consequences:** Ketergantungan cloud untuk generatif; fitur generatif video penuh out of scope MVP.

### 10.1 ADR Addendum REWORK v1.2 (dari `byok-api-key.md` & `privacy-data.md`)

> **Catatan namespace:** ADR-001..006 di atas adalah seri *platform/stack* Stage 2. Tiga ADR berikut berasal dari dokumen desain BYOK/privasi (seri berbeda) dan dirujuk dengan **nama** `ADR-03`/`ADR-04`/`ADR-05` (bukan `ADR-003`…). Jangan tertukar.

#### ADR-03: Multi-provider BYOK (registry) — **Accepted** (Okt 2026)
- **Sumber:** `byok-api-key.md` §12.
- **Context:** v1.0 hanya Gemini (via proxy); v1.1 menambah `gemini`+`openai` tetapi allowlist provider tersebar di kode. `08-review.md` REJ-02 mengadukan kurangnya pilihan provider & vendor lock-in.
- **Decision:** **Provider Registry** sebagai sumber kebenaran tunggal untuk **13 provider** (`api-contract.md` §2.13) dengan `id,label,adapter,host,baseUrl,keyPattern,modelPatterns,defaultModel,docsUrl,freeTier,capabilities,pricePer1M,privacy`. Jalur DIRECT/PROXY dipilih otomatis dari Settings.
- **Consequences:** Menambah provider = menambah data, bukan logika. +permukaan uji (badge, onboarding). Anti-SSRF & key-format kini digeneralisasi (bukan 2 cabang hardcode). Ada risiko drift registry main↔backend → dimitigasi dengan menyinkronkan berkas data + tes.

#### ADR-04: Kemampuan model + transparansi token/biaya — **Accepted** (Okt 2026)
- **Sumber:** `byok-api-key.md` §13.
- **Context:** Tanpa registry kapabilitas, UI menawarkan jobType yang gagal di provider tertentu; pengguna tidak tahu token/biaya terpakai.
- **Decision:** (a) matriks **jobType → kapabilitas** + `capabilityService` (badge & disable) (`api-contract.md` §2.14.3); (b) `settings:testProvider` **v2** dengan **uji 3 tingkat** (koneksi → model → EditPlan JSON mini + Zod) + `verdict ok|limited|incompatible`; (c) `usage:get` + `est_cost_usd`.
- **Consequences:** Lebih banyak state UI (kapabilitas per provider). **Tidak** memakai tabel `ai_usage_log` baru — memakai `ai_usage_records` yang sudah ada (+`provider`,`est_cost_usd`). Uji kompatibilitas menambah panggilan jaringan (dikendalikan, prompt mini statis).

#### ADR-05: Privasi-by-design (cache & data) — **Accepted** (Okt 2026)
- **Sumber:** `privacy-data.md` §5.
- **Context:** `backend/src/services/cache.js` memakai `updateAgeOnGet:true` + TTL 30 hari → jejak konten pengguna tersimpan lama (celah yang didokumentasikan `privacy-data.md` §3.1, bukan REJ). Tidak ada kontrol privasi yang terlihat pengguna.
- **Decision:** (a) TTL ≤ 5 menit / **cache mati untuk jobType berkonten** + `updateAgeOnGet=false` + backend tidak menulis prompt/respons ke disk (`api-contract.md` §3.5/§3.8); (b) mode privasi `local-only`/`standard`/`cloud` + `privacy:*` + `data:wipeLocal`/`data:exportLocal` + panel "Data & Privasi" (§2.15).
- **Consequences:** Hit rate cache turun (RSK-02 target ≥ 60% **hanya** dihitung atas jobType struktural) → trade-off sadar: privasi > efisiensi. Panel privasi menambah permukaan UX. Perubahan TTL & cache = **perubahan perilaku** yang harus dipatuhi Stage 4/5.

---

## 11. Keterkaitan ke Stage Berikutnya

| Stage | Yang diharapkan | Dokumen ini menyediakan |
|---|---|---|
| Stage 3 — UX/UI | Layar prompt utama; tracking editor TR-14 | Boundary modul & alur data |
| Stage 4 — Prompt/LLM | Skema EditPlan, IPC ai:parseCommand | Kontrak AI + storage |
| Stage 5 — Render/Media | Render graph, pipeline export, tracking solver | Strategi performa & HW accel |
| Stage 6 — Database | Skema SQLite | Entitas §11 spec + arsitektur storage |
| Stage 7 — Backend/API | Endpoint proxy multi-provider (DIRECT/PROXY) | Kontrak API (api-contract.md v1.2) + ADR-03/04/05 |
| Stage 8 — QA | Test case per ID fitur | Boundary & error shape |

---

*Dokumen ini adalah kontrak arsitektur Stage 2. Perubahan mengikuti change request policy §14.4 spec.*
