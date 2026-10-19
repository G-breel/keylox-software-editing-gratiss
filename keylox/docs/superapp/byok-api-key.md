# BYOK — API Key Milik User (Bring Your Own Key)

> Dokumen pelengkap (bukan bagian penomoran pipeline 00–08). Lihat `07-pipeline.md`
> untuk DevOps dan `08-review.md` untuk review Stage 10.

> Status: keputusan desain final (v1). Menyesuaikan `01-architecture.md` & `api-contract.md`.
> Prinsip: **tidak ada API key milik developer di dalam binary/installer.** Setiap user memakai
> key AI miliknya sendiri. Key developer hanya dipakai untuk *testing lokal*, lewat env var.

---

## 1. Tujuan

| Aspek | Sebelum | Sesudah (BYOK) |
|---|---|---|
| Sumber key | Env backend developer | Key milik user, diisi di Settings |
| Penyimpanan | `localStorage` (plaintext) | `safeStorage` terenkripsi OS (main process) |
| Distribusi | Berisiko key ikut ter-bundle | Installer bersih, tanpa key |
| Biaya AI | Developer menanggung | User menanggung sendiri |
| Provider | Hanya Gemini | Gemini (default) + OpenAI-compatible (opsional, v2) |

Konsekuensi: fitur AI **tidak lagi "gratis" tanpa setup**. Saat pertama kali buka, app harus
meminta user memasukkan key (atau memilih mode offline rule-based saja).

---

## 2. Mode Operasi (dipilih otomatis)

App mendukung 2 jalur, dipilih otomatis berdasarkan apakah user mengisi URL backend:

```
                 ┌──────────────────────────────┐
                 │   Apakah Backend URL diisi?  │
                 └──────────────┬───────────────┘
                    tidak       │        ya
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
   MODE DIRECT (tanpa backend)          MODE PROXY (backend relay)
   App → Gemini API langsung            App → Backend → Gemini API
   key user dikirim ke Google           key user diteruskan via header
   (butuh internet)                     (backend tidak menyimpan key)
```

### 2.1 Mode DIRECT (default untuk user pribadi)
- App memanggil endpoint provider langsung dari main process (Node), **bukan** dari renderer.
- Key dibaca dari storage terenkripsi → dipasang di header/query saat request.
- Kelebihan: tanpa server, tanpa biaya hosting. Kekurangan: key ada di sisi klien (wajar untuk BYOK).

### 2.2 Mode PROXY (opsional, untuk tim/organisasi)
- Backend hanya menjadi **relay**; key tidak disimpan permanen.
- Key dikirim per-request lewat header `X-Provider-Key` di atas HTTPS/TLS.
- Backend **wajib** menolak request tanpa TLS kecuali `localhost` (mode dev).
- Cache ber-hash **tidak** menyimpan key; kunci cache = hash(jobType + input + modelVersion + hash(key)[8]).

---

## 3. Penyimpanan Key (aman)

| Item | Aturan |
|---|---|
| Mekanisme | Electron `safeStorage.encryptString()` (DPAPI di Windows / Keychain di macOS / libsecret di Linux) |
| Lokasi | `app.getPath('userData')/secure/settings.enc` (byte terenkripsi) |
| Format | Binary terenkripsi → JSON `{ provider, apiKey, model, baseUrl }` |
| Akses | **Hanya main process**. Renderer tidak pernah menerima key penuh |
| Di renderer | Hanya status `hasKey: true/false` + key termask (`AIza••••••••1234`) |
| Log | Key dilarang masuk log/telemetri/crash report; redact pola `AIza[a-zA-Z0-9_-]{20,}` dan `sk-[...]` |
| Repo | `.env` & file key masuk `.gitignore`. Secret scanning di CI (Stage 8) |

Migrasi: saat pertama dijalankan, jika ada `localStorage.geminiKey`, app menawarkan
"pindahkan ke penyimpanan aman?" → lalu **menghapus** nilai dari `localStorage`.

---

## 4. UI Settings (BYOK)

Bagian baru di Settings Modal:

```
┌─ AI Provider ─────────────────────────────────────┐
│ Provider      [ Gemini ▾ ]  (Gemini / OpenAI-compat) │
│ API Key       [ ••••••••••••••1234 ]  [Ganti] [Hapus]│
│ Model         [ gemini-2.5-flash ▾ ]                 │
│ Base URL      [ https://generativelanguage...  ]     │
│                                                      │
│ [ Tes Koneksi ]   Status: ● Terhubung (320 ms)       │
│                                                      │
│ ○ Mode: Direct (langsung, tanpa server)              │
│ ● Mode: Proxy  Backend URL [ https://... ]           │
└──────────────────────────────────────────────────────┘
```

