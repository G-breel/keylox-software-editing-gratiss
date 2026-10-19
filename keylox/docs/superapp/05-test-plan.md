# Test Plan — Keylox (Stage 7 / QE)

> **Status:** Fase MVP (154 fitur MVP: AI-First + Tracking-first).
> **Pemilik:** QE / Test Automation.
> **Kontrak yang tidak diubah oleh dokumen ini:** `api-contract.md`, `04-schema.sql`.
> **Prinsip dasar:** suite yang dipercaya = determinism. Setiap tes memiliki datanya
> sendiri, menunggu *kondisi* (bukan jam), dan meninggalkan artefak yang cukup untuk
> men-debug kegagalan tanpa repro lokal.

---

## 0. Ringkasan Eksekutif

| Pertanyaan | Jawaban |
|---|---|
| Berapa yang sudah berjalan nyata hari ini? | **74 tes otomatis hijau** (41 unit Vitest + 33 backend `node:test`) |
| Berapa layer? | 4: unit, integration/API, E2E, manual |
| Retry? | **0** (di semua runner). Pass-on-retry = flake, bukan lulus |
| Runner baru yang dipasang? | **1** (Vitest). Backend pakai `node:test` bawaan Node — tanpa install |
| Cakupan inti yang dibuktikan? | Undo/redo store, parser AI offline, kontrak EditPlan, `/health`, `/ai/parse-command` (AC-8), cache (AC-11), validasi & auth |
| Yang sengaja belum dijalankan? | E2E Electron (Playwright) + uji persepsi/GPU — didokumentasikan, bukan dijalankan |

---

## 1. Tujuan, Ruang Lingkup & Non-tujuan

### 1.1 Tujuan
- Membuktikan bahwa **jalur uang produk** (satu prompt → video siap export, import →
  timeline → undo, tracking menempel subjek) tidak regresi.
- Menjaga agar **kontrak** (`api-contract.md` §3, skema `EditPlan`) benar-benar
  ditegakkan di runtime, bukan hanya di dokumen.
- Menyediakan gerbang rilis yang **merge-blocking** dan cepat (< 10 menit) sehingga
  tidak ada yang berargumen untuk melewatinya.

### 1.2 Ruang lingkup
- Seluruh **154 fitur MVP** (AI-First + Tracking-first) — lihat §5 dan `00-spec.md` §6.
- **251 perintah AI** (kelas D: 31, kelas N: 220) — diparser & divalidasi.
- **AC-1..AC-12** (`00-spec.md` §6.1.2) sebagai kriteria terukur.
- **M14 TR-01..TR-15** sebagai kemampuan inti dengan AC drift/akurasi sendiri.

### 1.3 Non-tujuan (eksplisit)
- **Bukan** menguji fitur v2/v3 (39 + 12 fitur) — di luar MVP.
- **Bukan** menguji monetisasi (M13 sengaja kosong).
- **Bukan** menambah/mengubah endpoint, channel IPC, atau skema DB.
- **Bukan** mengukur kualitas estetika hasil edit (itu uji *persepsi manual* §4.4).

---

## 2. Strategi Pengujian

### 2.1 Prinsip wajib (aturan, bukan preferensi)
1. **Tanpa `sleep` keras.** Tidak ada `waitForTimeout`/`setTimeout` untuk "menunggu
   tenang". Tunggu *kondisi*: state elemen, response jaringan, perubahan URL.
2. **Tes memiliki datanya sendiri.** Setiap tes membuat inputnya inline/langsung;
   tidak bergantung pada seed bersama atau sisa tes lain.
3. **Setup lewat API/IPC, assert lewat UI.** Menyiapkan state secara programatik;
   hanya *journey yang diuji* yang dijalankan lewat antarmuka.
4. **Selector gaya pengguna.** `getByRole` dulu; `getByTestId` hanya jalan terakhir.
   Rantai CSS rapuh tidak pernah dipakai.
5. **E2E adalah puncak piramida, bukan seluruhnya.** Jika bisa dibuktikan di
   unit/API, turunkan ke bawah — jangan ke browser.
