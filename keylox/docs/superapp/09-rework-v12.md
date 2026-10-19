# 09 — Rework v1.2 · Checklist Handoff (Stage 2 → Stage 4/5)

> **Dokumen:** `09-rework-v12.md` · **Stage 2** dari SUPERAPP_PIPELINE (REWORK v1.2, Okt 2026)
> **Untuk:** Stage 4 (Prompt/LLM) & Stage 5 (Render/Media) — **bukan** kode diubah di Stage 2.
> **Sumber kebenaran:** `api-contract.md` **v1.2**, `byok-api-key.md` (ADR-03/ADR-04), `privacy-data.md` (ADR-05), `08-review.md` (REJ-01..REJ-14), `01-architecture.md`, `04-schema.sql`.
> **Bahasa:** Indonesia.
>
> **Aturan main (WAJIB):**
> 1. **Jangan mematahkan 250 tes yang sudah hijau** (**159 unit Vitest + 91 backend**). Setiap item di bawah menyebut tes yang harus tetap lulus + tes baru yang boleh ditambah.
> 2. **Perubahan breaking / perubahan perilaku wajib eksplisit** — hanya **dua**: (a) **§3.5** `CACHE_TTL_MS` produksi 30 hari → **≤ 5 menit**; (b) **§2.12.5/§4.3** `applyPlan` memakai **satu grup undo** per perintah AI. Keduanya sudah ditandai di changelog `api-contract.md` §7.
> 3. **Kode tidak boleh menebak.** Semua nama channel, header, kode error, kolom SQL, dan nilai enum harus persis seperti di `api-contract.md` v1.2.
> 4. **Renderer tidak pernah memegang provider key.** Tidak ada `apiKey` di store/Zustand/`localStorage`/`.keylox`/`shared/`.

---

## 0. Peta REJ → Item Rework

| Item | Judul | Menutup REJ | Prasyarat |
|---|---|---|---|
| **R1** | Provider Registry + adapter multi-provider | REJ-02 (sebagian) | — |
| **R2** | Capability check + badge + disable | ADR-04 (tanpa REJ spesifik) | R1 |
| **R3** | Transparansi token/biaya + panel Usage | ADR-04 (tanpa REJ spesifik) | R1, `04-schema.sql` v1.2 |
| **R4** | Privasi: perbaikan cache + `privacy:*` + `data:*` + panel "Data & Privasi" + local-only + konfirmasi | ADR-05 (celah cache `privacy-data.md` §3.1) | R1 |
| **R5** | Onboarding "Dapatkan API Key Gratis" + `shell:openExternal` | REJ-02, REJ-03 | R1 |
| **R6** | Undo grouping + selaraskan `transcribe`/`asr` | REJ-01, REJ-05 | — |
| **R7** | Koreksi dokumen stale + nomor "07" + ekspos `data-testid` | REJ-04, REJ-06, REJ-07, REJ-08, REJ-09\*, REJ-10, REJ-11, REJ-12, REJ-13, REJ-14 | — |

> \* REJ-09 (skema belum diverifikasi runtime) hanya bisa **disiapkan** di Stage 2 (catatan migrasi idempoten + kolom baru); verifikasi runtime tetap **GAP-01** milik Stage 6/QA.

> REJ-06/REJ-07 (aksesori `settings:get/set` + field aditif) & REJ-10/REJ-11/REJ-12/REJ-13/REJ-14 **sudah diperbaiki di dokumen Stage 2** (lihat §R7). Sisa kerja kode ada di bawah.

**Legend kelompok:** `[SHARED]` = `src/shared/` (main+renderer+backend) · `[RENDERER]` = `src/renderer/` · `[BACKEND]` = `backend/src/` · `[MAIN]` = `src/main/` (disebut eksplisit bila di luar tiga kelompok utama).

---

## R1 — Provider Registry + Adapter Multi-Provider (ADR-03) · menutup REJ-02 (sebagian)

**Tujuan:** menambah provider tanpa mengubah logika routing; satu sumber kebenaran data provider.