Perilaku:
- **Tes Koneksi**: kirim prompt termurah ("ping") → tampilkan OK/gagal + pesan error provider.
- **Ganti/Hapus**: hapus = menimpa file terenkripsi dengan state kosong + `safeStorage` tidak dihapus.
- Validasi format key per provider (regex ringan) sebelum simpan.
- Tanpa key: fitur AI menampilkan CTA "Atur API Key" + tetap bisa pakai perintah rule-based offline.

---

## 5. Perubahan Kontrak (tambahan, tidak memecah yang lama)

### 5.1 IPC baru (renderer ⇄ main)
| Channel | Arah | Payload | Keterangan |
|---|---|---|---|
| `settings:setSecret` | invoke | `{ provider, apiKey, model, baseUrl }` | Simpan terenkripsi (main saja) |
| `settings:hasSecret` | invoke | `{ provider }` | → `{ hasKey, masked, model }` |
| `settings:clearSecret` | invoke | `{ provider }` | Hapus key |
| `settings:testProvider` | invoke | `{ provider }` | Tes koneksi → `{ ok, latencyMs, error? }` |
| `ai:invoke` | invoke | `{ provider, jobType, payload }` | **Semua panggilan AI lewat sini** (main) |

> Aturan lama tetap: renderer tidak pernah memegang key. Karena itu panggilan AI langsung
> dari renderer (`fetch` ke Gemini) **dihapus**, diganti `ai:invoke` ke main.

### 5.2 Header backend (mode proxy)
| Header | Wajib | Isi |
|---|---|---|
| `X-Device-Id` | ya | id perangkat (rate limit) |
| `Authorization` | opsional | `Bearer <JWT>` |
| `X-Provider-Key` | mode proxy | key user (TLS only; dilarang di-log) |
| `X-Provider` | opsional | `gemini` (default) / `openai` |

Backend `gemini.js` diubah: `getClient(reqKey)` memakai key request bila ada,
fallback ke `GEMINI_API_KEY` env (khusus testing/dev).

---

## 6. Testing vs Final

| Fase | Sumber key | Cara |
|---|---|---|
| Testing (sekarang) | Key developer | `backend/.env` → `GEMINI_API_KEY=...` (atau `MOCK_AI=true`) |
| Testing UI | Key developer di Settings | Diisi manual, tersimpan terenkripsi |
| Final (rilis) | Key user | User isi di Settings; **tidak ada key di installer** |

Aturan rilis:
- Build `npm run build` **gagal** bila terdeteksi string key (regex `AIza...`, `sk-...`) di bundle.
- `.env` tidak pernah di-commit dan tidak ikut `electron-builder` `files`.

---

## 7. Fallback tanpa key

| Fitur | Tanpa key |
|---|---|
| Trim/split/speed/filter/efek/audio/teks | ✅ jalan (FFmpeg lokal) |
| Tracking (MediaPipe) | ✅ jalan (on-device) |
| Perintah AI rule-based ("potong 5 detik pertama") | ✅ jalan (±15 perintah lokal) |
| Perintah AI bebas / bahasa natural kompleks | ❌ butuh key |
| Auto-subtitle, scene detect, thumbnail AI | ❌ butuh key |

---

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| User salah tempel key orang lain | Masking + "Tes Koneksi" |
| Key bocor via log/crash | Redaction pola key, telemetri off default |
| Key bocor via ZIP proyek (.keylox) | Key **tidak** disimpan di file proyek, hanya di userData |
| Proxy dipakai orang lain | Rate limit per device + per hash(key) |
| Prompt injection dari media | Validasi output AI (Zod) sebelum diterapkan (lihat 06-security) |

---

## 9. Rencana Implementasi (setelah Stage 7 & 8 selesai)