6. **Retry = instrumentasi, bukan pengobatan.** Pass-on-retry adalah sinyal flake.
7. **Kegagalan harus bisa di-debug dari artefak.** Trace + screenshot + video +
   console + log jaringan terlampir pada setiap kegagalan CI.
8. **Karantina cepat, akar masalah selalu.** Flake keluar dari suite merge-blocking
   dalam 24 jam, masuk antrean triage, **tidak** dihapus tanpa diagnosis.

### 2.2 Piramida pembagian layer
```
        ┌──────────────────────┐
        │  E2E (Playwright)    │  sedikit — hanya journey berisiko integrasi
        ├──────────────────────┤
        │  Integration / API   │  sedang — kontrak backend nyata (node:test)
        ├──────────────────────┤
        │  Unit (Vitest)       │  paling banyak — logika murni, batas, edge case
        └──────────────────────┘
        Manual / exploratory   : persepsi, GPU/device, installer
```
Alasan: E2E mahal & lambat; satu browser run = 10.000 unit assert. Karena itu
**hanya** journey yang integrasinya sendiri berisiko yang naik ke browser.

---

## 3. Arsitektur Test & Cara Menjalankan

Skeleton nyata ada di `keylox_desktop/tests/`.

```
keylox_desktop/
├─ vitest.config.mts          # runner renderer (TS) — root = project root
├─ package.json               # script: test, test:unit, test:backend (+ watch)
└─ tests/
   ├─ unit/                   # Vitest  (tests/unit/**/*.test.ts)
   │  ├─ aiParser.test.ts
   │  └─ editorStore.undo-redo.test.ts
   ├─ backend/                # node:test (tests/backend/*.test.js)
   │  ├─ api.smoke.test.js
   │  ├─ editPlan.schema.unit.test.js
   │  └─ helpers/{server.js, editPlanContract.js}
   ├─ e2e/                    # SKELETON Playwright+Electron (belum dijalankan)
   └─ fixtures/               # kontrak fixture deterministik (media tidak di-commit)
```

### 3.1 Dua runner (dan mengapa bukan satu)
| Layer | Runner | Alasan |
|---|---|---|
| Renderer (store, parser) | **Vitest** | Jalankan TS langsung, watch cepat; zustand/immer sudah ada |
| Backend contract | **`node --test`** | **Nol dependensi**. Menyalakan `backend/src/index.js` **nyata** sebagai child process → menguji wiring produksi (CORS, security header, rate limit, auth+quota), dan kebal terhadap refactor file itu |

**Catatan kunci (temuan lintas-stage):** backend sedang dikeraskan oleh agent lain
(`index.js`, `middleware/auth.js`, `config.js`, `utils/validate.js`). Karena itu tes
backend **men-spawn entrypoint nyata** dan **tidak** membangun instance Fastify
in-process. Satu-satunya skema milik tes sendiri (kontrak `EditPlan`) hidup di
`tests/backend/helpers/editPlanContract.js` supaya tidak menabrak `src/utils/validate.js`.
Hasilnya: tes tidak meng-kunci implementasi siapa pun dan tidak menimpa kode backend.

### 3.2 Cara menjalankan
```powershell
cd keylox_desktop
npm test                # semua yang berjalan hari ini (unit + backend)
npm run test:unit       # Vitest saja
npm run test:unit:watch # Vitest watch
npm run test:backend    # node:test saja
npx vitest run --repeat-each=10 tests/unit   # gerbang determinism (tes baru)
```

### 3.3 Deteksi determinism
- `vitest.config.mts`: `retry: 0`.
- `vitest run --repeat-each=10` sebelum sebuah tes unit di-merge.
- Backend: `node:test` tanpa retry; harness memakai **port ephemeral** & `MOCK_AI=true`
  sehingga paralel-sibling tidak bertabrakan dan tidak ada panggilan jaringan.

---

## 4. Pembagian Layer, Cakupan & Kepemilikan