### R1.1 `[SHARED]`
- **File (BARU):** `src/shared/providerRegistry.js`
- **Perubahan:** definisikan **berkas data murni** (tanpa rahasia) berisi 13 provider persis seperti `api-contract.md` §2.13: `gemini, openai, anthropic, openrouter, groq, deepseek, mistral, xai, together, cerebras, ollama, lmstudio, custom`. Field per record: `id,label,adapter,host,baseUrl,keyPattern,modelPatterns,defaultModel,docsUrl,freeTier,capabilities{json,vision,audioIn,audioOut,tools},pricePer1M,null|{in,out},privacy{leavesDevice,freeTierTraining,retentionNote}`.
- **Acceptance:** `providerRegistry` **dapat di-import oleh renderer** (data tidak memuat key/host-rahasia); `Object.freeze()`; ada asersi "13 provider terdaftar & tiap `id` unik".
- **Tes:** tambah `tests/unit/providerRegistry.test.js` (jumlah provider = 13, field wajib lengkap, `modelPatterns` valid regex). **Tes lama tetap lulus.**

### R1.2 `[MAIN]`
- **File (BARU):** `src/main/providerRegistry.js` — wrapper: re-export `shared/providerRegistry.js` + helper `resolveProvider(id)`, `resolveModel(providerId, model)`, `modelsFor(providerId)`.
- **File (DIUBAH):** `src/main/providerPolicy.js` — generalisasi dari allowlist 2-provider (`gemini`,`openai`) ke **13 provider** dengan membaca registry; pertahankan API publik (`validateProvider`, `validateApiKey`, `validateProviderBaseUrl`, `validateBackendBaseUrl`, `resolveModel`) agar `aiClient.js` & tes lama tak berubah.
- **File (DIUBAH):** `src/main/secretStore.js` — simpan key **per provider** (`{provider: {apiKey, model, baseUrl}}`), tetap `safeStorage` → `settings.enc`. `hasSecret(provider)` tetap mengembalikan `{hasKey, masked, model}`; tambah `error` aditif saat gagal (§2.12.2, menutup REJ-07).
- **File (DIUBAH):** `src/main/aiClient.js` — kirim provider dari Settings; jangan hardcode 2 provider.
- **Acceptance:** `validateApiKey('groq', key)` mengenali pola Groq; model di luar `modelPatterns` **jatuh diam-diam** ke `defaultModel` (bukan error) — jaga perilaku lama.

### R1.3 `[BACKEND]`
- **File (DIUBAH):** `backend/src/services/providerRegistry.js` — sinkronkan jadi 13 provider dari `shared/providerRegistry.js` (atau simpan salinan + tes paritas). Perluasan `PROVIDERS` + `hosts` allowlist.
- **File (DIUBAH):** `backend/src/middleware/byok.js` — `X-Provider` menerima **enum id registry**; `x-provider-base-url` **hanya** untuk `custom`/lokal, di luar itu **diabaikan** (pakai `baseUrl` registry) (§3.7 butir 3).
- **Acceptance:** `X-Provider: groq` tidak lagi → `ERR_PROVIDER_UNSUPPORTED`; `X-Provider: tidak-ada` → `ERR_PROVIDER_UNSUPPORTED`; `X-Provider-Base-Url` untuk `gemini` diabaikan (bukan dipakai).
- **Tes lama yang **wajib** lulus:** `tests/backend/ssrf.unit.test.js`, `tests/backend/byok.proxy.test.js` (perluasan allowlist **tidak** boleh melonggarkan anti-SSRF).

---

## R2 — Capability Check + Badge + Disable (ADR-04) · tanpa REJ spesifik

### R2.1 `[SHARED]`
- **File (DIUBAH/BARU):** `src/shared/capabilityMatrix.js` — matriks `jobType → capability` kanonik (§2.14.3): `parse_command|chat|refine|metadata|translate|moderation|highlight|montage|search|index_asset|script|reframe → json`; `transcribe`/`asr` → `audioIn`; `scene_detect|ocr|thumbnail|vision_color → vision`; `tts → audioOut`.
- **Acceptance:** setiap `jobType` kanonik (§2.14.3, termasuk alias `asr`) punya tepat satu kapabilitas; ada fungsi `capabilityFor(jobType)`.