1. `main.js`: tambah `safeStorage` store + IPC `settings:*` + `ai:invoke` (panggilan provider di main).
2. `preload.js`: expose 5 channel baru.
3. `SettingsModal.tsx`: UI provider/key/model/test-connection/mode.
4. `PromptBar.tsx`: hapus `fetch` key langsung dari renderer → pakai `window.api.aiInvoke`.
5. `backend`: `gemini.js` terima `X-Provider-Key`; `ai.js` teruskan; redaction di logger.
6. `api-contract.md`: sinkronkan §5 di atas.
7. Test: unit (store key, redaction), integrasi (mock provider), manual (tes koneksi gagal/sukses).

---

## 10. Onboarding "Dapatkan API Key Gratis" (keputusan: ops-3)

Karena banyak calon user tidak punya API key, app WAJIB memandu mereka membuat key
gratis milik sendiri (bukan memakai key developer, bukan login Google).

Alur onboarding (muncul saat pertama buka bila `hasSecret=false`):
1. Layar/panel kecil: "Aktifkan AI di Keylox" + penjelasan singkat (AI butuh key milikmu;
   gratis; tanpa kartu kredit).
2. Tombol **"Dapatkan API Key Gratis"** → membuka Google AI Studio di browser default.
3. Langkah bergambar (3 langkah): (a) login akun Google, (b) klik "Create API key",
   (c) salin key.
4. Field tempel key → tombol **Tes Koneksi** → Simpan.
5. Jalan pintas: tombol **"Lewati untuk sekarang"** → app jalan tanpa fitur AI (editing +
   tracking + ±15 perintah rule-based tetap bisa).

Kebutuhan teknis:
- Buka URL eksternal di browser butuh IPC baru **`shell:openExternal`** (validasi: hanya
  `https:` + allowlist host, lihat ADR-02 di §11) → perubahan kontrak kecil (v1.2), milik
  arsitek, lalu diimplementasikan Stage 4.
- Tidak ada perubahan backend, tidak ada akun, tidak ada data keluar.

---

## 11. ADR-02 — TANPA Login Google / Firebase AI Logic (keputusan resmi)

**Status:** Diterima (user, opsi 3). **Tanggal:** 2026-10-19.

**Konteks:** diusulkan "Login Google" agar user tanpa API key bisa memakai free tier
Gemini milik developer lewat Firebase AI Logic.

**Keputusan:** **TIDAK** diimplementasikan. Jalur AI tetap **BYOK** (key milik user) +
panduan "dapat key gratis" (§10).

**Alasan (fakta yang diverifikasi):**
1. Rate limit Gemini dihitung **per project, bukan per user** → free tier (±250 RPD
   `gemini-2.5-flash`) dibagi seluruh user → cepat habis (±10–25 user aktif).
2. Google menyatakan free tier bersifat *best effort, unstable, not likely to persist*
   (pernah dipotong 250 → 20 RPD tanpa pemberitahuan).
3. Free tier: konten "used to improve our products" → privasi video pribadi user bermasalah.
4. Firebase App Check diwajibkan untuk Firebase AI Logic mulai 2 Nov 2026 → rumit di
   desktop (Electron), menambah jalur gagal.
5. Saat kuota habis, biaya AI berpindah ke developer (plan Blaze) → bertentangan dengan
   prinsip produk "gratis, tanpa monetisasi".

**Konsekuensi:** tiap user memakai kuota free tier-nya SENDIRI (lebih adil, nol biaya
developer, nol risiko ToS). Bila suatu hari ingin mode tamu, itu keputusan produk baru
(spec + arsitektur baru), bukan bagian dari rilis ini.

---

## 12. ADR-03 — Multi-Provider: SEMUA AI yang bisa ngedit wajib didukung

**Status:** Diterima (user: "pokoknya semua AI yang bisa ngedit di sini harus bisa").
**Tanggal:** 2026-10-19. **Prioritas:** wajib.

**Keputusan:** Keylox tidak mengunci 1 provider. User bisa memilih provider AI mana pun
(dan memakai key-nya sendiri). Dua lapis:

**Lapis 1 — Adapter native** (protocol sendiri, paling andal untuk EditPlan JSON):

| Provider | Host | Key | Endpoint |
|---|---|---|---|
| `gemini` | `generativelanguage.googleapis.com` | `AIza…` / `AQ.…` | `POST /v1beta/models/{m}:generateContent` |
| `openai` | `api.openai.com` | `sk-…` | `POST /v1/chat/completions` |
| `anthropic` | `api.anthropic.com` | `sk-ant-…` | `POST /v1/messages` (native, Structured Outputs) |

**Lapis 2 — OpenAI-compatible registry** (protokol sama, tinggal host+key+model):