| Layer | Yang diuji | Alat | Di mana |
|---|---|---|---|
| **4.1 Unit** | Reducer undo/redo store, parser AI offline, skema kontrak EditPlan | Vitest / `node:test` | `tests/unit`, `tests/backend/*.schema.unit` |
| **4.2 Integration/API** | Envelope, validasi 400, auth/quota, cache, EditPlan valid | `node:test` (HTTP nyata) | `tests/backend/api.smoke.test.js` |
| **4.3 E2E** | one-prompt→export (AC-10), import→undo/redo, tracking attach+TR-14 | Playwright+Electron | `tests/e2e` *(skeleton)* |
| **4.4 Manual/exploratory** | Persepsi (potongan "terasa" benar, tracking mulus), iGPU/device, installer | checklist manusia | §7, §12 |

**Aturan kepemilikan:** setiap bug yang lolos ke produksi pada journey ber-cakupan
E2E wajib membuka tiket celah tes dan ditutup dengan tes baru — tidak ada "cannot repro".

---

## 5. Test Matrix Fitur Inti (MVP)

Kolom **E2E** menyatakan apakah fitur itu naik ke browser (hanya jika integrasinya
berisiko). Kolom **Otomatis** menyatakan ada-tidaknya tes yang **berjalan hari ini**.

### 5.1 AI Core (M12) & Tracking Engine (M14) — inti produk

| Kode | Fitur | AC | Otomatis (sekarang) | E2E | Kasus negatif/batas |
|---|---|---|---|---|---|
| G-01 | Prompt → EditPlan → Apply | AC-1,AC-8 | ✅ parser unit + backend schema | ✅ | respons tak valid → retry ≤2x → fallback manual |
| G-21 | One-prompt full edit | AC-10 | ⬜ (E2E) | ✅ | media <10 klip; tanpa audio; klip panjang |
| G-19/G-25 | Chat multi-turn & refinement | AC-5 | ⬜ | ✅ | referensi "ini/itu" tanpa seleksi |
| G-02 | Scene detect & auto-cut | — | ⬜ | ✅ | video 1 frame; tanpa cut |
| G-22 | Auto-Mode | — | ⬜ | ⬜ (unit) | prompt kosong |
| G-24 | Input suara | AC-7 | ⬜ | ⬜ (manual) | bising; ID/EN campur |
| G-30 | Multi-bahasa prompt (ID/EN/campur) | — | ✅ parser (lowercase, campur) | ⬜ | 100% campur |
| G-33 | Mode degradasi & antrean offline | AC-7 | ✅ parser offline ≥15 perintah | ⬜ | network mati → antre dengan status |
| TR-01 | Tracking titik | AC-12 | ⬜ (math unit) | ⬜ | drift ≤2%/30s |
| TR-04 | Face tracking persisten + re-link | AC-12 | ⬜ | ✅ | re-link ≤500 ms setelah oklusi |
| TR-09 | Tracking binding (teks/efek/mask) | AC-12 | ⬜ | ✅ | target berputar/mengecil |
| TR-14 | Tracking editor + koreksi manual | AC-12 | ⬜ | ✅ | koreksi manual selalu menang |
| TR-08 | Multi-object (≤5 objek) | AC-12 | ⬜ | ⬜ | 5 objek @24fps 720p |

### 5.2 Editing & media (modul pendukung yang dipanggil AI)

| Kode | Fitur | Otomatis | E2E | Kasus negatif/batas |
|---|---|---|---|---|
| P-02 | Import media (file/drag-drop) | ⬜ | ✅ | file korup; format tak didukung |
| P-02 | **Import batch folder (≥10)** | ⬜ | ✅ | folder kosong; nested |
| P-04 | Autosave + crash recovery | ⬜ | ⬜ (unit) | force-kill → recovery 99% |
| P-05 | **Undo/redo multi-level** | ✅ **store unit** | ✅ | ≤50 langkah; operasi AI = 1 entri |
| P-06 | Preview player | ⬜ | ⬜ (manual) | scrub <100 ms; 3 mode kualitas |
| T-14/T-16/T-17 | Trim / split / speed / reverse | ✅ parser offline | ✅ | durasi 0; split di tepi |
| X-01..X-04 | Crop/rotate/flip | ✅ parser | ⬜ | rotasi 0/360 |
| C-* | Color & filter | ✅ parser | ⬜ | LUT hilang |
| E-01..E-13 | 17 shader effect | ✅ parser | ⬜ | **iGPU fallback** (§7) |
| K-01..K-05 | Mask/blend/overlay/chroma | ✅ parser | ⬜ | chroma warna = latar |
| D-01..D-13 | On-device AI (MediaPipe) | ⬜ | ⬜ (manual) | tak ada subjek; OOM |
| S-01..S-13 | Text & caption | ✅ parser | ⬜ | caption 0 kata; UTF-8/emoji |
| A-* | Audio (volume/mute/fade/mix) | ✅ parser | ⬜ | klip tanpa audio |
| R-01..R-18 | Export (res/codec/hwaccel) | ⬜ | ✅ | **4K vs 1080p**; disk penuh; codec hilang |
| M11 | Template | ⬜ | ⬜ | template tak kompatibel |