### R2.2 `[MAIN]`
- **File (BARU):** `src/main/capabilityService.js` — `check(providerId, jobType, capabilitiesOverride?)`:
  - kapabilitas **eksplisit `false`** → tolak `ERR_PROVIDER_INCOMPATIBLE`;
  - kapabilitas **`null`** (belum diketahui) → **izinkan** + tandai "belum diverifikasi";
  - dipanggil **sebelum** request keluar di `aiClient.js`.
- **Acceptance:** `ai:invoke({jobType:'transcribe'})` pada `deepseek` (`audioIn:false`) → `ERR_PROVIDER_INCOMPATIBLE`; pada provider ber-`audioIn:null` → diteruskan.

### R2.3 `[RENDERER]`
- **File (DIUBAH):** `src/renderer/components/SettingsModal.tsx` — tampilkan **badge kapabilitas** per provider (dari `shared/providerRegistry.js`) + **disable** tombol/aksi jobType yang tak didukung; teks "Tidak didukung oleh `<provider>`".
- **File (DIUBAH):** `src/renderer/lib/ipc.ts` + `src/renderer/App.tsx` — tangani error `ERR_PROVIDER_INCOMPATIBLE` (§5.2.1) → toast + saran ganti provider/model.
- **Acceptance:** memilih provider tanpa `vision` men-disable tombol "Scene detect" dan menampilkan badge; memilih provider `null` kapabilitas **tidak** men-disable (hanya label "belum diverifikasi").

---

## R3 — Transparansi Token/Biaya + Panel Usage (ADR-04) · tanpa REJ spesifik

### R3.1 `[SHARED]`
- **File (DIUBAH):** `src/shared/types/` + `src/shared/schemas/` — tambah `UsageSummary` (§2.16) + Zod.

### R3.2 `[MAIN]`
- **File (BARU):** `src/main/usageService.js` — hitung `est_cost_usd` dari `pricePer1M` registry × token; `null` bila harga `null`; tulis ke `ai_usage_records` (`provider`, `model`, `job_type`, `input_tokens`, `output_tokens`, `est_cost_usd`, `cache_hit`, `latency_ms`).
- **File (DIUBAH):** `main.js` / handler IPC — daftarkan channel `usage:get` (§2.16) → `usageService.summary(range)`.
- **Acceptance:** setelah 1 panggilan ke provider ber-harga, `usage:get` mengembalikan `totals.estCostUsd` ≠ `null`; untuk `custom`/provider tanpa harga → `null` dan UI hanya menampilkan token.

### R3.3 `[BACKEND]`
- **File (DIUBAH):** `backend/src/services/usage.js` — catat `provider` & `est_cost_usd` (kolom baru) bila backend yang menulis usage.
- **Acceptance:** `v_ai_usage_daily` (§15.11) mengembalikan `provider` + `est_cost_usd`.

### R3.4 `[RENDERER]`
- **File (DIUBAH):** `SettingsModal.tsx` — tambah **panel "Usage"**: tabel dari `usage:get` (harian/provider/model, token in/out, estimasi biaya) + label **"Estimasi biaya (bukan tagihan)"** + tombol **Hapus riwayat penggunaan** → `data:wipeLocal({scope:'usage',confirm:true})`.
- **Acceptance:** panel menampilkan token walau biaya `null`; tombol hapus memanggil channel yang benar.

**Prasyarat DB:** kolom `provider` & `est_cost_usd` sudah ditambah di `04-schema.sql` v1.2 (Bagian 3.3) — lihat §R7.1.

---

## R4 — Privasi: Perbaikan Cache + `privacy:*` + `data:*` + Panel "Data & Privasi" (ADR-05) · tanpa REJ spesifik