| Provider | Host | Key | Catatan |
|---|---|---|---|
| `openrouter` | `openrouter.ai` | `sk-or-…` | **500+ model** (Claude/GPT/Gemini/Llama/DeepSeek/Mistral) + model `:free` |
| `groq` | `api.groq.com` | `gsk_…` | Cepat, ada tier gratis |
| `deepseek` | `api.deepseek.com` | `sk-…` | Murah, kuat |
| `mistral` | `api.mistral.ai` | `…` | Ada model gratis |
| `xai` (Grok) | `api.x.ai` | `xai-…` | |
| `together` | `api.together.xyz` | `…` | Banyak open-weight |
| `cerebras` | `api.cerebras.ai` | `csk-…` | Inferensi cepat |
| `ollama` / `lmstudio` | `localhost` | *(kosong)* | **Lokal, offline, gratis** |

**Lapis 3 — Custom (openai-compatible):** user boleh isi host sendiri → **opt-in eksplisit**
dengan peringatan; tetap tolak rentang privat/metadata kecuali `localhost` (anti-SSRF).

**Aturan teknis:**
1. **EditPlan tetap divalidasi Zod** (`.strict()`) — provider-agnostik, jadi aman lintas
   provider. Kalau model tidak menghasilkan JSON sah → retry ≤2× (sudah ada), lalu error
   yang jelas.
2. **Registry terpusat** (`providerRegistry`): `{ id, label, adapter: native|openai-compat,
   host, keyPattern, modelPatterns, defaultModel, docsUrl, free? }`. Menambah provider baru =
   tambah 1 baris data, **bukan** kode baru.
3. **UI Settings:** dropdown provider (grup: "Gratis", "Populer", "Lokal"), field key,
   model, tombol Tes Koneksi, tombol "Dapatkan key" (docsUrl).
4. **Frontend rules:** untuk EditPlan pakai **satu** jalur generik; header provider
   (`X-Provider`) diteruskan ke backend saat mode PROXY.
5. **Fallback ramah:** kalau provider tidak mendukung multimodal/audio (mis. transkripsi),
   JobType itu ditandai tidak tersedia untuk provider tsb → UI menonaktifkan, bukan error.

**Konsekuensi kontrak:** `api-contract.md` → **v1.2** (daftar provider + `X-Provider` enum +
kode error). `01-architecture.md` → modul `providerRegistry` diperluas.

**Urutan kerja:** Stage 2 (arsitek: kontrak v1.2) → Stage 4 ∥ 5 (implement registry+adapter+UI)
→ Stage 7/8 (test + scan) → lanjut.

---

## 13. ADR-04 — Pemeriksaan Kompatibilitas AI + Transparansi Token

**Status:** Diterima (user). **Tanggal:** 2026-10-19. **Prioritas:** wajib.
**Prinsip:** key milik user, TAPI app wajib **memeriksa** apakah AI-nya sanggup mengerjakan
fitur Keylox, dan **menampilkan pemakaian token dengan jelas**.

### 13.1 Pemeriksaan kompatibilitas (capability check)

Saat user menyimpan key / memilih provider+model, app menjalankan **Verifikasi Kemampuan**
(3 tingkat):

| Tingkat | Yang diuji | Hasil |
|---|---|---|
| 1. Koneksi | ping ke provider | `ok` / `ERR_PROVIDER_KEY_INVALID` / `ERR_PROVIDER_UNREACHABLE` |
| 2. Model ada | model valid untuk provider itu | daftar model (bila API menyediakan) |
| 3. **Uji nyata EditPlan** | minta JSON EditPlan mini (`{"ops":[]}`) + **validasi Zod** | `jsonMode: ok` — bukti model benar-benar bisa dipakai app |

**Matriks kemampuan per jobType** (dipakai untuk menyalakan/mematikan fitur di UI):

| JobType | Kemampuan wajib |
|---|---|
| `parse_command`, `chat`, `refine` | **JSON terstruktur** |
| `scene_detect`, `highlight`, `vision_color`, `thumbnail`, `ocr` | **vision (gambar)** |
| `transcribe` | **audio input** |
| `tts` | **audio output** |
| `translate` | teks |

**Status yang ditampilkan ke user** (badge di Settings + di fitur terkait):
- ✅ **Didukung** — lolos semua uji untuk kemampuan yang dibutuhkan.
- ⚠️ **Terbatas** — bisa chat/EditPlan, tapi mis. tanpa vision → fitur thumbnail/auto-scene
  **dinonaktifkan** dengan tooltip alasan (bukan error mendadak).