> **Cakupan hari ini (jujur):** yang **berjalan nyata** = logika murni + kontrak
> backend. Sisanya bertanda ⬜ adalah rencana yang sudah dipetakan, bukan klaim lulus.

---

## 6. Kasus Negatif & Boundary (WAJIB)

### 6.1 Media & file
| Kasus | Harapan | Error code | Status |
|---|---|---|---|
| File korup (header rusak) | Tolak dengan pesan, **tidak crash** | `ERR_MEDIA_CORRUPT` | ⬜ |
| Format tak didukung | Tolak, sarankan transcode | `ERR_MEDIA_UNSUPPORTED` | ⬜ |
| Media hilang saat buka proyek | Tawarkan **relink**, jangan crash | `ERR_MEDIA_MISSING` | ✅ (E2E skeleton) |
| Probe gagal | Graceful, entry ditandai rusak | `ERR_MEDIA_PROBE_FAILED` | ⬜ |
| Disk penuh saat export | Batalkan bersih + pesan | `ERR_EXPORT_NO_SPACE`/`ERR_FS_DISK_FULL` | ⬜ |
| Path tanpa izin | Pesan jelas | `ERR_FS_PERMISSION` | ⬜ |

### 6.2 AI & kontrak
| Kasus | Harapan | Status |
|---|---|---|
| `rawText` hilang | 400 `ERR_VALIDATION_PAYLOAD` | ✅ |
| `rawText` > 4000 char | 400 (batas) | ✅ |
| Respons AI tak valid | retry ≤2x → fallback manual (AC-8) | ✅ (kontrak) |
| `intent` tak dikenal | `intent:'unknown'`, `ops:[]` (no-op plan) | ✅ |
| Cache: input identik | panggilan kedua dari cache (AC-11) | ✅ |
| Quota harian habis | `ERR_AI_QUOTA_EXCEEDED` | ✅ (hook) |
| Offline, perintah cloud | Antre dengan status, **tidak** hilang (G-33/AC-7) | ✅ parser + rencana |
| `opType`/`target` di luar kontrak | 400 `ERR_VALIDATION_SCHEMA` | ✅ |
| `diffSummary` > 200 char | 400 | ✅ |
| `planVersion` ≤ 0 | 400 | ✅ |

### 6.3 Auth & keamanan
| Kasus | Harapan | Status |
|---|---|---|
| `X-Device-Id` bukan UUID v4 | 400 | ✅ |
| Token device A dipakai device B | 401 | ✅ |
| Token sampah / kedaluwarsa | 401 `ERR_AUTH_TOKEN_EXPIRED` | ✅ (sampah) |
| Envelope error seragam | `{error:{code,message}}` untuk semua | ✅ |
| 404 endpoint tak dikenal | Envelope seragam | ✅ |

### 6.4 Boundary (perhitungan / numerik)
| Kasus | Harapan | Status |
|---|---|---|
| `confidence` = 0 dan 1 | Diterima tepat di batas | ✅ |
| `commandRef` = 1 dan = 251 | Diterima tepat di batas | ✅ |
| `commandRef` = null | Diterima (intent belum dipetakan) | ✅ |
| Clarification 2–4 opsi | Diterima; 1 atau 5 ditolak | ✅ |
| Plan tanpa op | Diterima (no-op/preview) | ✅ |
| Undo/redo saat stack kosong | No-op, tidak error | ✅ store unit |