### R4.1 `[BACKEND]` — **perubahan perilaku**
- **File (DIUBAH):** `backend/src/services/config.js` — `cacheTtlMs` default **`300000` (5 menit)**, bukan `2592000000` (30 hari).
- **File (DIUBAH):** `backend/src/services/cache.js` — `updateAgeOnGet: false`; **blokir penulisan** untuk `jobType` berkonten (hanya `scene_detect`, `thumbnail`, `vision_color`, `reframe`, `index_asset` yang boleh masuk cache). Cache konten = **in-memory only**.
- **File (DIUBAH):** logger/`backend/src/logger.js` + route `ai.js` — **pastikan tidak ada** penulisan prompt/respons ke disk/log (§3.8) — audit & tambah tes.
- **Acceptance:** `transcribe`/`parse_command` **tidak** menghasilkan baris cache; TTL yang terpasang ≤ 5 menit; membaca cache tidak memperpanjang `expires_at`.
- **Tes lama:** periksa tes backend yang mengandalkan cache lama; sesuaikan **hanya** di jalur struktural.

### R4.2 `[MAIN]`
- **File (BARU):** `src/main/privacyService.js` — mode `local-only|standard|cloud`; simpan ke `settings.enc` (key `privacy.mode`) sebelum DB ada, lalu ke `user_settings`; gerbang `local-only` (blok cloud → `ERR_PRIVACY_LOCAL_ONLY_BLOCKED`); konfirmasi `freeTierTraining` (→ `ERR_PRIVACY_CONSENT_REQUIRED`); konfirmasi **frame/audio** sebelum mengirim media ke cloud.
- **File (DIUBAH):** `main.js` — daftarkan channel `privacy:getMode`, `privacy:setMode`, `privacy:confirmExternal`, `data:wipeLocal`, `data:exportLocal` (§2.15).
- **Acceptance:** mode `local-only` → `ai:invoke` cloud ditolak sebelum jaringan; provider `freeTierTraining:true` tanpa konfirmasi → `ERR_PRIVACY_CONSENT_REQUIRED`; `data:exportLocal` default **tidak** menyertakan key.

### R4.3 `[RENDERER]`
- **File (DIUBAH):** `SettingsModal.tsx` — tambah panel **"Data & Privasi"**: pemilih mode (`local-only`/`standard`/`cloud`), indikator "data keluar device" per provider, tombol **Export data lokal** (`data:exportLocal`) & **Hapus data lokal** (`data:wipeLocal`), dialog konfirmasi saat provider `freeTierTraining:true`.
- **File (DIUBAH):** komponen prompt/preview — dialog konfirmasi eksplisit sebelum mengirim **frame/audio** ke cloud.
- **Acceptance:** mengubah mode ke `local-only` langsung berlaku tanpa restart; dialog konfirmasi muncul untuk provider training; tombol wipe/export memanggil channel yang benar.

### R4.4 `[SHARED]`
- **File (DIUBAH):** `src/shared/types/` + `schemas/` — `PrivacyMode`, payload `privacy:*`/`data:*`.
- **Acceptance:** Zod payload cocok dengan §2.15.

---

## R5 — Onboarding "Dapatkan API Key Gratis" + `shell:openExternal` · menutup REJ-02, REJ-03

### R5.1 `[MAIN]`
- **File (DIUBAH):** `preload.js` **dan** handler IPC `main.js` — daftarkan channel `shell:openExternal` (§2.12.7) dengan validasi: **hanya `https:`** + host ∈ allowlist (`docsUrl` semua provider + host onboarding resmi). Host di luar allowlist → `ERR_VALIDATION_PAYLOAD` (`reason:'external_url_not_allowed'`). **Jangan** membungkus `shell.openExternal` bebas.
- **Acceptance:** `shell:openExternal({url:'https://aistudio.google.com/apikey'})` → ok; `http://…`, `file://…`, `javascript:…`, host acak → ditolak; error tidak memantulkan URL mentah.

### R5.2 `[RENDERER]`
- **File (DIUBAH):** `SettingsModal.tsx` — tombol **"Dapatkan API Key Gratis"** per provider → `keylox.shell.openExternal({ url: provider.docsUrl })` (dari `shared/providerRegistry.js`); tampilkan `freeTier` (badge "Gratis tersedia").
- **Acceptance:** tombol membuka `docsUrl` provider terpilih di browser OS; provider tanpa tier gratis menyembunyikan/menonaktifkan tombol.