- ❌ **Tidak kompatibel** — gagal uji EditPlan JSON → user diberi tahu, ditawari pilih
  provider/model lain.

Aturan: **kegagalan kemampuan menonaktifkan fitur, bukan membuat app crash.** Registry
mendeklarasikan kemampuan statis per model; uji nyata (tingkat 3) memverifikasi & boleh
menimpa deklarasi.

### 13.2 Transparansi token & biaya

Wajib terlihat oleh user, di 3 tempat:

1. **Per permintaan** — tiap aksi AI menampilkan: `tokens in/out`, `latency`, `cacheHit`,
   provider/model. (Sudah dikembalikan `ai:invoke` → tinggal ditampilkan.)
2. **Panel Penggunaan (Usage)** — total hari ini: jumlah request, token in/out, **estimasi
   biaya** (pakai tabel harga per model), dan sisa kuota gratis bila diketahui (mis.
   Gemini free tier, OpenRouter `:free` 50/hari).
3. **Ringkasan per provider** — biar user tahu provider mana yang paling boros/murah.

**Tabel harga** disimpan di registry (`pricePer1M: {in, out}`); model tanpa data harga →
tampilkan token saja + label "harga belum diketahui" (jangan mengarang angka).

**Privasi & penyimpanan:** riwayat penggunaan disimpan **lokal** (SQLite, tabel
`ai_usage_log`), tidak dikirim ke mana pun. Mode PROXY: backend hanya mengembalikan angka
agregat milik device itu (`/ai/usage`).

### 13.3 Tambahan kontrak (bagian dari v1.2)

| Item | Perubahan |
|---|---|
| `settings:testProvider` | hasil diperluas → `{ ok, latencyMs, capabilities: {json, vision, audio, tools}, verdict: 'ok'\|'limited'\|'incompatible', model? }` |
| `ai:invoke` | sudah mengembalikan `tokens {in,out}` + `cacheHit` → **wajib ditampilkan** di UI |
| **`usage:get`** (IPC baru) | → `{ today: {requests, tokensIn, tokensOut, estCostUsd}, byProvider: [...], byModel: [...] }` |
| Tabel SQLite baru | `ai_usage_log` (device, provider, model, jobType, tokensIn, tokensOut, cacheHit, estCostUsd, created_at) + index waktu |
| Backend | `/ai/usage` diperluas: breakdown per provider/model + estimasi biaya |

**Urutan kerja:** masuk ke rework v1.2 yang sama dengan ADR-03 (arsitek → implement → test).

---

## 14. ADR-07 — Default Provider = OpenRouter (bukan Gemini)

**Status:** Diterima (user: "yg gemini gajadi gw pake ai lain"). **Tanggal:** 2026-10-19.

**Keputusan:** Provider default diubah dari `gemini` → **`openrouter`**.

**Alasan:**
1. Satu key `sk-or-…` = akses 500+ model (Claude, GPT, Gemini, Llama, DeepSeek, Mistral, …)
   → langsung memenuhi "semua AI yang bisa ngedit" tanpa hardcode 1 vendor.
2. Ada tier gratis (`:free`, ~50 req/hari) → onboarding "key gratis" tetap jalan **tanpa login Google**
   (yang sebelumnya kita tolak karena kuota 250→20 RPD & konten dipakai training).
3. Format OpenAI-compatible → adapter paling sederhana, sudah didukung.
4. Gemini tetap **selectable** (user bisa pilih), tapi **bukan default**.

**Perubahan teknis:**
- `DEFAULT_PROVIDER = 'openrouter'` di `src/shared/providerRegistry.js`, `backend/src/services/providerRegistry.js`.
- `backend/src/config.js`: tambah `openrouterApiKey` + `defaultProviderApiKey` (fallback: env → `GEMINI_API_KEY` legacy).
- `backend/.env.example`: tambah `OPENROUTER_API_KEY`.
- Onboarding "Dapatkan API Key Gratis" → `https://openrouter.ai/keys` (freeTier true).

**Catatan privasi:** OpenRouter = `leavesDevice:true`, `freeTierTraining: ⚠️ (tergantung model upstream)`.
User yang mau 100% privat tetap bisa pilih **Ollama/LM Studio** (lokal).