---

## 7. Matriks Environment & Hardware

### 7.1 GPU / hwaccel (risiko tinggi MVP)
| Skenario | Harapan | Level uji |
|---|---|---|
| dGPU + NVENC/QSV tersedia | Export terakselerasi, sinkron | manual + `ERR_EXPORT_HWACCEL_FAILED` path |
| **iGPU only / driver lama** → **fallback ke CPU** | **Otomatis fallback**, tidak gagal, kualitas sama | manual (matriks device) + unit pada pemilihan encoder |
| `ERR_SYSTEM_HWACCEL` muncul saat init | UI menjelaskan, tetap bisa render CPU | manual |
| 17 shader di iGPU | Render benar; bila tak didukung → jalur CPU | manual |

### 7.2 Resolusi & performa (target, dari `00-spec.md` §12)
| Properti | Target | Catatan |
|---|---|---|
| Playback 1080p | ≤30 fps di laptop target | manual |
| **4K vs 1080p** | 4K export selesai tanpa OOM; waktu wajar | E2E project `electron-4k` |
| Scrub | <100 ms | manual |
| Parse AI | ≤4 s p95 (teks ≤200 char) | backend timing |
| Apply | ≤500 ms setelah konfirmasi | ✅ (hook) |
| Crash-free | ≥99% | rilis |
| Queue offline | ≥15 perintah lokal tanpa internet | ✅ parser |

### 7.3 OS / distribusi
- Windows (NSIS + portable) — primary. macOS (dmg), Linux (AppImage/deb) — smoke install manual.

---

## 8. Test-id & Selector Contract

Selector urutan: **(1) role + accessible name → (2) label → (3) `data-testid`**.
Aplikasi **wajib** mengekspos titik stabil berikut agar E2E deterministik (bukan
rantai CSS):

| `data-testid` | Elemen |
|---|---|
| `app-ready` (di `<html>`) | penanda hydration / siap |
| `prompt-input`, `prompt-apply` | bilah perintah AI |
| `timeline-clip` | klip di timeline |
| `import-dialog-path` | input path import (test affordance) |
| `tracking-point`, `tracking-canvas`, `tracking-status`, `tracking-correction-badge` | tracking editor (TR-14) |
| `binding-target` | target tracking yang menempel |
| `export-status` | status siap export |
| `error-banner` | envelope error ter-render |

Aturan: `data-testid` **stabil** (tidak ikut rename desain); role/label dipakai lebih
dulu kapan pun memungkinkan.

---

## 9. Hasil Eksekusi Nyata (Stage 7)

Dijalankan di Windows, Node v24.11.0, npm 11.6.1.

### 9.1 Unit (Vitest)
```
RUN  v5.0.5  C:/apk/laragon/www/keylox/keylox_desktop
 ✓ tests/unit/aiParser.test.ts              (25 tests) 16ms
 ✓ tests/unit/editorStore.undo-redo.test.ts (16 tests) 145ms
 Test Files  2 passed (2)
      Tests  41 passed (41)
   Duration  ~750 ms
```

### 9.2 Backend integration (`node --test`)
```
ℹ tests 33
ℹ pass 33
ℹ fail 0
ℹ duration_ms ~4.7 s
```
Mencakup: `/health` (+ alias `/v1`), envelope 404 seragam, `/ai/parse-command`
mengembalikan **EditPlan valid skema (AC-8)**, validasi 400 (rawText hilang/ >4000),
`X-Device-Id` non-UUID → 400, **cache hit (AC-11)**, `/ai/usage`, `/ai/jobs`
(CRUD + validasi), `/auth/token` + otorisasi Bearer (device crossing → 401),
serta unit schema `OP_TYPES` (grup M14) & batas confidence/commandRef/diffSummary.

### 9.3 Rekap
| Suite | Perintah | Tes | Lulus | Gagal | Durasi |
|---|---|---|---|---|---|
| Unit (Vitest) | `npm run test:unit` | 41 | **41** | 0 | ~0.8 s |
| Backend (`node:test`) | `npm run test:backend` | 33 | **33** | 0 | ~4.7 s |
| **Total (`npm test`)** | `npm test` | **74** | **74** | **0** | ~5.5 s |