### R5.3 `[SHARED]`
- **File (DIUBAH):** `lib/ipc.ts` + tipe `window.keylox.shell.openExternal`.

---

## R6 — Undo Grouping + Selaraskan `transcribe`/`asr` · menutup REJ-01, REJ-05

### R6.1 `[RENDERER]` — **perubahan perilaku**
- **File (DIUBAH):** `src/renderer/stores/editorStore.ts` — tambah `beginGroup(label)` / `endGroup()` (atau `applyOps(ops)`), sehingga **satu perintah AI = satu `group_id`**.
- **File (DIUBAH):** `src/renderer/components/PromptBar.tsx` — `applyPlan` memanggil `beginGroup` **sekali** sebelum menerapkan seluruh `ops` dan `endGroup` sesudah; **tidak** lagi memunculkan N entri history (baris 151-152 lama = akar REJ-01).
- **Acceptance:** menerapkan `EditPlan` dengan 5 ops lalu `undo` **sekali** → seluruh 5 ops kembali (bukan 1 ops per undo). Selaras `undo_records.group_id` (§4.3 butir 7).
- **Tes lama:** `tests/unit/editorStore.undo-redo.test.ts` & `tests/e2e/journeys/import-media-undo.spec.ts` **wajib** tetap lulus.

### R6.2 `[BACKEND]` — additive
- **File (DIUBAH):** `backend/src/utils/validate.js` — `JOB_TYPES` menerima **`transcribe`** sebagai **alias** `asr` (tambahkan, jangan hapus `asr`).
- **Acceptance:** `POST /ai/jobs` dengan `jobType:'transcribe'` → 202 (bukan 400); `jobType:'asr'` tetap 202.

### R6.3 `[MAIN]`
- **File (DIUBAH):** `src/main/aiClient.js` — `PROXY_PATHS` tambah `transcribe: '/v1/ai/transcribe'`; klien memakai `transcribe` (kanonik).
- **Acceptance:** mode PROXY untuk suara→teks memanggil `/v1/ai/transcribe` dan tidak lagi gagal 400.

### R6.4 `[SHARED]`
- **File (DIUBAH):** `src/shared/` constants — `JOB_TYPES` kanonik = daftar §2.14.3; `jobType` renderer tetap `transcribe`.

---

## R7 — Koreksi Dokumen Stale + Nomor "07" + Ekspos `data-testid` · menutup REJ-04, REJ-06..REJ-14

### R7.1 Dokumen yang **sudah** diperbaiki di Stage 2 (verifikasi, bukan kerjakan)
- **`01-architecture.md`**: §5.1 **ditulis ulang** (BYOK/multi-provider/safeStorage) — menutup **REJ-10**; §2 struktur preload → **`preload.js` di root** — menutup **REJ-11**; modul baru (registry/capability/privacy/usage) + ADR addendum.
- **`api-contract.md` v1.2**: §2.11.2 kini memuat `settings:get/set` + 7 aksesori — menutup **REJ-06**; field aditif `settings:hasSecret.error` & `settings:get {value,error}` didokumentasikan — menutup **REJ-07**.
- **`04-schema.sql` v1.2**: `ai_usage_records(+provider,+est_cost_usd)` + view `v_ai_usage_daily` + seed `privacy.mode` + catatan migrasi idempoten — menutup bagian **REJ-09** (skema didokumentasikan untuk verifikasi runtime).

