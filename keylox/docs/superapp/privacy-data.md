# PRIVASI & DATA PRIBADI — Keylox Desktop

> Dokumen pelengkap (di luar penomoran pipeline 00–08). Mengikat bersama
> `byok-api-key.md` (§12 ADR-03 multi-provider, §13 ADR-04 kemampuan+token),
> `01-architecture.md`, `api-contract.md`, dan `04-schema.sql`.
> **Prinsip inti:** data user = milik user. Aplikasi **lokal-dulu**, **nol telemetri**,
> dan **transparan** soal apa yang keluar dari perangkat.

---

## 1. Status terverifikasi dari kode (bukan klaim)

Diperiksa langsung pada 2026-10-19 di `keylox_desktop\` + `keylox\docs\superapp\04-schema.sql`.

| Aspek | Fakta | Bukti |
|---|---|---|
| Tabel telemetri/analitik/crash | **TIDAK ADA.** Dari ±58 tabel hanya ada `ai_usage_records` (token lokal) & `audit_logs` (tanpa PII) | `04-schema.sql` |
| Isi `audit_logs` | `entity_type`, `entity_id`, `action`, `metadata_json` — *"diagnostik & dukungan (tanpa PII)"* | `04-schema.sql` (3.4) |
| Isi `ai_usage_records` | model, `input/output_tokens`, `latency_ms`, `cache_hit` — **tidak ada isi prompt** | `04-schema.sql` (3.3) |
| Penyimpanan API key | `safeStorage` (enkripsi OS) → `userData/secure/settings.enc`, mode `0o600` | `src/main/secretStore.js:92,149` |
| Fallback plaintext | **TIDAK ADA.** Bila enkripsi OS tak tersedia → **throw** (`ERR_*`), tidak menyimpan sembarangan | `src/main/secretStore.js:108–158` |
| Cegah key di setting biasa | Menolak dengan `ERR_VALIDATION_SECRET_IN_PLAIN_SETTING` | `src/main/secretStore.js:238,262` |
| Redaksi log | 2 lapis: `redact.paths` (header key/Authorization/device/token) + `hooks.logMethod` pola (`AIza`, `sk-`, `AQ.`, `?key=`) | `backend/src/logger.js:22–56` |
| Isi body/prompt di log | **Tidak di-log.** Hanya `method/url/rid`, `ip` (warning), `deviceId`, `keyFp` | `backend/src/index.js:95,68`; `logger.js` |
| Key di binary | **Tidak ada** (BYOK). Key developer hanya env var untuk tes lokal | `byok-api-key.md` §1 |
| Panggilan jaringan keluar | Hanya host provider AI + backend (opsional) + localhost. **Tidak ada** analytics/sendBeacon/pihak ketiga | `SettingsModal.tsx:33-34`, `providerPolicy.js:24,36` |

**Kesimpulan §1:** fondasinya sudah benar — lokal-dulu, tanpa telemetri, key terenkripsi,
log teredaksi, tidak ada data keluar selain ke provider AI yang **user sendiri pilih**.

---

## 2. Ke mana data pergi (tergantung mode)

| Mode | Key disimpan | Isi prompt/frame dikirim ke | Backend kita lihat isi? |
|---|---|---|---|
| **DIRECT** (default) | Lokal (`settings.enc`) | Langsung ke provider (Gemini/OpenAI/Claude/dll) | **Tidak** |
| **PROXY** (opsional) | Lokal | Lewat backend kita → provider | **Ya** (lihat §3.1) |
| **LOKAL** (Ollama/LM Studio) | Kosong | Tidak keluar perangkat | **Tidak** |

---

## 3. Celah nyata yang WAJIB ditutup (temuan)

### 3.1 ⚠️ Cache backend menyimpan isi jawaban AI hingga 30 hari (RAM)
`backend/src/services/cache.js:6-11` memakai `LRUCache` dengan `ttl` =
`config.cacheTtlMs` = **2.592.000.000 ms (30 hari)** (`backend/src/config.js:53`), `max`
5.000 entri, dan `updateAgeOnGet: true` → entri populer **efektif tidak pernah kedaluwarsa**.
Cache ini menyimpan **nilai keluaran AI** (bisa turunan frame/prompt user).

- Cache bersifat **in-memory** (tidak ke disk) → bagus, tapi server operator tetap memegang
  isi konten user selama RAM hidup.
- **Keputusan:** backend publik **DILARANG** memakai TTL panjang untuk jobType yang membawa
  konten. Aturan baru:
  - `CACHE_TTL_MS` produksi ≤ **5 menit** (bukan 30 hari), atau
  - **nonaktifkan cache** untuk jobType berkonten (`parse_command`, `chat`, `refine`,
    `vision_*`, `transcribe`) di mode PROXY; cache hanya untuk metadata/statis.
  - `updateAgeOnGet` → **false** untuk PROXY publik.
- Mode DIRECT tidak terpengaruh (tidak ada backend kita).

### 3.2 ⚠️ Free tier = konten boleh dipakai latihan
Gemini free tier & OpenRouter `:free`: ketentuan provider menyatakan konten dapat dipakai
untuk memperbaiki produk. **Bukan lingkungan privat.** UI wajib memberi tahu user.

### 3.3 ⚠️ Frame/media untuk job vision & audio
Job seperti thumbnail/scene-detect/warna kirim **frame gambar**; transkripsi kirim **audio**.
Ini data paling sensitif. Butuh **persetujuan eksplisit** sebelum pengiriman pertama.

### 3.4 🔸 Data yang tersimpan server (PROXY) selain cache
Kontrak wajib menegaskan: backend **tidak** menulis prompt/response ke disk, **tidak** ada
log isi, **tidak** ada retensi di luar cache (§3.1). Harus dibuktikan di Stage 8.

---

## 4. Kontrol yang diberikan ke user (UI)

1. **Panel "Data & Privasi"** di Settings: daftar jujur — apa yang keluar per provider,
   status (🔒 Lokal / ⚠️ Terkirim ke provider / 🟡 Free tier = boleh dipakai latihan).
2. **Mode Privat (lokal)**: satu toggle → hanya mengizinkan provider yang **tidak keluar
   perangkat** (Ollama/LM Studio); fitur cloud dinonaktifkan dengan penjelasan.
3. **Konfirmasi sekali** sebelum job pertama yang mengirim frame/audio ke cloud
   (dengan opsi "selalu izinkan untuk provider ini").
4. **Badge privasi per provider** di dropdown (sejajar dengan badge kemampuan ADR-04).
5. **Hapus data lokal** (1 klik / dialog konfirmasi): DB proyek, cache renderer, riwayat
   `ai_usage_records`, `audit_logs`, dan `settings.enc` (key). Tidak ada "data di cloud"
   yang perlu dihapus karena **tidak ada** yang disimpan.
6. **Ekspor data lokal** (opsional): user bisa membawa keluar datanya (JSON).
7. **Tanpa akun, tanpa login** (ADR-02) → data pribadi minimal sejak awal.

---

## 5. ADR-05 — Privasi-by-design (WAJIB)

**Status:** Diterima (user: *"ini kalo beneran di pake sama user data ya harus pribadi yaa"*).
**Tanggal:** 2026-10-19. **Prioritas:** wajib (gate rilis publik).

**Keputusan yang mengikat:**

1. **Nol telemetri & nol crash-upload** secara default. Tidak ada analytics, tidak ada
   `sendBeacon`, tidak ada SDK pihak ketiga pengumpul data. (Bila suatu hari ditambah,
   harus **opt-in eksplisit** + dokumen baru — bukan bawaan.)
2. **Lokal-dulu**: proyek, media, DB, dan key **tinggal di perangkat**. Tidak ada sinkron
   awan pada rilis ini.
3. **Transparansi wajib**: setiap data yang keluar perangkat dapat dilihat user (§4.1–4.4),
   termasuk peringatan free tier (§3.2).
4. **Persetujuan eksplisit** untuk pengiriman pertama frame/audio ke cloud (§3.3).
5. **Kebijakan cache backend**: TTL pendek / nonaktif untuk konten di mode PROXY (§3.1).
6. **Log bebas rahasia & bebas PII** (sudah terpenuhi — dipertahankan sebagai gate CI:
   `secret-scan` + audit redaksi).
7. **Hak user**: hapus & ekspor data lokal (§4.5–4.6) tanpa perlu menghubungi siapa pun.

**Konsekuensi kontrak (`api-contract.md` → v1.2):**

| Item | Perubahan |
|---|---|
| `privacy:getMode` / `privacy:setMode` (IPC baru) | mode `standard` \| `local-only` |
| `privacy:confirmExternal` (IPC baru) | persetujuan kirim frame/audio (per provider) |
| `settings:testProvider` | hasil ditambah blok `privacy: { leavesDevice, freeTierTraining, providerRetention }` |
| `data:wipeLocal` / `data:exportLocal` (IPC baru) | hak hapus & ekspor data lokal |
| Backend | `CACHE_TTL_MS` produksi ≤ 5 menit atau cache mati untuk jobType berkonten; `updateAgeOnGet=false` |
| Backend | kontrak menegaskan: **tidak ada** penulisan prompt/response ke disk |

**Urutan kerja:** digabung ke rework v1.2 (arsitek → implement → test → re-scan).

---

## 6. Batasan jujur

- Privasi **tidak bisa lebih baik dari provider yang dipilih user**. Kalau user memakai
  Gemini free tier, Google melihat kontennya. Keylox hanya bisa **transparan** + menyediakan
  opsi lokal (Ollama).
- Code signing & sandbox OS menambah proteksi, tapi **tidak** menghilangkan kebutuhan
  §3.1–§3.3.
- Belum ada pentest eksternal (tercatat di `06-security.md` sebagai backlog rilis).