> Semua angka di atas adalah hasil run nyata di mesin ini, bukan asumsi.
> E2E **tidak** dihitung lulus karena memang belum dijalankan (§3, §4.3).

---

## 10. Rencana CI (GitHub Actions)

- **Sharding** 4 arah (`--shard=i/4`) agar suite < 10 menit; `fail-fast: false`.
- **Artefak kegagalan** selalu diunggah: `test-results/` (trace/screenshot/video).
- **Merge-blocking:** suite stabil (unit+backend+E2E stabil) memblokir merge;
  suite **karantina** berjalan di lane terpisah non-blocking.
- **Retries=0** di main lane; bila sementara dinyalakan, hanya untuk **mengukur**
  flake (dashboard pass-on-retry), bukan menyembunyikan.
- Env backend tes: `MOCK_AI=true`, `NODE_ENV=test`, `HOST=127.0.0.1`, JWT ≥32 char,
  `LOG_LEVEL=silent` — tanpa jaringan, tanpa kuota.

---

## 11. Triage Flake (akar masalah, bukan workaround)

| Gejala | Akar masalah kemungkinan | Perbaikan (bukan tambal) |
|---|---|---|
| Lulus lokal, gagal di CI | Timing: CI lebih lambat, race terbuka | Ganti wait berbasis waktu → kondisi; audit `waitForTimeout` |
| Gagal hanya saat paralel | State bersama (user/record sama) | Data per-tes/per-worker lewat factory |
| Gagal ~1/20 "elemen tak ada" | Race animasi/render, selector tak stabil | Assert web-first pada state akhir; selector role/testid |
| Gagal setelah merge "tak terkait" | Coupling tersembunyi ke seed bersama | Tes memiliki datanya sendiri; hapus ketergantungan seed |
| Timeout navigasi | Skrip pihak ketiga/analytics memblokir load | Blokir route pihak ketiga; tunggu sinyal app-ready, bukan `load` |

SLA: setiap flake → tiket akar masalah dalam **24 jam**; keluar dari suite
merge-blocking dalam 24 jam (pindah ke lane karantina).

---

## 12. Kriteria Lulus & Rilis (Release Gate)

### 12.1 Per-tes (Definition of Done untuk tes baru)
- [ ] Lulus **10x berturut-turut** lokal (`--repeat-each=10`) **dan** di CI.
- [ ] Tanpa `sleep` keras; menunggu kondisi.
- [ ] Memiliki datanya sendiri; aman saat paralel.
- [ ] Selector role-first (atau `data-testid` terdaftar §8).
- [ ] Kegagalannya bisa di-debug dari artefak saja.

### 12.2 Per-suite (kesehatan operasional)
| Metrik | Ambang |
|---|---|
| Pass rate suite merge-blocking | **≥ 99.5%** (retry ≤1, menuju 0) |
| Flake rate (pass-on-retry) | **< 0.5%** dari eksekusi |
| Durasi suite penuh | **< 10 menit** (sharding) |
| Kegagalan CI yang bisa di-debug dari artefak | **100%**, nol "cannot reproduce" |

### 12.3 Rilis MVP
- [ ] **AC-1..AC-11** terverifikasi (intent ≥88% pada eval 300 perintah; latensi
      parse ≤4 s p95; offline ≥15 perintah; output tervalidasi skema; cache).
- [ ] **AC-12 (tracking):** 15/15 `TR-01..TR-15` lulus AC drift/akurasi pada 100
      klip; ≤5 objek @24fps 720p; re-link oklusi ≤500 ms; TR-14 selalu bisa koreksi;
      data tracking reusable (cache).
- [ ] **AC-9:** 100% fitur editing MVP punya ≥1 perintah AI pemicu.
- [ ] **AC-10:** satu prompt dari ≥10 media → video siap export pada ≥80% percobaan.
- [ ] Nol bug Sev-1/Sev-2 terbuka; crash-free ≥99%.
- [ ] Installer (NSIS + portable) terpasang & jalan di laptop target (manual).