### R7.2 Dokumen yang **sudah** diperbaiki di Stage 2 — verifikasi saat implementasi
- **`06-security.md`**: §1.3 "BYOK belum diimplementasikan" sudah diluruskan; §10/§10.1 usulan kontrak BYOK ditandai **DITERAPKAN** (v1.1/v1.2); §2.2/§11.1 angka berkas **43 → 55**; SEC-PROMPT-01 **RESOLVED** — menutup **REJ-12**.
- **`05-bugs.md`** & **`05-test-plan.md`**: angka tes **`41 unit + 33 backend = 74` → `159 unit + 91 backend = 250`**; `secret-scan (42/43 berkas) → 55 berkas`; status BUG-01 **FIXED**, BUG-04 **PARTIALLY-RESOLVED** — menutup **REJ-13**.
- **`07-pipeline.md`**: tabrakan nomor "07" dengan `byok-api-key.md` sudah dicatat/dibereskan (H1 `byok-api-key.md` memang tanpa "07") — menutup **REJ-14**.
- **Acceptance (jalankan sebelum tutup rework):** tidak ada lagi **klaim aktif** "BYOK belum diimplementasikan" (kemunculan coret `~~…~~` di `06-security.md` sebagai jejak historis **diizinkan**, asalkan langsung diikuti koreksi "Sudah diterapkan"); `grep -rE "41 unit \+ 33 backend|43 berkas" docs/superapp` → hanya **kemunculan historis** yang eksplisit (snapshot Stage 7 di `05-bugs.md`/`05-test-plan.md` + tabel sumber `08-review.md`); tidak ada lagi rekomendasi "harus diperbaiki" untuk REJ-12/13/14.

### R7.3 `[RENDERER]` Ekspos `data-testid` — menutup REJ-04 (blocker lane E2E)
- **File (DIUBAH):** komponen renderer — ekspos `data-testid` sesuai `05-test-plan.md` §8: `app-ready`, `prompt-input`, `prompt-apply`, `timeline-clip`, `import-dialog-path`, `tracking-point`, `tracking-canvas`, `tracking-status`, `tracking-correction-badge`, `binding-target`, `export-status`, `error-banner`. Saat ini hanya `SettingsModal.tsx` yang punya (`test-status`, baris 380).
- **Acceptance:** lane E2E (BUG-02/03/04) dapat memilih elemen via `data-testid`; 3 spec journey (`one-prompt-edit`, `import-media-undo`, `tracking-binding`) berjalan tanpa selector rapuh.

---

## 8. Definisi Selesai (DoD) Rework v1.2

- [ ] **250 tes lama tetap hijau** (159 unit + 91 backend) + tes baru untuk R1..R7.
- [ ] `secret-scan` **BERSIH** (55 berkas) — tidak ada key di bundle.
- [ ] Tidak ada `apiKey` di renderer (`shared/`, store, `localStorage`, `.keylox`).
- [ ] 7 channel baru terdaftar di allowlist `preload.js`: `shell:openExternal`, `usage:get`, `privacy:getMode`, `privacy:setMode`, `privacy:confirmExternal`, `data:wipeLocal`, `data:exportLocal`.
- [ ] Kode error baru dikenal UI: `ERR_PROVIDER_INCOMPATIBLE`, `ERR_PROVIDER_MODEL_UNSUPPORTED`, `ERR_PRIVACY_CONSENT_REQUIRED`, `ERR_PRIVACY_LOCAL_ONLY_BLOCKED`, `ERR_PROVIDER_BASE_URL_NOT_ALLOWED`.
- [ ] Dua perubahan perilaku sudah diterapkan **dan** dicatat di changelog: TTL cache ≤ 5 mnt & undo grouping 1-per-perintah.
- [ ] Angka tes & berkas di `05-*`, `06-security.md` sudah disinkronkan (REJ-13).

---

## 9. Urutan Eksekusi Disarankan

1. **R6** (undo grouping + `transcribe`/`asr`) — mandiri, menutup 2 REJ penting, risiko rendah.
2. **R7.3** (ekspos `data-testid`) — membuka lane E2E agar R1..R5 dapat diuji end-to-end.
3. **R1** (registry + adapter) — fondasi untuk R2..R5.
4. **R2** (capability) & **R5** (onboarding + `shell:openExternal`) — permukaan UI provider.
5. **R4** (privasi + cache) — perubahan perilaku, butuh pengujian hati-hati.
6. **R3** (usage) — bergantung pada kolom DB v1.2.
7. **R7.2** (verifikasi dokumen stale) — terakhir, agar angka final sudah stabil.

---

*— STAGE 2 (Software Architect). Kontrak & arsitektur v1.2 = hukum; checklist ini = jembatan ke Stage 4/5. Tidak ada kode yang diubah di Stage 2.*