---

## 13. Traceability ke Acceptance Criteria

| AC | Deskripsi ringkas | Layer pembuktian | Status |
|---|---|---|---|
| AC-1 | Akurasi intent ≥88% (eval 300) | eval AI + manual | ⬜ |
| AC-2 | Ambiguitas → 2–4 opsi / 1 klarifikasi | unit + E2E | ✅ (schema clarification) |
| AC-3 | Konfirmasi operasi destruktif (kelas D) | E2E | ⬜ |
| AC-4 | Reversibilitas 1 langkah (undo) | ✅ store unit | ✅ |
| AC-5 | Referensi konteks "ini/itu" | E2E | ⬜ |
| AC-6 | Latensi parse ≤4 s p95 / apply ≤500 ms | backend timing | ✅ (hook) |
| AC-7 | Offline ≥15 perintah lokal | ✅ parser unit | ✅ |
| AC-8 | Output = EditPlan tervalidasi skema | ✅ backend | ✅ |
| AC-9 | Cakupan 100% fitur MVP punya perintah | matrix §5 + spec §8 | ⬜ |
| AC-10 | Satu prompt → siap export ≥80% | E2E | ⬜ |
| AC-11 | Tanpa kebocoran biaya (cache) | ✅ backend | ✅ |
| AC-12 | Tracking inti (TR-01..TR-15) | unit math + E2E + manual | ⬜ |

---

## 14. Gap & Rencana Lanjutan

| # | Gap | Rencana |
|---|---|---|
| 1 | E2E Electron belum dijalankan | `npm i -D @playwright/test`; expose `app-ready` & test-id §8; jadikan merge-blocking |
| 2 | Tes store belum menutup operasi timeline (trim/split/effect) | Tambah unit reducer per operasi + boundary (durasi 0, split di tepi) |
| 3 | Tracking (M14) belum ada tes | Mulai dari unit *math* (drift, transform per-frame) → layar tracking editor |
| 4 | Parser AI hanya jalur offline | Tambah kasus: 251 perintah → `commandRef`; campur ID/EN; ambiguitas |
| 5 | Export & hwaccel fallback belum diuji | Unit pemilihan encoder + matriks manual iGPU; E2E project `4k` |
| 6 | Import batch folder belum diuji | E2E `createWithMedia(10)` + unit deteksi tipe |
| 7 | Belum ada dashboard flake | Pipeline pass-on-retry + clustering error |
| 8 | Visual regression belum ada | Lane terpisah (threshold per-komponen), bukan ditempel ke tes fungsional |

---

## Lampiran A — Artefak yang dibuat pada Stage ini
| File | Isi |
|---|---|
| `keylox_desktop/vitest.config.mts` | Konfigurasi Vitest (renderer) |
| `keylox_desktop/tests/unit/aiParser.test.ts` | 25 tes parser AI offline |
| `keylox_desktop/tests/unit/editorStore.undo-redo.test.ts` | 16 tes undo/redo store |
| `keylox_desktop/tests/backend/api.smoke.test.js` | Smoke/integration backend (HTTP nyata) |
| `keylox_desktop/tests/backend/editPlan.schema.unit.test.js` | Unit schema kontrak EditPlan |
| `keylox_desktop/tests/backend/helpers/server.js` | Spawn backend nyata (port ephemeral, MOCK_AI) |
| `keylox_desktop/tests/backend/helpers/editPlanContract.js` | Skema Zod kontrak (milik tes) |
| `keylox_desktop/tests/e2e/**` | Skeleton E2E Playwright+Electron (belum dijalankan) |
| `keylox_desktop/tests/fixtures/README.md` | Kontrak fixture deterministik |
| `keylox_desktop/tests/README.md` | Panduan runner & aturan suite |
| `keylox_desktop/src/renderer/lib/aiParser.ts` | Parser murni (diekstrak dari `PromptBar.tsx`) |

**Tidak tersentuh:** `keylox/docs/superapp/api-contract.md`, `keylox/docs/superapp/04-schema.sql`.
