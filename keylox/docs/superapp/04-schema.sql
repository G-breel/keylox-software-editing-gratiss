-- =====================================================================================
--  KEYLOX — 04-schema.sql
--  STAGE 6 dari SUPERAPP_PIPELINE: DATABASE (SQLite / better-sqlite3)
-- -------------------------------------------------------------------------------------
--  Sumber kebenaran : 00-spec.md v2.2 (§11 Entitas Inti, §11.6 Aturan Integritas)
--                     01-architecture.md (boundary modul, storage, tracking = satu sumber kebenaran)
--                     02-design.md (flow import/relink, tracking editor, EditPlan preview)
--                     api-contract.md v1.2 §4 (storage contract .keylox, manifest, daftar tabel)
--  Target           : aplikasi desktop Electron (Windows primary), main process (Node.js)
--  Engine           : SQLite 3.4x via better-sqlite3 (sinkron, single-writer, WAL)
--  Versi skema      : 1 (initial migration, idempotent) + rework v1.2 (aditif, idempoten)
--  Bahasa           : komentar Indonesia
-- -------------------------------------------------------------------------------------
--  CARA PAKAI (ringkas)
--    const db = new Database(dbPath);                     // app.db (global) atau project.db (di .keylox)
--    db.pragma('foreign_keys = ON');                      // PER-KONEKSI — wajib setiap connect
--    db.exec(fs.readFileSync('04-schema.sql', 'utf8'));    // idempotent, aman dijalankan berkali-kali
--
--  SIFAT FILE
--    1) IDEMPOTENT — semua objek memakai `CREATE ... IF NOT EXISTS`; seed memakai `INSERT OR IGNORE`.
--       Dijalankan ulang berkali-kali tidak error dan tidak mengubah data pengguna.
--    2) SATU SKEMA, DUA PERAN — file ini dipakai apa adanya untuk dua database:
--         a. `app.db`  (global, di userData): users, settings, katalog, cache AI, daftar projects.
--         b. `project.db` (di dalam arsip `.keylox`, api-contract §4.1): satu proyek + katalog yang
--            direferensikannya. Karena skemanya identik, impor/ekspor `.keylox` TIDAK butuh translasi
--            skema — cukup copy baris + `foreign_key_check`.
--    3) FOREIGN KEY bersifat PER-KONEKSI di SQLite → wajib `PRAGMA foreign_keys = ON` di
--       `src/main/db/connection.ts` setiap kali membuat koneksi (termasuk koneksi worker thread).
--
--  KONVENSI
--    * ID       : TEXT (UUID v4/v7, di-generate aplikasi) — bukan INTEGER AUTOINCREMENT, agar
--                 dapat digabung antar-database (.keylox impor) tanpa tabrakan.
--    * Waktu    : INTEGER = epoch milidetik (internal SQLite). Konversi ISO 8601 hanya di batas
--                 IPC/HTTP (api-contract §1.1).
--    * Boolean  : INTEGER 0/1 + CHECK (… IN (0,1)).
--    * Enum     : TEXT + CHECK — bukan angka, agar mudah dibaca di log & aman saat menambah nilai.
--    * JSON     : TEXT + CHECK (json_valid(…)) — untuk params uniform shader, curves, ops EditPlan.
--    * Nama     : snake_case, plural untuk tabel, `idx_<tabel>_<kolom>` untuk index.
--
--  CATATAN REWORK v1.2 (Okt 2026) — perubahan MINIMAL & IDEMPOTEN
--    * `ai_usage_records` + kolom `provider TEXT` dan `est_cost_usd REAL`
--      (ADR-03/ADR-04; api-contract §2.16). Keduanya NULL-able → baris lama tetap valid.
--    * Index baru `idx_ai_usage_records_provider` (query panel Usage per provider).
--    * View `v_ai_usage_daily` diperluas: `provider` + `est_cost_usd` (SUM/ROUND).
--    * Preferensi privasi (ADR-05) TIDAK membuat tabel baru: memakai `user_settings`
--      key-value yang sudah ada (`privacy.mode`, `privacy.confirm.<provider>`).
--    * `undo_records.group_id` (1 perintah AI = 1 grup undo, REJ-01) SUDAH ADA sejak v1 —
--      tidak ada perubahan skema untuk undo; perbaikan ada di renderer (Stage 4/5).
--    * SEMUA perubahan bersifat ADDITIF (ADD COLUMN / CREATE ... IF NOT EXISTS) — tidak ada
--      tabel/kolom lama yang dihapus/di-rename. Lihat BAGIAN 18 untuk pola migrasi idempoten.
-- =====================================================================================

/* =====================================================================================
   BAGIAN 0 — ERD RINGKAS (markdown, untuk dibaca manusia/dokumen)
   =====================================================================================

   ERD INTI (relasi wajib benar; arah panah = "memiliki")

   users ──1:N── projects ──1:N── tracks ──1:N── clips
     │              │               │              ├──1:1── clip_transforms   (pos/scale/rot/crop/opacity)
     │              │               │              ├──1:1── color_grades      (M4)
     │              │               │              ├──1:N── effect_instances  (M5, order_index)
     │              │               │              ├──1:N── masks             (M6, K-03/K-04)
     │              │               │              ├──1:1── chroma_keys       (K-05)
     │              │               │              ├──1:1── blends            (K-01/K-02)
     │              │               │              ├──N:1── media_assets ──1:1── asset_insights
     │              │               │              │                          └──1:N── embedding_vectors
     │              │               │              ├──1:N── tracking_targets ──1:N── tracking_keyframes
     │              │               │              │                          └──1:N── tracking_bindings
     │              │               │              ├──N:1── clip_groups       (grup klip, #28/#29)
     │              │               │              └──N:N── transitions       (via clip_a_id / clip_b_id)
     │              │               ├──1:N── text_overlays ──N:1── text_styles
     │              │               ├──1:N── caption_tracks ──1:N── caption_segments
     │              │               ├──1:N── media_assets / media_folders / media_groups
     │              │               ├──1:N── ai_conversations ──1:N── ai_messages
     │              │               ├──1:N── ai_commands ──1:1── edit_plans
     │              │               ├──1:N── ai_jobs / index_jobs / export_jobs / tracking_sessions
     │              │               ├──1:N── undo_records / project_snapshots / thumbnail_renders
     │              │               └──1:N── keyframes (polimorfik: owner_type + owner_id)
     │              └──1:N── prompt_templates
     └──1:N── ai_usage_records

   ERD KATALOG GLOBAL (tidak dimiliki proyek, hanya direferensikan ID-nya)
     templates ──1:N── template_slots
     edit_recipes · prompt_templates · export_presets · lut_assets · effect_presets · music_assets
     ai_result_cache (lintas proyek) · ai_usage_records · audit_logs · user_settings

   ALUR TRACKING (satu sumber kebenaran, 01-architecture §4.2)
     clips → tracking_sessions → tracking_targets → tracking_keyframes
                                       │
                                       └── tracking_bindings → konsumen: text / sticker / effect /
                                           mask / cutout / camera / overlay / particle
     Konsumen TIDAK menyimpan data gerak sendiri; mereka membaca tracking_keyframes lewat binding.

   -------------------------------------------------------------------------------------
   0.1 KEPUTUSAN NORMALISASI (yang sengaja digabung / dipisah + alasan)
   -------------------------------------------------------------------------------------
   DIGABUNG (satu tabel untuk dua hal yang mirip):
    1. `asset_insights` = MediaIndex + AssetInsight. Spec §11.3 menyebut dua nama untuk data yang
       sama (durasi, scene, subjek, label, OCR, kualitas, embedding). Satu tabel → tidak ada duplikasi
       dan tidak ada join identitas.
    2. `text_overlays` melayani teks DAN sticker/gambar (D-04). Payload visualnya beda (konten teks vs
       media_asset_id) tetapi jadwal, gaya, z_index, animasi, dan binding tracking-nya identik.
       Dipisah akan menduplikasi seluruh kolom penjadwalan. Dijaga CHECK: salah satu dari
       `content` atau `media_asset_id` wajib terisi.
    3. `tracks` menampung semua tipe track (video/overlay/text/audio/audio_extra) sebagai kolom
       discriminator `type`, bukan 5 tabel per tipe: struktur & operasi (mute/hide/lock/volume)
       identik; 5 tabel akan memaksa UNION di setiap query timeline.
    4. `clips` melayani klip video & gambar (media statis di timeline) — perbedaan hanya durasi default,
       dan `src_in_ms/src_out_ms` tetap bermakna. Tabel terpisah = duplikasi 20 kolom.
    5. `user_settings` menyimpan seluruh preferensi non-rahasia sebagai baris key/value (bukan 40 kolom
       di `users`). Rahasia (backendBaseUrl token, userToken, deviceId, **[v1.2] API key provider per-provider**)
       TIDAK di sini — di OS keychain via safeStorage (01-architecture §5.1, api-contract §6.1).
       `[v1.2]` Preferensi **privasi** (bukan rahasia) tetap di tabel ini: `privacy.mode`,
       `privacy.confirm.<provider>` (ADR-05, api-contract §2.15).
    6. `clip_transforms` + `color_grades` + `chroma_keys` + `blends` = 1:1 dengan clips TETAPI sengaja
       DIPISAH dari `clips`: (a) baris hanya dibuat saat fitur dipakai (klip netral = tanpa 5 baris
       kosong); (b) boundary modul M3/M4/M6 terpisah (01-architecture §3); (c) SQLite menulis ulang
       SELURUH baris saat UPDATE — memisahkan kolom "panas" (transform diubah tiap frame drag) dari
       baris `clips` yang lebar mengurangi write amplification dan lock contention.
    7. `keyframes` satu tabel polimorfik (`owner_type` + `owner_id`) untuk clip/effect/text/mask/audio:
       T-20 (copy/paste keyframe lintas properti) dan lane keyframe di timeline butuh satu query
       gabungan. Trade-off: SQLite tidak mendukung FK polimorfik → integritas dijaga aplikasi +
       view `v_orphan_keyframes` untuk deteksi + kolom `project_id` (FK nyata) agar cascade proyek tetap jalan.

   DIPISAH (satu entitas → beberapa tabel, karena lifecycle/tanggung jawab berbeda):
    8. Empat jenis pekerjaan asinkron TIDAK digabung:
         `export_jobs` (FFmpeg lokal), `ai_jobs` (cloud via DIRECT/PROXY, multi-provider — api-contract §6.4),
        `index_jobs` (indeks aset lokal),
         `tracking_sessions` (M14, on-device). Kolom progres, status, dan pemiliknya berbeda; katalog
         error pun berbeda (ERR_EXPORT_* vs ERR_AI_* vs ERR_TRACKING_*). Digabung = banyak kolom NULL
         + status yang tidak bermakna. Untuk UI "semua job aktif" disediakan view `v_active_jobs`.
    9. `tracking_targets` + `tracking_keyframes` + `tracking_bindings` TIDAK digabung ke `asset_insights`
       meski sama-sama hasil AI/deteksi: insight = turunan aset yang boleh dihapus/dibangun ulang
       (spec §11.6 #5), sedangkan tracking = data per-klip yang dikoreksi manusia (TR-14), di-cache
       (D-13), dan diinvalidasi saat klip berubah (TR-15). Lifecycle berbeda → tabel berbeda.
       `tracking_bindings` ada karena §11.6 #10 mewajibkan konsumen membaca transform lewat binding.
   10. `media_groups` ←N:N→ `media_assets` butuh tabel jembatan `media_group_items` (spec §11.3 hanya
       menyebut relasi N—N tanpa tabelnya). Tanpa jembatan, keanggotaan grup harus di-JSON-kan di
       `media_groups` → tidak bisa di-join/di-index dan melanggar 1NF.
   11. `caption_tracks`/`caption_segments` dipisah dari `text_overlays`: subtitle punya hierarki
       track → segmen → word timings (S-08 karaoke), lifecycle ASR sendiri, dan terjemahan (S-14).
       Yang DIBAGIKAN adalah `text_styles` (FK dari kedua tabel) → tidak ada duplikasi gaya.
   12. `audio_clips` dipisah dari `clips`: audio punya fade/ducking/pitch/voiceover, tidak punya
       transform/warna/mask; dan dapat hidup tanpa klip video (detach audio, #27).
   13. `masks` N:1 clips (bukan 1:1) karena K-03 (linear/radial) dan K-04 (path/brush) dapat berlapis.
       `chroma_keys` dan `blends` tetap 1:1 (UNIQUE clip_id) sesuai semantik spec.
   14. `transitions` berdiri sendiri dengan FK ke clip_a & clip_b — transisi adalah properti SAMBUNGAN,
       bukan milik satu klip. FK ke satu clip akan menghilangkan separuh informasinya.
   15. `undo_records.payload_json` + `inverse_payload_json` disimpan utuh (bukan kolom per operasi):
       undo harus merekam operasi apa pun dari 251 perintah AI; skema kolumnar akan meledak.
       `group_id` = 1 perintah AI = 1 grup undo (§11.6 #7).
   16. Katalog (`templates`, `edit_recipes`, `lut_assets`, `effect_presets`, `export_presets`,
       `music_assets`) adalah GLOBAL, bukan per proyek: LUT/template/LUT 33³ dan resep bawaan tidak
       boleh diduplikasi di setiap proyek. Proyek hanya menyimpan ID referensi (+ `source` &
       `catalog_version` agar pembaruan katalog dari CDN dapat dilacak).
   17. `clip_groups` adalah tabel kecil (bukan `group_id TEXT` bebas di clips): grup harus punya nama,
       status kunci, dan cascade saat proyek dihapus.
   18. `effect_presets` ditambahkan walau tidak disebut di §11 — fitur #114/E-16 "simpan kombinasi efek
       sebagai preset" butuh tempat penyimpanan; efeknya sendiri tetap tersimpan sebagai
       `effect_instances` (bukan array JSON di satu kolom).
   19. `media_relink_history` ditambahkan untuk prinsip `mediaMode` (lihat §0.2): pemetaan path lama → baru
       harus tercatat agar relink otomatis dapat diusulkan lagi saat folder dipindah lagi.
   20. `projects.cover_uri` = denormalisasi SENGAJA dari `thumbnail_renders` agar daftar proyek (P-03,
       lazy list) tidak perlu join/agregasi. Nilainya pointer cache; sumber lengkap tetap
       `thumbnail_renders`. Alasan yang sama untuk `projects.duration_ms`,
       `media_folders.media_count`, `media_groups.asset_count`, `ai_conversations.turn_count`,
       `templates.slot_count` — semuanya dijaga TRIGGER (bagian 14) supaya tidak pernah drift.
   21. TIDAK ADA tabel domain yang meniru entitas yang dihapus di v2.0 (`Subscription`, `AdSession`,
       `WatermarkConfig`, `CreditLedger`, kolom `is_premium`/`pro_status`/`entitlement`) — §11.6 #8.
       `users.ai_daily_*` ada murni untuk perlindungan penyalahgunaan & kontrol biaya, bukan paywall.

   -------------------------------------------------------------------------------------
   0.2 PRINSIP `mediaMode: reference | bundled` + RELINK
   -------------------------------------------------------------------------------------
   `mediaMode` hidup di dua tempat dan keduanya wajib sinkron:
     * `manifest.json` di dalam arsip `.keylox` (api-contract §4.2) → kontrak ekspor/impor.
     * `projects.media_mode` di database → dipakai saat runtime & saat memutuskan relink.
   Aturan data:
     * `reference` (default): `media_assets.uri` = path absolut/relatif file asli di disk pengguna.
       Tidak ada salinan. `is_bundled = 0`. Media hilang → `is_missing = 1` + `missing_since`.
     * `bundled`: media disalin ke `media/` di dalam arsip; `media_assets.is_bundled = 1` dan
       `bundled_rel_uri` (path relatif di dalam arsip) menjadi rujukan utama, `uri` tetap disimpan
       sebagai jejak asal. Ekspor/impor `.keylox` tetap membawa media walau mesin berbeda.
   Deteksi & dialog relink (02-design §2.1 error path, R-15):
     * Query penggerak dialog = view `v_missing_media` (partial index `idx_media_assets_missing`
       membuatnya murah walau ada 4.000+ aset).
     * Prosedur relink (satu transaksi, lihat bagian 20.3): set `uri` baru, `is_missing = 0`,
       `missing_since = NULL`, `checksum` (opsional diverifikasi), lalu catat ke `media_relink_history`.
     * Relink massal: relink satu aset → `media_relink_history` dipakai untuk mengusulkan pemetaan
       otomatis bagi aset hilang lain yang berasal dari folder yang sama (`old_uri` berawalan sama).
     * Media yang dilewati pengguna tetap `is_missing = 1`; klip tetap ada (non-destruktif), preview
       menampilkan placeholder, dan export diblokir dengan `ERR_MEDIA_MISSING` sampai di-relink.
   ===================================================================================== */

-- =====================================================================================
--  BAGIAN 1 — PRAGMA (jalankan SEBELUM tabel dibuat)
-- -------------------------------------------------------------------------------------
--  Catatan: `journal_mode`, `auto_vacuum`, dan `page_size` bersifat PERSISTEN per file DB dan hanya
--  efektif bila dijalankan pada database kosong. `foreign_keys`, `busy_timeout`, `cache_size`,
--  `temp_store`, `mmap_size` bersifat PER-KONEKSI → `connection.ts` wajib mengulangnya setiap connect.
--  `journal_mode = WAL` TIDAK boleh dijalankan di dalam transaksi.
-- =====================================================================================
PRAGMA foreign_keys = ON;              -- integritas relasional wajib aktif (per-koneksi)
PRAGMA journal_mode = WAL;             -- pembaca tidak memblokir penulis (main + worker thread)
PRAGMA synchronous = NORMAL;           -- aman dengan WAL; jauh lebih cepat dari FULL saat autosave ≤ 3 s
PRAGMA busy_timeout = 5000;            -- tunggu 5 s bila worker/indexing sedang menulis
PRAGMA temp_store = MEMORY;            -- tabel sementara (ORDER BY/GROUP BY besar) di RAM
PRAGMA cache_size = -32000;            -- ± 32 MB page cache (target memori 01-architecture §6.3)
PRAGMA mmap_size = 268435456;          -- 256 MB mmap read-only
PRAGMA auto_vacuum = INCREMENTAL;      -- batas disk: auto-evict cache ≤ 2 GB (NFR Penyimpanan)
PRAGMA user_version = 1;               -- versi skema; juga dicatat di tabel schema_migrations

-- =====================================================================================
--  BAGIAN 2 — METADATA & MIGRASI
-- =====================================================================================

-- 2.1 Riwayat migrasi. Setiap migrasi maju WAJIB mencatat satu baris di sini (§11.6 #9).
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      INTEGER NOT NULL PRIMARY KEY,          -- 1, 2, 3, ... (naik monoton)
  name         TEXT    NOT NULL,                      -- mis. 'initial_schema'
  checksum     TEXT,                                  -- sha256 isi file migrasi (deteksi file dimodifikasi)
  applied_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  app_version  TEXT,                                  -- versi app yang menjalankan migrasi
  duration_ms  INTEGER,
  success      INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0,1)),
  notes        TEXT
);

-- 2.2 Metadata aplikasi/database (key-value). Bukan preferensi pengguna (itu `user_settings`).
CREATE TABLE IF NOT EXISTS app_meta (
  key        TEXT NOT NULL PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- 2.3 Riwayat migrasi gagal (untuk ERR_DB_MIGRATION_FAILED + diagnostik Stage 8).
CREATE TABLE IF NOT EXISTS schema_migration_errors (
  error_id      TEXT    NOT NULL PRIMARY KEY,
  from_version  INTEGER NOT NULL,
  to_version    INTEGER NOT NULL,
  error_code    TEXT,                                  -- ERR_DB_MIGRATION_FAILED / ERR_DB_CORRUPT
  message       TEXT,
  stack         TEXT,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_schema_migration_errors_version
  ON schema_migration_errors(from_version, to_version, created_at DESC);

-- =====================================================================================
--  BAGIAN 3 — PROFIL, PENGATURAN & PENGGUNAAN AI (global, §11.1)
-- =====================================================================================

-- 3.1 users — guest mode adalah DEFAULT; akun sepenuhnya opsional. Tanpa entitas monetisasi.
--     `ai_daily_*` = perlindungan penyalahgunaan & kontrol biaya, bukan paywall.
--     `device_id` = jalur guest (header X-Device-Id, api-contract §6.2).
CREATE TABLE IF NOT EXISTS users (
  user_id                TEXT    NOT NULL PRIMARY KEY,
  device_id              TEXT,                                   -- UUID v4, dibuat sekali per instalasi
  display_name           TEXT    NOT NULL DEFAULT 'Guest',
  locale                 TEXT    NOT NULL DEFAULT 'id',
  timezone               TEXT,
  is_guest               INTEGER NOT NULL DEFAULT 1 CHECK (is_guest IN (0,1)),
  ai_consent_granted_at  INTEGER,                                -- NULL = belum consent → fitur cloud diantre
  ai_consent_scope       TEXT CHECK (ai_consent_scope IS NULL OR ai_consent_scope IN ('session','project','always')),
  ai_daily_requests      INTEGER NOT NULL DEFAULT 0 CHECK (ai_daily_requests >= 0),
  ai_daily_reset_at      INTEGER,
  telemetry_opt_in       INTEGER NOT NULL DEFAULT 0 CHECK (telemetry_opt_in IN (0,1)),
  created_at             INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  last_active_at         INTEGER
);

-- Satu device_id hanya boleh menunjuk satu profil (UNIQUE parsial: NULL boleh banyak).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device_id
  ON users(device_id) WHERE device_id IS NOT NULL;

-- 3.2 user_settings — preferensi non-rahasia. RAHASIA (token/key) tidak pernah masuk database.
--     [v1.2] Preferensi privasi (ADR-05) memakai tabel ini apa adanya, TANPA tabel baru:
--            key 'privacy.mode' = {"v":"standard"} | {"v":"local-only"} | {"v":"cloud"}
--            key 'privacy.confirm.<provider>' = {"v":true,"at":"<ISO>"}  (konfirmasi freeTierTraining)
--     Sebelum lapisan DB tersedia (GAP-01), main process menyimpan 'privacy.mode' di settings.enc dulu.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  key        TEXT NOT NULL,                                      -- 'ui.language', 'export.default_preset', 'privacy.mode', ...
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  PRIMARY KEY (user_id, key)
) WITHOUT ROWID;

-- 3.3 ai_usage_records — murni operasional (biaya & performa). Tanpa entitlement.
--     [v1.2] + provider (ADR-03) & est_cost_usd (ADR-04). est_cost_usd = ESTIMASI, bukan tagihan;
--            NULL bila harga provider tak diketahui (api-contract §2.16) → UI hanya tampilkan token.
CREATE TABLE IF NOT EXISTS ai_usage_records (
  usage_id      TEXT    NOT NULL PRIMARY KEY,
  user_id       TEXT REFERENCES users(user_id)    ON DELETE SET NULL,
  project_id    TEXT REFERENCES projects(project_id) ON DELETE SET NULL,
  command_id    TEXT,                                            -- diisi bila berasal dari perintah AI
  job_id        TEXT,                                            -- diisi bila berasal dari ai_jobs
  job_type      TEXT    NOT NULL,                                -- parse_command/chat/transcribe/scene_detect/... (`transcribe` kanonik; `asr` alias lama)
  provider      TEXT,                                            -- [v1.2] id registry (gemini/openai/anthropic/...); ADR-03
  model         TEXT,                                            -- mis. gemini-2.5-flash / gpt-4o-mini / claude-3-5-haiku-latest
  input_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  est_cost_usd  REAL    CHECK (est_cost_usd IS NULL OR est_cost_usd >= 0),  -- [v1.2] estimasi USD; NULL = harga tak diketahui
  latency_ms    INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  cache_hit     INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0,1)),
  queued_reason TEXT CHECK (queued_reason IS NULL OR queued_reason IN ('none','offline','limit')),
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- 3.3.1 Index ai_usage_records [v1.2]. `provider` untuk panel Usage per-provider; `created_at`
--       untuk agregasi harian (usage:get range). Semua IF NOT EXISTS → idempoten.
CREATE INDEX IF NOT EXISTS idx_ai_usage_records_provider   ON ai_usage_records(provider)   WHERE provider   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_records_created_at ON ai_usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_records_provider_day ON ai_usage_records(provider, created_at) WHERE provider IS NOT NULL;

-- 3.4 audit_logs — diagnostik & dukungan (tanpa PII).
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id        TEXT    NOT NULL PRIMARY KEY,
  user_id       TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  entity_type   TEXT    NOT NULL,                                -- project/asset/clip/export/tracking/...
  entity_id     TEXT,
  action        TEXT    NOT NULL,                                -- create/update/delete/relink/export_failed/...
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- =====================================================================================
--  BAGIAN 4 — KATALOG GLOBAL (direferensikan ID-nya oleh proyek; tidak diduplikasi)
-- =====================================================================================

-- 4.1 export_presets — preset platform (R-10). Built-in diseed di bagian 17.
CREATE TABLE IF NOT EXISTS export_presets (
  preset_id          TEXT    NOT NULL PRIMARY KEY,
  name               TEXT    NOT NULL,
  target_platform    TEXT,                                        -- tiktok/instagram/youtube/facebook/custom
  width              INTEGER NOT NULL CHECK (width  > 0 AND width  <= 16384),
  height             INTEGER NOT NULL CHECK (height > 0 AND height <= 16384),
  aspect_ratio       TEXT    NOT NULL DEFAULT '9:16',
  fps                INTEGER NOT NULL CHECK (fps > 0 AND fps <= 240),
  codec              TEXT    NOT NULL DEFAULT 'h264',             -- h264/h265/vp9/av1/prores
  container          TEXT    NOT NULL DEFAULT 'mp4',              -- mp4/mov/mkv/webm
  bitrate_mode       TEXT    NOT NULL DEFAULT 'vbr' CHECK (bitrate_mode IN ('cbr','vbr','abr')),
  bitrate_kbps       INTEGER CHECK (bitrate_kbps IS NULL OR bitrate_kbps > 0),
  audio_codec        TEXT    NOT NULL DEFAULT 'aac',
  audio_bitrate_kbps INTEGER NOT NULL DEFAULT 128 CHECK (audio_bitrate_kbps > 0),
  hw_accel           TEXT    NOT NULL DEFAULT 'auto' CHECK (hw_accel IN ('auto','nvenc','qsv','vaapi','videotoolbox','software')),
  is_builtin         INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  is_user_saved      INTEGER NOT NULL DEFAULT 0 CHECK (is_user_saved IN (0,1)),
  sort_index         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_export_presets_sort ON export_presets(is_builtin DESC, sort_index);

-- 4.2 edit_recipes — Auto-Mode G-22 (vlog/promo/tutorial/quote/recap/slideshow/story/custom).
--     `plan_template_json` = kerangka ops EditPlan; diisi/diperkaya oleh Stage 4 (prompt engineering).
CREATE TABLE IF NOT EXISTS edit_recipes (
  recipe_id            TEXT    NOT NULL PRIMARY KEY,
  name                 TEXT    NOT NULL,
  description          TEXT,
  mode                 TEXT    NOT NULL CHECK (mode IN ('vlog','promo','tutorial','quote','recap','slideshow','story','custom')),
  category             TEXT,
  plan_template_json   TEXT    NOT NULL DEFAULT '{"ops":[]}' CHECK (json_valid(plan_template_json)),
  required_asset_count INTEGER NOT NULL DEFAULT 1 CHECK (required_asset_count >= 0),
  default_duration_ms  INTEGER CHECK (default_duration_ms IS NULL OR default_duration_ms > 0),
  is_builtin           INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  is_user_saved        INTEGER NOT NULL DEFAULT 0 CHECK (is_user_saved IN (0,1)),
  usage_count          INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at           INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at           INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_edit_recipes_mode ON edit_recipes(mode, is_builtin DESC);

-- 4.3 templates + template_slots — M11 (M-01..M-06). `source`: built_in/catalog/user.
CREATE TABLE IF NOT EXISTS templates (
  template_id        TEXT    NOT NULL PRIMARY KEY,
  name               TEXT    NOT NULL,
  category           TEXT,
  thumbnail_uri      TEXT,
  duration_ms        INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  slot_count         INTEGER NOT NULL DEFAULT 0 CHECK (slot_count >= 0),   -- dijaga trigger (bagian 14)
  definition_json    TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  source             TEXT    NOT NULL DEFAULT 'built_in' CHECK (source IN ('built_in','catalog','user')),
  is_ai_generated    INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  aspect_ratio       TEXT,
  catalog_version    TEXT,                                        -- versi katalog CDN saat diunduh
  checksum           TEXT,                                        -- deteksi duplikat/pembaruan katalog
  version            INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  usage_count        INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category, source, usage_count DESC);

CREATE TABLE IF NOT EXISTS template_slots (
  slot_id           TEXT    NOT NULL PRIMARY KEY,
  template_id       TEXT    NOT NULL REFERENCES templates(template_id) ON DELETE CASCADE,
  slot_type         TEXT    NOT NULL CHECK (slot_type IN ('media','text','audio','transition','effect')),
  "index"           INTEGER NOT NULL CHECK ("index" >= 0),
  aspect_ratio      TEXT,
  duration_ms       INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  default_text      TEXT,
  default_style_id  TEXT,                                         -- FK ditambahkan logis ke text_styles (dibuat di bagian 8)
  filter_json       TEXT CHECK (filter_json IS NULL OR json_valid(filter_json)),   -- mis. {type:'video',minDurationMs:3000}
  is_required       INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0,1)),
  UNIQUE (template_id, "index")
);

-- 4.4 lut_assets — .cube 33³ (spec §11.2). Dipakai color_grades.lut_id.
CREATE TABLE IF NOT EXISTS lut_assets (
  lut_id      TEXT    NOT NULL PRIMARY KEY,
  name        TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'built_in' CHECK (source IN ('built_in','imported','catalog','ai_generated')),
  file_uri    TEXT    NOT NULL,
  size_bytes  INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  category    TEXT,
  cube_dim    INTEGER DEFAULT 33 CHECK (cube_dim IS NULL OR cube_dim >= 2),
  intensity   REAL    NOT NULL DEFAULT 1 CHECK (intensity >= 0 AND intensity <= 1),
  thumbnail_uri TEXT,
  checksum    TEXT,
  is_valid    INTEGER NOT NULL DEFAULT 1 CHECK (is_valid IN (0,1)),
  catalog_version TEXT,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_lut_assets_category ON lut_assets(category, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lut_assets_checksum
  ON lut_assets(checksum) WHERE checksum IS NOT NULL;              -- cegah impor LUT sama dua kali

-- 4.5 effect_presets — kombinasi efek tersimpan (fitur #114 / E-16).
CREATE TABLE IF NOT EXISTS effect_presets (
  preset_id       TEXT    NOT NULL PRIMARY KEY,
  name            TEXT    NOT NULL,
  category        TEXT,
  effect_stack_json TEXT  NOT NULL CHECK (json_valid(effect_stack_json)),  -- [{effectType,params,orderIndex}]
  is_builtin      INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  usage_count     INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- 4.6 music_assets — cache katalog musik berlisensi dari CDN (A-07). Tanpa bentuk monetisasi.
CREATE TABLE IF NOT EXISTS music_assets (
  music_id       TEXT    NOT NULL PRIMARY KEY,
  external_id    TEXT,                                            -- id di katalog server
  title          TEXT    NOT NULL,
  artist         TEXT,
  duration_ms    INTEGER NOT NULL CHECK (duration_ms >= 0),
  genre          TEXT,
  mood           TEXT,
  tempo_bpm      INTEGER CHECK (tempo_bpm IS NULL OR (tempo_bpm > 0 AND tempo_bpm <= 400)),
  license_type   TEXT,                                            -- cc0/cc_by/royalty_free/...
  preview_uri    TEXT,
  full_uri       TEXT,
  cached_uri     TEXT,                                            -- salinan lokal (offline mode)
  catalog_version TEXT,
  checksum       TEXT,
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_music_assets_mood  ON music_assets(mood, tempo_bpm);
CREATE INDEX IF NOT EXISTS idx_music_assets_genre ON music_assets(genre, duration_ms);

-- =====================================================================================
--  BAGIAN 5 — PROYEK (root aggregate) & SNAPSHOT
-- =====================================================================================

-- 5.1 projects — root aggregate (§11.2). `media_mode` = prinsip reference|bundled (§0.2).
CREATE TABLE IF NOT EXISTS projects (
  project_id          TEXT    NOT NULL PRIMARY KEY,
  user_id             TEXT    NOT NULL DEFAULT 'local-guest'
                              REFERENCES users(user_id) ON DELETE SET NULL,
  name                TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  aspect_ratio        TEXT    NOT NULL DEFAULT '9:16',
  width               INTEGER NOT NULL DEFAULT 1080 CHECK (width  > 0 AND width  <= 16384),
  height              INTEGER NOT NULL DEFAULT 1920 CHECK (height > 0 AND height <= 16384),
  fps                 REAL    NOT NULL DEFAULT 30 CHECK (fps > 0 AND fps <= 240),   -- REAL: dukung 29.97
  canvas_color        TEXT    NOT NULL DEFAULT '#000000',
  canvas_fill_mode    TEXT    NOT NULL DEFAULT 'black'
                              CHECK (canvas_fill_mode IN ('black','white','color','blur','transparent','media')),
  duration_ms         INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),          -- cache agregat (trigger/app)
  cover_uri           TEXT,                                                          -- denormalisasi dari thumbnail_renders
  media_mode          TEXT    NOT NULL DEFAULT 'reference' CHECK (media_mode IN ('reference','bundled')),
  archive_path        TEXT,                                                          -- lokasi .keylox terakhir
  media_root          TEXT,                                                          -- folder sumber utama (usul relink massal)
  is_template_instance INTEGER NOT NULL DEFAULT 0 CHECK (is_template_instance IN (0,1)),
  template_id         TEXT REFERENCES templates(template_id)   ON DELETE SET NULL,
  recipe_id           TEXT REFERENCES edit_recipes(recipe_id)  ON DELETE SET NULL,
  ai_style_profile_json TEXT  CHECK (ai_style_profile_json IS NULL OR json_valid(ai_style_profile_json)),
  export_defaults_json  TEXT  CHECK (export_defaults_json   IS NULL OR json_valid(export_defaults_json)),
  playhead_ms         INTEGER NOT NULL DEFAULT 0 CHECK (playhead_ms >= 0),
  is_read_only        INTEGER NOT NULL DEFAULT 0 CHECK (is_read_only IN (0,1)),      -- skema lebih baru dari app
  schema_version      INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),        -- §11.6 #9
  created_at          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  last_opened_at      INTEGER
);

-- Query panas: daftar proyek terbaru (P-03 lazy list) & daftar per user.
CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_updated     ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user        ON projects(user_id, last_opened_at DESC);

-- 5.2 project_snapshots — autosave & crash recovery (P-04, ≥ 3 checkpoint, recovery ≥ 99%).
CREATE TABLE IF NOT EXISTS project_snapshots (
  snapshot_id   TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  version       INTEGER NOT NULL CHECK (version >= 1),
  trigger       TEXT    NOT NULL DEFAULT 'autosave' CHECK (trigger IN ('autosave','manual','pre_ai','pre_migration','pre_restore')),
  state_blob_ref TEXT   NOT NULL,                                  -- uri file state (di assets/ atau cache/)
  state_json    TEXT    CHECK (state_json IS NULL OR json_valid(state_json)),   -- state ringkas/inline (opsional)
  size_bytes    INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  undo_sequence INTEGER,                                            -- urutan undo saat snapshot dibuat
  is_pinned     INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_project_snapshots_project
  ON project_snapshots(project_id, created_at DESC);
-- Query retensi: hapus snapshot autosave lama kecuali yang di-pin.
CREATE INDEX IF NOT EXISTS idx_project_snapshots_pinned
  ON project_snapshots(project_id, created_at) WHERE is_pinned = 0;

-- =====================================================================================
--  BAGIAN 6 — MEDIA, FOLDER, GRUP & INDEKS (§11.3 + P-10..P-14)
-- =====================================================================================

-- 6.1 media_folders — sumber import batch (P-10) & watched folder (#207).
--     `source`: 'saf' dipertahankan dari v1.0 untuk kompatibilitas; di desktop dipakai
--     'scanned'/'watched'/'imported'.
CREATE TABLE IF NOT EXISTS media_folders (
  folder_id        TEXT    NOT NULL PRIMARY KEY,
  project_id       TEXT REFERENCES projects(project_id) ON DELETE CASCADE,   -- NULL = folder global (library)
  uri              TEXT    NOT NULL,
  display_name     TEXT    NOT NULL,
  source           TEXT    NOT NULL DEFAULT 'scanned'
                           CHECK (source IN ('scanned','watched','imported','saf','dropped')),
  recursive        INTEGER NOT NULL DEFAULT 0 CHECK (recursive IN (0,1)),
  media_count      INTEGER NOT NULL DEFAULT 0 CHECK (media_count >= 0),      -- dijaga trigger (bagian 14)
  last_scan_at     INTEGER,
  is_watched       INTEGER NOT NULL DEFAULT 0 CHECK (is_watched IN (0,1)),
  auto_group_mode  TEXT CHECK (auto_group_mode IS NULL OR
                               auto_group_mode IN ('none','event','date','type','orientation','subject','custom')),
  watch_cursor     TEXT,                                                     -- penanda scan terakhir (deteksi file baru)
  created_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_media_folders_project ON media_folders(project_id, display_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_folders_uri
  ON media_folders(project_id, uri) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_folders_watched
  ON media_folders(is_watched, last_scan_at) WHERE is_watched = 1;

-- 6.2 media_assets — REFERENSI, bukan salinan (non-destruktif, §11.6 #1).
CREATE TABLE IF NOT EXISTS media_assets (
  asset_id       TEXT    NOT NULL PRIMARY KEY,
  project_id     TEXT REFERENCES projects(project_id)      ON DELETE CASCADE,
  folder_id      TEXT REFERENCES media_folders(folder_id)  ON DELETE SET NULL,
  uri            TEXT    NOT NULL,                            -- path asli (reference) / path asal (bundled)
  uri_scheme     TEXT    NOT NULL DEFAULT 'file'
                         CHECK (uri_scheme IN ('file','file-bundled','http','asset')),
  type           TEXT    NOT NULL CHECK (type IN ('video','audio','image')),
  display_name   TEXT    NOT NULL,
  duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  width          INTEGER CHECK (width  IS NULL OR (width  > 0 AND width  <= 16384)),
  height         INTEGER CHECK (height IS NULL OR (height > 0 AND height <= 16384)),
  fps            REAL    CHECK (fps IS NULL OR (fps > 0 AND fps <= 240)),
  rotation       INTEGER NOT NULL DEFAULT 0,
  codec          TEXT,
  audio_codec    TEXT,
  bitrate        INTEGER CHECK (bitrate IS NULL OR bitrate >= 0),
  size_bytes     INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  has_audio      INTEGER NOT NULL DEFAULT 0 CHECK (has_audio IN (0,1)),
  channels       INTEGER,
  sample_rate    INTEGER,
  date_taken     INTEGER,                                     -- EXIF/container metadata (perintah #21 urut by tanggal)
  camera_make    TEXT,
  quality_score  REAL    CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1)),
  checksum       TEXT,                                        -- SHA-256 konten → deteksi duplikat (P-10)
  quick_hash     TEXT,                                        -- hash murah (size+mtime) untuk scan cepat
  probe_status   TEXT    NOT NULL DEFAULT 'pending'
                         CHECK (probe_status IN ('pending','ok','failed','unsupported')),
  probe_error    TEXT,
  index_status   TEXT    NOT NULL DEFAULT 'none'
                         CHECK (index_status IN ('none','queued','running','indexed','stale','failed','skipped')),
  indexed_at     INTEGER,
  is_missing     INTEGER NOT NULL DEFAULT 0 CHECK (is_missing IN (0,1)),      -- penggerak dialog relink
  missing_since  INTEGER,
  last_seen_at   INTEGER,
  is_bundled     INTEGER NOT NULL DEFAULT 0 CHECK (is_bundled IN (0,1)),      -- mediaMode=bundled
  bundled_rel_uri TEXT,                                       -- path relatif di dalam arsip (.keylox/media/…)
  bundle_checksum TEXT,
  is_hidden      INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0,1)),
  tags_json      TEXT CHECK (tags_json IS NULL OR json_valid(tags_json)),
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- Query panas: isi Media Panel per proyek (grid + filter tipe/indeks).
CREATE INDEX IF NOT EXISTS idx_media_assets_project_type ON media_assets(project_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_folder       ON media_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_date_taken   ON media_assets(project_id, date_taken);
-- Dialog relink (R-15): hanya baris hilang yang di-index → murah walau aset 4.000+.
CREATE INDEX IF NOT EXISTS idx_media_assets_missing
  ON media_assets(project_id, display_name) WHERE is_missing = 1;
-- Antrean indeks (P-12/P-14): aset yang belum/stale.
CREATE INDEX IF NOT EXISTS idx_media_assets_index_queue
  ON media_assets(index_status, created_at) WHERE index_status IN ('queued','stale','failed','none');
CREATE INDEX IF NOT EXISTS idx_media_assets_checksum     ON media_assets(checksum) WHERE checksum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_quality      ON media_assets(project_id, quality_score DESC);
-- Satu path tidak boleh menjadi dua aset dalam proyek yang sama (mencegah duplikasi impor).
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_project_uri
  ON media_assets(project_id, uri) WHERE project_id IS NOT NULL;

-- 6.3 media_relink_history — jejak pemetaan path lama → baru (mendukung relink massal §0.2).
CREATE TABLE IF NOT EXISTS media_relink_history (
  relink_id   TEXT    NOT NULL PRIMARY KEY,
  asset_id    TEXT    NOT NULL REFERENCES media_assets(asset_id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  old_uri     TEXT    NOT NULL,
  new_uri     TEXT    NOT NULL,
  method      TEXT    NOT NULL DEFAULT 'manual'
                      CHECK (method IN ('manual','auto_same_folder','auto_checksum','auto_hash_match','bulk')),
  checksum_match INTEGER NOT NULL DEFAULT 0 CHECK (checksum_match IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_media_relink_history_asset  ON media_relink_history(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_relink_history_folder ON media_relink_history(project_id, old_uri);

-- 6.4 media_groups + media_group_items — hasil auto-group (P-11). Relasi N—N butuh tabel jembatan.
CREATE TABLE IF NOT EXISTS media_groups (
  group_id       TEXT    NOT NULL PRIMARY KEY,
  project_id     TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  group_type     TEXT    NOT NULL DEFAULT 'custom'
                         CHECK (group_type IN ('event','date','type','orientation','subject','custom')),
  cover_asset_id TEXT REFERENCES media_assets(asset_id) ON DELETE SET NULL,
  asset_count    INTEGER NOT NULL DEFAULT 0 CHECK (asset_count >= 0),        -- dijaga trigger
  confidence     REAL    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  is_auto        INTEGER NOT NULL DEFAULT 0 CHECK (is_auto IN (0,1)),
  is_pinned      INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  sort_index     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_media_groups_project ON media_groups(project_id, sort_index);

CREATE TABLE IF NOT EXISTS media_group_items (
  group_id   TEXT    NOT NULL REFERENCES media_groups(group_id) ON DELETE CASCADE,
  asset_id   TEXT    NOT NULL REFERENCES media_assets(asset_id) ON DELETE CASCADE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  confidence REAL    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  added_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  PRIMARY KEY (group_id, asset_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_media_group_items_asset ON media_group_items(asset_id);

-- 6.5 asset_insights — AI index per aset (= MediaIndex + AssetInsight, §11.3).
--     Boleh dihapus & dibangun ulang tanpa menyentuh media_assets/clips (§11.6 #5).
--     Catatan: teks transkrip disimpan INLINE (bukan blob terpisah) karena dipakai FTS5 untuk
--     "pencarian momen" (G-08) — lihat keputusan normalisasi #1.
CREATE TABLE IF NOT EXISTS asset_insights (
  insight_id      TEXT    NOT NULL PRIMARY KEY,
  asset_id        TEXT    NOT NULL UNIQUE REFERENCES media_assets(asset_id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  duration_ms     INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  width           INTEGER,
  height          INTEGER,
  scenes_json     TEXT CHECK (scenes_json   IS NULL OR json_valid(scenes_json)),   -- batas adegan + thumbnail
  subjects_json   TEXT CHECK (subjects_json IS NULL OR json_valid(subjects_json)), -- orang/hewan/objek + bbox
  labels_json     TEXT CHECK (labels_json   IS NULL OR json_valid(labels_json)),   -- ≥ 60 kategori
  ocr_text        TEXT,
  transcript_text TEXT,
  transcript_lang TEXT,
  transcript_word_timings_json TEXT CHECK (transcript_word_timings_json IS NULL
                                           OR json_valid(transcript_word_timings_json)),
  speakers_json   TEXT CHECK (speakers_json IS NULL OR json_valid(speakers_json)),
  quality_score   REAL CHECK (quality_score   IS NULL OR (quality_score   >= 0 AND quality_score   <= 1)),
  brightness_score REAL CHECK (brightness_score IS NULL OR (brightness_score >= 0 AND brightness_score <= 1)),
  sharpness_score REAL CHECK (sharpness_score IS NULL OR (sharpness_score >= 0 AND sharpness_score <= 1)),
  blur_score      REAL CHECK (blur_score IS NULL OR (blur_score >= 0 AND blur_score <= 1)),
  has_speech      INTEGER NOT NULL DEFAULT 0 CHECK (has_speech IN (0,1)),
  has_person      INTEGER NOT NULL DEFAULT 0 CHECK (has_person IN (0,1)),
  has_face        INTEGER NOT NULL DEFAULT 0 CHECK (has_face IN (0,1)),
  language        TEXT,
  embedding_ref   TEXT REFERENCES embedding_vectors(vector_id) ON DELETE SET NULL,
  detector_model_version TEXT,
  index_job_id    TEXT,
  index_status    TEXT    NOT NULL DEFAULT 'indexed'
                          CHECK (index_status IN ('none','queued','running','indexed','stale','failed')),
  indexed_at      INTEGER,
  index_duration_ms INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_asset_insights_project  ON asset_insights(project_id);
CREATE INDEX IF NOT EXISTS idx_asset_insights_quality  ON asset_insights(project_id, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_asset_insights_speech   ON asset_insights(project_id, has_speech, has_person);
-- Auto-pick bahan (P-13) & re-index inkremental (P-14).
CREATE INDEX IF NOT EXISTS idx_asset_insights_stale
  ON asset_insights(index_status, indexed_at) WHERE index_status IN ('stale','failed','queued');

-- 6.6 embedding_vectors — vector store lokal (D-11). Boleh dibangun ulang.
CREATE TABLE IF NOT EXISTS embedding_vectors (
  vector_id   TEXT    NOT NULL PRIMARY KEY,
  asset_id    TEXT    NOT NULL REFERENCES media_assets(asset_id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  model       TEXT    NOT NULL DEFAULT 'mediapipe-image-embedder',
  model_version TEXT,
  dim         INTEGER NOT NULL CHECK (dim > 0),
  vector_blob BLOB    NOT NULL,
  normalized  INTEGER NOT NULL DEFAULT 1 CHECK (normalized IN (0,1)),
  scope       TEXT    NOT NULL DEFAULT 'asset'
                      CHECK (scope IN ('asset','frame','scene','text','subject')),
  frame_time_ms INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- Satu embedding per (aset, model, scope) untuk level aset; dan satu per frame untuk level frame.
-- Dipisah jadi dua index parsial karena NULL dianggap berbeda oleh UNIQUE biasa di SQLite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_vectors_asset_unique
  ON embedding_vectors(asset_id, model, scope) WHERE frame_time_ms IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_vectors_frame_unique
  ON embedding_vectors(asset_id, model, scope, frame_time_ms) WHERE frame_time_ms IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_embedding_vectors_asset ON embedding_vectors(asset_id, model);
CREATE INDEX IF NOT EXISTS idx_embedding_vectors_scope ON embedding_vectors(project_id, scope);

-- 6.7 index_jobs — job indeks aset lokal (P-12: 500 aset ≤ 15 menit, background, dapat dibatalkan).
CREATE TABLE IF NOT EXISTS index_jobs (
  job_id        TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  folder_id     TEXT REFERENCES media_folders(folder_id) ON DELETE SET NULL,
  scope         TEXT    NOT NULL CHECK (scope IN ('single','batch','folder','project','reindex')),
  status        TEXT    NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','paused','succeeded','failed','cancelled')),
  progress      REAL    NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  asset_total   INTEGER NOT NULL DEFAULT 0 CHECK (asset_total >= 0),
  asset_done    INTEGER NOT NULL DEFAULT 0 CHECK (asset_done  >= 0),
  current_asset_id TEXT,
  stages_json   TEXT CHECK (stages_json IS NULL OR json_valid(stages_json)),  -- progress per tahap (scene/subject/ocr/embedding)
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
  error_code    TEXT,
  error_message TEXT,
  started_at    INTEGER,
  finished_at   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- Polling progress hanya menyentuh job aktif.
CREATE INDEX IF NOT EXISTS idx_index_jobs_active
  ON index_jobs(status, created_at) WHERE status IN ('queued','running','paused');
CREATE INDEX IF NOT EXISTS idx_index_jobs_project ON index_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_index_jobs_folder  ON index_jobs(folder_id, created_at DESC);

-- =====================================================================================
--  BAGIAN 7 — TIMELINE ENGINE (M2) + TRANSFORM (M3) + COLOR (M4) + EFFECT (M5) + COMPOSITING (M6)
-- =====================================================================================

-- 7.1 clip_groups — grup klip (#28 "kelompokkan klip jadi satu grup", #29 lock).
CREATE TABLE IF NOT EXISTS clip_groups (
  group_id   TEXT    NOT NULL PRIMARY KEY,
  project_id TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  name       TEXT,
  is_locked  INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  is_ai_created INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_created IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_clip_groups_project ON clip_groups(project_id);

-- 7.2 tracks — ≥ 6 track; satu tabel untuk semua tipe (discriminator `type`, lihat keputusan #3).
CREATE TABLE IF NOT EXISTS tracks (
  track_id    TEXT    NOT NULL PRIMARY KEY,
  project_id  TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('video','overlay','text','audio','audio_extra')),
  "index"     INTEGER NOT NULL CHECK ("index" >= 0),
  name        TEXT,
  is_muted    INTEGER NOT NULL DEFAULT 0 CHECK (is_muted IN (0,1)),
  is_hidden   INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0,1)),
  is_locked   INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  is_solo     INTEGER NOT NULL DEFAULT 0 CHECK (is_solo IN (0,1)),
  volume      REAL    NOT NULL DEFAULT 1 CHECK (volume >= 0 AND volume <= 4),
  blend_mode  TEXT CHECK (blend_mode IS NULL OR blend_mode IN
                ('normal','multiply','screen','overlay','darken','lighten','color_dodge','color_burn',
                 'hard_light','soft_light','difference','exclusion','hue','saturation','color','luminosity','add')),
  height_px   INTEGER,                                            -- tinggi lane di UI (persistensi layout)
  color       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (project_id, "index")
);

CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(project_id, "index");

-- 7.3 clips — non-destruktif: hanya menunjuk rentang sumber media (§11.6 #1).
--     `media_asset_id` memakai ON DELETE RESTRICT: aplikasi wajib menangani klip terkait secara
--     eksplisit (dalam satu transaksi + UndoRecord) agar timeline tidak "kehilangan" klip diam-diam.
CREATE TABLE IF NOT EXISTS clips (
  clip_id           TEXT    NOT NULL PRIMARY KEY,
  track_id          TEXT    NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
  media_asset_id    TEXT    NOT NULL REFERENCES media_assets(asset_id) ON DELETE RESTRICT,
  "index"           INTEGER NOT NULL CHECK ("index" >= 0),
  src_in_ms         INTEGER NOT NULL DEFAULT 0 CHECK (src_in_ms >= 0),
  src_out_ms        INTEGER NOT NULL CHECK (src_out_ms >= src_in_ms),
  timeline_start_ms INTEGER NOT NULL DEFAULT 0 CHECK (timeline_start_ms >= 0),
  duration_ms       INTEGER NOT NULL CHECK (duration_ms > 0),     -- durasi di timeline (setelah speed)
  speed             REAL    NOT NULL DEFAULT 1 CHECK (speed > 0 AND speed <= 100),
  preserve_pitch    INTEGER NOT NULL DEFAULT 1 CHECK (preserve_pitch IN (0,1)),
  is_reversed       INTEGER NOT NULL DEFAULT 0 CHECK (is_reversed IN (0,1)),
  is_freeze         INTEGER NOT NULL DEFAULT 0 CHECK (is_freeze IN (0,1)),
  is_detached_audio INTEGER NOT NULL DEFAULT 0 CHECK (is_detached_audio IN (0,1)),
  is_enabled        INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  is_locked         INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  volume            REAL    NOT NULL DEFAULT 1 CHECK (volume >= 0 AND volume <= 4),
  linked_clip_id    TEXT REFERENCES clips(clip_id) ON DELETE SET NULL,      -- klip video ↔ audio hasil detach
  group_id          TEXT REFERENCES clip_groups(group_id) ON DELETE SET NULL,
  label             TEXT,
  color             TEXT,
  created_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (clip_id <> linked_clip_id)
);

-- Query terpanas timeline: render/scrub per track berdasarkan waktu.
CREATE INDEX IF NOT EXISTS idx_clips_track_time   ON clips(track_id, timeline_start_ms);
CREATE INDEX IF NOT EXISTS idx_clips_track_order  ON clips(track_id, "index");
CREATE INDEX IF NOT EXISTS idx_clips_media        ON clips(media_asset_id);         -- FK + deteksi "media hilang"
CREATE INDEX IF NOT EXISTS idx_clips_linked       ON clips(linked_clip_id) WHERE linked_clip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clips_group        ON clips(group_id)       WHERE group_id       IS NOT NULL;

-- 7.4 clip_transforms — 1:1 Clip (M3). Dipisah dari clips (keputusan #6).
CREATE TABLE IF NOT EXISTS clip_transforms (
  transform_id TEXT    NOT NULL PRIMARY KEY,
  clip_id      TEXT    NOT NULL UNIQUE REFERENCES clips(clip_id) ON DELETE CASCADE,
  pos_x        REAL    NOT NULL DEFAULT 0,                        -- 0..1 relatif kanvas (nilai normal)
  pos_y        REAL    NOT NULL DEFAULT 0,
  scale_x      REAL    NOT NULL DEFAULT 1 CHECK (scale_x <> 0),
  scale_y      REAL    NOT NULL DEFAULT 1 CHECK (scale_y <> 0),
  rotation     REAL    NOT NULL DEFAULT 0,                        -- derajat
  flip_h       INTEGER NOT NULL DEFAULT 0 CHECK (flip_h IN (0,1)),
  flip_v       INTEGER NOT NULL DEFAULT 0 CHECK (flip_v IN (0,1)),
  crop_x       REAL    NOT NULL DEFAULT 0 CHECK (crop_x >= 0 AND crop_x < 1),
  crop_y       REAL    NOT NULL DEFAULT 0 CHECK (crop_y >= 0 AND crop_y < 1),
  crop_w       REAL    NOT NULL DEFAULT 1 CHECK (crop_w > 0 AND crop_w <= 1),
  crop_h       REAL    NOT NULL DEFAULT 1 CHECK (crop_h > 0 AND crop_h <= 1),
  aspect_mode  TEXT    NOT NULL DEFAULT 'fit' CHECK (aspect_mode IN ('fit','fill','stretch','original')),
  opacity      REAL    NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  anchor_x     REAL    NOT NULL DEFAULT 0.5,
  anchor_y     REAL    NOT NULL DEFAULT 0.5,
  corner_radius REAL   NOT NULL DEFAULT 0 CHECK (corner_radius >= 0),
  perspective_json TEXT CHECK (perspective_json IS NULL OR json_valid(perspective_json)),  -- (#55 keystone, v3)
  stabilize_json   TEXT CHECK (stabilize_json   IS NULL OR json_valid(stabilize_json)),    -- (X-08; hasil dari M14)
  auto_reframe     INTEGER NOT NULL DEFAULT 0 CHECK (auto_reframe IN (0,1)),               -- G-15
  reframe_target_id TEXT,                                                  -- logical ref ke tracking_targets
  CHECK (crop_x + crop_w <= 1.0001 AND crop_y + crop_h <= 1.0001)
);

-- 7.5 color_grades — 1:1 Clip (M4). Tool kompleks disimpan JSON (curves/levels/color balance).
CREATE TABLE IF NOT EXISTS color_grades (
  grade_id            TEXT    NOT NULL PRIMARY KEY,
  clip_id             TEXT    NOT NULL UNIQUE REFERENCES clips(clip_id) ON DELETE CASCADE,
  brightness          REAL    NOT NULL DEFAULT 0,
  contrast            REAL    NOT NULL DEFAULT 0,
  saturation          REAL    NOT NULL DEFAULT 0,
  hue                 REAL    NOT NULL DEFAULT 0,
  exposure            REAL    NOT NULL DEFAULT 0,
  warmth              REAL    NOT NULL DEFAULT 0,
  temperature         REAL    NOT NULL DEFAULT 0,
  tint                REAL    NOT NULL DEFAULT 0,
  highlights          REAL    NOT NULL DEFAULT 0,
  shadows             REAL    NOT NULL DEFAULT 0,
  sharpen_amount      REAL    NOT NULL DEFAULT 0 CHECK (sharpen_amount >= 0),
  sharpen_radius      REAL    NOT NULL DEFAULT 0 CHECK (sharpen_radius >= 0),
  vignette_amount     REAL    NOT NULL DEFAULT 0 CHECK (vignette_amount >= 0 AND vignette_amount <= 1),
  vignette_radius     REAL    NOT NULL DEFAULT 0.5,
  vignette_softness   REAL    NOT NULL DEFAULT 0.5,
  grain_amount        REAL    NOT NULL DEFAULT 0 CHECK (grain_amount >= 0 AND grain_amount <= 1),
  curves_json         TEXT CHECK (curves_json         IS NULL OR json_valid(curves_json)),
  levels_json         TEXT CHECK (levels_json         IS NULL OR json_valid(levels_json)),
  color_balance_json  TEXT CHECK (color_balance_json  IS NULL OR json_valid(color_balance_json)),
  selective_color_json TEXT CHECK (selective_color_json IS NULL OR json_valid(selective_color_json)),
  lut_id              TEXT REFERENCES lut_assets(lut_id) ON DELETE SET NULL,
  lut_intensity       REAL    NOT NULL DEFAULT 1 CHECK (lut_intensity >= 0 AND lut_intensity <= 1),
  look_preset         TEXT,                                        -- cinematic/warm/clean/moody/vintage/faded/...
  is_ai_generated     INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  ai_look_name        TEXT,
  updated_at          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_color_grades_lut ON color_grades(lut_id) WHERE lut_id IS NOT NULL;

-- 7.6 effect_instances — N:1 Clip, urutan deterministik (M5: 17 shader + animasi + transisi + partikel).
CREATE TABLE IF NOT EXISTS effect_instances (
  effect_id       TEXT    NOT NULL PRIMARY KEY,
  clip_id         TEXT    NOT NULL REFERENCES clips(clip_id) ON DELETE CASCADE,
  effect_type     TEXT    NOT NULL CHECK (effect_type IN
                    ('glow','lens_blur','chromatic_aberration','light_sweep','fractal_noise',
                     'turbulent_displace','halftone','find_edges','twitch','audio_spectrum',
                     'four_color_gradient','radial_wipe','particular','chroma_key','curves','levels',
                     'color_balance_hls','blur','motion_blur','audio_reactive','grain','sharpen','vignette',
                     'transition','animation_in','animation_out','animation_loop','motion_preset','lut','custom')),
  order_index     INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
  is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  preset_id       TEXT REFERENCES effect_presets(preset_id) ON DELETE SET NULL,
  params_json     TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(params_json)),   -- uniform shader / parameter
  shader_version  TEXT,
  intensity       REAL    NOT NULL DEFAULT 1 CHECK (intensity >= 0),
  time_range_start_ms INTEGER CHECK (time_range_start_ms IS NULL OR time_range_start_ms >= 0),
  time_range_end_ms   INTEGER CHECK (time_range_end_ms   IS NULL OR time_range_end_ms   >= 0),
  blend_mode      TEXT,
  is_ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (time_range_start_ms IS NULL OR time_range_end_ms IS NULL
         OR time_range_end_ms >= time_range_start_ms)
);

CREATE INDEX IF NOT EXISTS idx_effect_instances_clip  ON effect_instances(clip_id, order_index);
CREATE INDEX IF NOT EXISTS idx_effect_instances_type  ON effect_instances(effect_type, is_enabled);  -- "semua klip dengan glow" (#110)
CREATE INDEX IF NOT EXISTS idx_effect_instances_preset ON effect_instances(preset_id) WHERE preset_id IS NOT NULL;

-- 7.7 transitions — E-17. Properti SAMBUNGAN dua klip (keputusan #14).
CREATE TABLE IF NOT EXISTS transitions (
  transition_id   TEXT    NOT NULL PRIMARY KEY,
  project_id      TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  clip_a_id       TEXT    NOT NULL REFERENCES clips(clip_id) ON DELETE CASCADE,
  clip_b_id       TEXT    NOT NULL REFERENCES clips(clip_id) ON DELETE CASCADE,
  transition_type TEXT    NOT NULL CHECK (transition_type IN
                    ('none','dissolve','fade_black','fade_white','zoom','radial_wipe','glitch','wipe','slide','custom')),
  duration_ms     INTEGER NOT NULL DEFAULT 300 CHECK (duration_ms >= 0),
  params_json     TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(params_json)),
  is_effect_based INTEGER NOT NULL DEFAULT 0 CHECK (is_effect_based IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (clip_a_id <> clip_b_id),
  UNIQUE (clip_a_id, clip_b_id)
);

CREATE INDEX IF NOT EXISTS idx_transitions_project ON transitions(project_id);
CREATE INDEX IF NOT EXISTS idx_transitions_clip_b  ON transitions(clip_b_id);

-- 7.8 masks — N:1 Clip (K-03/K-04), path dapat ber-keyframe maupun mengikuti tracking.
CREATE TABLE IF NOT EXISTS masks (
  mask_id      TEXT    NOT NULL PRIMARY KEY,
  clip_id      TEXT    NOT NULL REFERENCES clips(clip_id) ON DELETE CASCADE,
  mask_type    TEXT    NOT NULL CHECK (mask_type IN ('linear','radial','shape','brush','luma','path','difference')),
  path_json    TEXT    CHECK (path_json IS NULL OR json_valid(path_json)),        -- titik/lintasan bebas
  feather      REAL    NOT NULL DEFAULT 0 CHECK (feather >= 0),
  invert       INTEGER NOT NULL DEFAULT 0 CHECK (invert IN (0,1)),
  opacity      REAL    NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  blend_mode   TEXT,
  expansion    REAL    NOT NULL DEFAULT 0,
  is_animated  INTEGER NOT NULL DEFAULT 0 CHECK (is_animated IN (0,1)),
  tracking_target_id TEXT,                                                        -- mask dinamis (TR-10)
  order_index  INTEGER NOT NULL DEFAULT 0,
  is_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_masks_clip ON masks(clip_id, order_index);
CREATE INDEX IF NOT EXISTS idx_masks_target ON masks(tracking_target_id) WHERE tracking_target_id IS NOT NULL;

-- 7.9 chroma_keys — 1:1 Clip (K-05/K-06).
CREATE TABLE IF NOT EXISTS chroma_keys (
  key_id           TEXT    NOT NULL PRIMARY KEY,
  clip_id          TEXT    NOT NULL UNIQUE REFERENCES clips(clip_id) ON DELETE CASCADE,
  key_color        TEXT    NOT NULL DEFAULT '#00FF00',
  tolerance        REAL    NOT NULL DEFAULT 0.1 CHECK (tolerance >= 0 AND tolerance <= 1),
  edge_thinness    REAL    NOT NULL DEFAULT 0 CHECK (edge_thinness >= 0 AND edge_thinness <= 1),
  feather          REAL    NOT NULL DEFAULT 0 CHECK (feather >= 0),
  spill_suppression REAL   NOT NULL DEFAULT 0 CHECK (spill_suppression >= 0 AND spill_suppression <= 1),
  alpha_threshold  REAL    NOT NULL DEFAULT 0.5 CHECK (alpha_threshold >= 0 AND alpha_threshold <= 1),
  is_enabled       INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  extra_keys_json  TEXT CHECK (extra_keys_json  IS NULL OR json_valid(extra_keys_json)),
  garbage_matte_json TEXT CHECK (garbage_matte_json IS NULL OR json_valid(garbage_matte_json)),
  updated_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- 7.10 blends — 1:1 Clip (K-01/K-02 overlay & blend).
CREATE TABLE IF NOT EXISTS blends (
  blend_id        TEXT    NOT NULL PRIMARY KEY,
  clip_id         TEXT    NOT NULL UNIQUE REFERENCES clips(clip_id) ON DELETE CASCADE,
  blend_mode      TEXT    NOT NULL DEFAULT 'normal' CHECK (blend_mode IN
                    ('normal','multiply','screen','overlay','darken','lighten','color_dodge','color_burn',
                     'hard_light','soft_light','difference','exclusion','hue','saturation','color','luminosity','add')),
  is_overlay      INTEGER NOT NULL DEFAULT 0 CHECK (is_overlay IN (0,1)),
  border_width    REAL    NOT NULL DEFAULT 0 CHECK (border_width >= 0),
  border_color    TEXT    NOT NULL DEFAULT '#FFFFFF',
  corner_radius   REAL    NOT NULL DEFAULT 0 CHECK (corner_radius >= 0),
  shadow_blur     REAL    NOT NULL DEFAULT 0 CHECK (shadow_blur >= 0),
  shadow_offset_x REAL    NOT NULL DEFAULT 0,
  shadow_offset_y REAL    NOT NULL DEFAULT 0,
  shadow_opacity  REAL    NOT NULL DEFAULT 0 CHECK (shadow_opacity >= 0 AND shadow_opacity <= 1),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- 7.11 keyframes — tabel POLIMORFIK (owner_type + owner_id), lihat keputusan #7.
--      `project_id` sengaja diduplikasi di sini: SQLite tidak mendukung FK polimorfik, sehingga ini
--      satu-satunya cara menjamin cascade saat proyek dihapus (§11.6 #2) dan query keyframe per proyek.
CREATE TABLE IF NOT EXISTS keyframes (
  keyframe_id   TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  owner_type    TEXT    NOT NULL CHECK (owner_type IN
                  ('clip','transform','color','effect','text','mask','audio','track','tracking','object')),
  owner_id      TEXT    NOT NULL,
  property      TEXT    NOT NULL,                                  -- 'pos_x', 'opacity', 'volume', 'params.glow.intensity', ...
  time_ms       INTEGER NOT NULL CHECK (time_ms >= 0),
  value         TEXT    NOT NULL,                                  -- nilai ternormalisasi (JSON bila kompleks)
  value_type    TEXT    NOT NULL DEFAULT 'number'
                        CHECK (value_type IN ('number','percent','point','color','bool','string','json')),
  interpolation TEXT    NOT NULL DEFAULT 'linear'
                        CHECK (interpolation IN ('linear','hold','stepped','bezier','ease_in','ease_out','ease_in_out')),
  bezier_x1     REAL, bezier_y1 REAL, bezier_x2 REAL, bezier_y2 REAL,
  is_enabled    INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  is_ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  -- Satu nilai per properti per waktu (keyframe ganda akan membuat evaluasi ambigu).
  UNIQUE (owner_type, owner_id, property, time_ms),
  CHECK (interpolation <> 'bezier' OR (bezier_x1 IS NOT NULL AND bezier_y1 IS NOT NULL
                                       AND bezier_x2 IS NOT NULL AND bezier_y2 IS NOT NULL))
);

-- Query evaluasi animasi: semua properti satu owner berurutan waktu.
CREATE INDEX IF NOT EXISTS idx_keyframes_owner ON keyframes(owner_type, owner_id, property, time_ms);
CREATE INDEX IF NOT EXISTS idx_keyframes_project ON keyframes(project_id, time_ms);
CREATE INDEX IF NOT EXISTS idx_keyframes_ai ON keyframes(project_id, is_ai_generated) WHERE is_ai_generated = 1;

-- =====================================================================================
--  BAGIAN 8 — TEKS, STICKER & CAPTION (M8)
-- =====================================================================================

-- 8.1 text_styles — gaya teks dipakai bersama oleh text_overlays dan caption_tracks (tanpa duplikasi).
CREATE TABLE IF NOT EXISTS text_styles (
  style_id          TEXT    NOT NULL PRIMARY KEY,
  project_id        TEXT REFERENCES projects(project_id) ON DELETE CASCADE,   -- NULL = gaya global/brand kit
  name              TEXT,
  font_family       TEXT    NOT NULL DEFAULT 'Inter',
  font_uri          TEXT,                                        -- font kustom (resources/ atau assets/)
  font_size         REAL    NOT NULL DEFAULT 48 CHECK (font_size > 0),
  font_weight       INTEGER NOT NULL DEFAULT 400,
  is_italic         INTEGER NOT NULL DEFAULT 0 CHECK (is_italic IN (0,1)),
  color             TEXT    NOT NULL DEFAULT '#FFFFFF',
  opacity           REAL    NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  stroke_width      REAL    NOT NULL DEFAULT 0 CHECK (stroke_width >= 0),
  stroke_color      TEXT    NOT NULL DEFAULT '#000000',
  shadow_blur       REAL    NOT NULL DEFAULT 0 CHECK (shadow_blur >= 0),
  shadow_offset_x   REAL    NOT NULL DEFAULT 0,
  shadow_offset_y   REAL    NOT NULL DEFAULT 0,
  shadow_color      TEXT    NOT NULL DEFAULT '#00000088',
  bg_color          TEXT,
  bg_padding        REAL    NOT NULL DEFAULT 0 CHECK (bg_padding >= 0),
  bg_corner_radius  REAL    NOT NULL DEFAULT 0 CHECK (bg_corner_radius >= 0),
  line_spacing      REAL    NOT NULL DEFAULT 1.2 CHECK (line_spacing > 0),
  letter_spacing    REAL    NOT NULL DEFAULT 0,
  align             TEXT    NOT NULL DEFAULT 'center' CHECK (align IN ('left','center','right','justify')),
  vertical_align    TEXT    NOT NULL DEFAULT 'bottom' CHECK (vertical_align IN ('top','middle','bottom')),
  curve_radius      REAL    NOT NULL DEFAULT 0,
  max_width_ratio   REAL    NOT NULL DEFAULT 0.9 CHECK (max_width_ratio > 0 AND max_width_ratio <= 1),
  is_brand_kit      INTEGER NOT NULL DEFAULT 0 CHECK (is_brand_kit IN (0,1)),
  is_topmost_style  INTEGER NOT NULL DEFAULT 0 CHECK (is_topmost_style IN (0,1)),  -- caption di atas efek
  extra_json        TEXT CHECK (extra_json IS NULL OR json_valid(extra_json)),     -- neon/kinetic (S-15, E-22)
  created_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_text_styles_project ON text_styles(project_id, is_brand_kit DESC);

-- 8.2 text_overlays — teks + sticker/gambar (keputusan #2). Boleh terikat tracking (S-10/S-13).
CREATE TABLE IF NOT EXISTS text_overlays (
  text_overlay_id   TEXT    NOT NULL PRIMARY KEY,
  project_id        TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  track_id          TEXT    NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
  clip_id           TEXT REFERENCES clips(clip_id) ON DELETE SET NULL,        -- konteks opsional
  media_asset_id    TEXT REFERENCES media_assets(asset_id) ON DELETE SET NULL, -- sticker/gambar (D-04)
  content           TEXT    NOT NULL DEFAULT '',
  style_id          TEXT REFERENCES text_styles(style_id) ON DELETE SET NULL,
  start_ms          INTEGER NOT NULL DEFAULT 0 CHECK (start_ms >= 0),
  end_ms            INTEGER NOT NULL CHECK (end_ms > start_ms),
  pos_x             REAL    NOT NULL DEFAULT 0.5,
  pos_y             REAL    NOT NULL DEFAULT 0.5,
  rotation          REAL    NOT NULL DEFAULT 0,
  scale             REAL    NOT NULL DEFAULT 1 CHECK (scale <> 0),
  opacity           REAL    NOT NULL DEFAULT 1 CHECK (opacity >= 0 AND opacity <= 1),
  z_index           INTEGER NOT NULL DEFAULT 0,
  animation_in      TEXT,                                        -- fade/pop/slide/typewriter/...
  animation_out     TEXT,
  animation_loop    TEXT,                                        -- pulse/wave/neon
  animation_params_json TEXT CHECK (animation_params_json IS NULL OR json_valid(animation_params_json)),
  tracking_target_id TEXT,                                       -- S-10 tracking text
  is_sticker        INTEGER NOT NULL DEFAULT 0 CHECK (is_sticker IN (0,1)),
  is_caption_segment INTEGER NOT NULL DEFAULT 0 CHECK (is_caption_segment IN (0,1)),  -- berasal dari ASR
  caption_segment_id TEXT,                                       -- logical ref ke caption_segments (bila ada)
  is_enabled        INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  is_ai_generated   INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  created_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  -- Elemen overlay harus punya isi: teks ATAU media (sticker).
  CHECK (length(content) > 0 OR media_asset_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_text_overlays_track  ON text_overlays(track_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_text_overlays_project ON text_overlays(project_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_text_overlays_target ON text_overlays(tracking_target_id) WHERE tracking_target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_text_overlays_style  ON text_overlays(style_id) WHERE style_id IS NOT NULL;

-- 8.3 caption_tracks — satu track caption per bahasa/sumber (G-04, S-09, S-14).
CREATE TABLE IF NOT EXISTS caption_tracks (
  caption_track_id TEXT    NOT NULL PRIMARY KEY,
  project_id       TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  language         TEXT    NOT NULL DEFAULT 'id',
  source           TEXT    NOT NULL DEFAULT 'ai_asr' CHECK (source IN ('manual','ai_asr','ocr','imported_srt','imported_vtt','tts')),
  style_id         TEXT REFERENCES text_styles(style_id) ON DELETE SET NULL,
  name             TEXT,
  is_translated_from TEXT,                                        -- kode bahasa sumber (S-14)
  is_burned_in     INTEGER NOT NULL DEFAULT 1 CHECK (is_burned_in IN (0,1)),
  is_enabled       INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  diarization_enabled INTEGER NOT NULL DEFAULT 0 CHECK (diarization_enabled IN (0,1)),
  ai_job_id        TEXT,                                          -- job ASR sumber
  created_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_caption_tracks_project ON caption_tracks(project_id, language);

CREATE TABLE IF NOT EXISTS caption_segments (
  segment_id        TEXT    NOT NULL PRIMARY KEY,
  caption_track_id  TEXT    NOT NULL REFERENCES caption_tracks(caption_track_id) ON DELETE CASCADE,
  start_ms          INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms            INTEGER NOT NULL CHECK (end_ms > start_ms),
  text              TEXT    NOT NULL DEFAULT '',
  speaker_label     TEXT,
  word_timings_json TEXT CHECK (word_timings_json IS NULL OR json_valid(word_timings_json)),  -- karaoke S-08
  confidence        REAL    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  is_edited         INTEGER NOT NULL DEFAULT 0 CHECK (is_edited IN (0,1)),
  is_low_confidence INTEGER NOT NULL DEFAULT 0 CHECK (is_low_confidence IN (0,1)),
  order_index       INTEGER NOT NULL DEFAULT 0,
  style_override_json TEXT CHECK (style_override_json IS NULL OR json_valid(style_override_json)),
  created_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (caption_track_id, start_ms)
);

CREATE INDEX IF NOT EXISTS idx_caption_segments_track ON caption_segments(caption_track_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_caption_segments_lowconf
  ON caption_segments(caption_track_id, confidence) WHERE is_low_confidence = 1;

-- =====================================================================================
--  BAGIAN 9 — AUDIO (M9)
-- =====================================================================================

-- 9.1 audio_clips — dipisah dari `clips` (keputusan #12): fade/ducking/pitch/voiceover, tanpa transform.
CREATE TABLE IF NOT EXISTS audio_clips (
  audio_clip_id     TEXT    NOT NULL PRIMARY KEY,
  track_id          TEXT    NOT NULL REFERENCES tracks(track_id) ON DELETE CASCADE,
  media_asset_id    TEXT    NOT NULL REFERENCES media_assets(asset_id) ON DELETE RESTRICT,
  music_id          TEXT REFERENCES music_assets(music_id) ON DELETE SET NULL,  -- bila berasal dari katalog (A-07)
  "index"           INTEGER NOT NULL DEFAULT 0 CHECK ("index" >= 0),
  src_in_ms         INTEGER NOT NULL DEFAULT 0 CHECK (src_in_ms >= 0),
  src_out_ms        INTEGER NOT NULL CHECK (src_out_ms >= src_in_ms),
  timeline_start_ms INTEGER NOT NULL DEFAULT 0 CHECK (timeline_start_ms >= 0),
  duration_ms       INTEGER NOT NULL CHECK (duration_ms > 0),
  speed             REAL    NOT NULL DEFAULT 1 CHECK (speed > 0 AND speed <= 100),
  volume            REAL    NOT NULL DEFAULT 1 CHECK (volume >= 0 AND volume <= 4),
  fade_in_ms        INTEGER NOT NULL DEFAULT 0 CHECK (fade_in_ms  >= 0),
  fade_out_ms       INTEGER NOT NULL DEFAULT 0 CHECK (fade_out_ms >= 0),
  is_muted          INTEGER NOT NULL DEFAULT 0 CHECK (is_muted IN (0,1)),
  pitch_semitones   REAL    NOT NULL DEFAULT 0 CHECK (pitch_semitones >= -24 AND pitch_semitones <= 24),
  is_voiceover      INTEGER NOT NULL DEFAULT 0 CHECK (is_voiceover IN (0,1)),
  is_reversed       INTEGER NOT NULL DEFAULT 0 CHECK (is_reversed IN (0,1)),
  ducking_json      TEXT CHECK (ducking_json IS NULL OR json_valid(ducking_json)),  -- A-13
  linked_clip_id    TEXT REFERENCES clips(clip_id) ON DELETE SET NULL,              -- hasil detach audio (#27)
  is_enabled        INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  is_locked         INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  created_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_audio_clips_track   ON audio_clips(track_id, timeline_start_ms);
CREATE INDEX IF NOT EXISTS idx_audio_clips_media   ON audio_clips(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_audio_clips_music   ON audio_clips(music_id) WHERE music_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_clips_linked  ON audio_clips(linked_clip_id) WHERE linked_clip_id IS NOT NULL;

-- 9.2 audio_effects — N:1 AudioClip (denoise/EQ/compressor/ducking/normalize).
CREATE TABLE IF NOT EXISTS audio_effects (
  audio_effect_id TEXT    NOT NULL PRIMARY KEY,
  audio_clip_id   TEXT    NOT NULL REFERENCES audio_clips(audio_clip_id) ON DELETE CASCADE,
  effect_type     TEXT    NOT NULL CHECK (effect_type IN
                    ('denoise','eq','compressor','limiter','normalize','ducking','reverb','pitch','highpass','lowpass','gain')),
  order_index     INTEGER NOT NULL DEFAULT 0,
  params_json     TEXT    NOT NULL DEFAULT '{}' CHECK (json_valid(params_json)),
  is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_audio_effects_clip ON audio_effects(audio_clip_id, order_index);

-- 9.3 voiceovers — 1:1 AudioClip hasil rekaman (A-08) atau TTS (A-15).
CREATE TABLE IF NOT EXISTS voiceovers (
  voiceover_id   TEXT    NOT NULL PRIMARY KEY,
  audio_clip_id  TEXT    NOT NULL UNIQUE REFERENCES audio_clips(audio_clip_id) ON DELETE CASCADE,
  recorded_at    INTEGER,
  mic_source     TEXT,
  script_text    TEXT,
  source         TEXT    NOT NULL DEFAULT 'record' CHECK (source IN ('record','tts','imported')),
  tts_voice      TEXT,
  tts_language   TEXT,
  ai_job_id      TEXT,
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- =====================================================================================
--  BAGIAN 10 — AI CORE (M12): chat, perintah, EditPlan, job cloud & cache
-- =====================================================================================

-- 10.1 ai_conversations — chat assistant multi-turn sadar proyek (G-19, ≥ 8 turn konteks).
CREATE TABLE IF NOT EXISTS ai_conversations (
  conversation_id TEXT    NOT NULL PRIMARY KEY,
  project_id      TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  title           TEXT,
  model           TEXT    NOT NULL DEFAULT 'gemini-2.5-flash',
  turn_count      INTEGER NOT NULL DEFAULT 0 CHECK (turn_count >= 0),        -- dijaga trigger
  tokens_used     INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  tokens_saved_by_cache INTEGER NOT NULL DEFAULT 0 CHECK (tokens_saved_by_cache >= 0),
  context_summary TEXT,                                                       -- ringkasan konteks (hemat token)
  is_archived     INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  last_message_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_project ON ai_conversations(project_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user    ON ai_conversations(user_id, last_message_at DESC);

-- 10.2 ai_messages — riwayat pesan (riwayat prompt ≥ 50, G-29).
CREATE TABLE IF NOT EXISTS ai_messages (
  message_id      TEXT    NOT NULL PRIMARY KEY,
  conversation_id TEXT    NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
  role            TEXT    NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content_type    TEXT    NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','command','plan','result','clarification','error')),
  content         TEXT    NOT NULL DEFAULT '',
  structured_json TEXT CHECK (structured_json IS NULL OR json_valid(structured_json)),
  ai_command_id   TEXT,                                                       -- dialog → perintah yang dihasilkan
  confidence      REAL    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  cache_hit       INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0,1)),
  model           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);

-- 10.3 prompt_templates — prompt library & favorit (G-28, perintah #218; ≥ 50 prompt).
CREATE TABLE IF NOT EXISTS prompt_templates (
  prompt_id    TEXT    NOT NULL PRIMARY KEY,
  user_id      TEXT REFERENCES users(user_id)    ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(project_id) ON DELETE CASCADE,       -- NULL = lintas proyek
  title        TEXT    NOT NULL,
  prompt_text  TEXT    NOT NULL,
  category     TEXT,
  command_ref  INTEGER CHECK (command_ref IS NULL OR (command_ref BETWEEN 1 AND 251)),
  is_favorite  INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  usage_count  INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_list ON prompt_templates(user_id, category, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_fav
  ON prompt_templates(user_id, last_used_at DESC) WHERE is_favorite = 1;

-- 10.4 ai_commands — setiap perintah AI, WAJIB punya command_ref (#1–#251) untuk audit cakupan §8
--      (§11.6 #6). Satu AICommand = satu grup UndoRecord bila diterapkan (§11.6 #7).
CREATE TABLE IF NOT EXISTS ai_commands (
  command_id      TEXT    NOT NULL PRIMARY KEY,
  project_id      TEXT REFERENCES projects(project_id) ON DELETE CASCADE,    -- boleh NULL (perintah tanpa proyek)
  user_id         TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES ai_conversations(conversation_id) ON DELETE SET NULL,
  message_id      TEXT REFERENCES ai_messages(message_id) ON DELETE SET NULL,
  raw_text        TEXT    NOT NULL CHECK (length(trim(raw_text)) > 0),
  normalized_text TEXT,
  input_mode      TEXT    NOT NULL DEFAULT 'text' CHECK (input_mode IN ('text','voice','template','system')),
  language        TEXT    NOT NULL DEFAULT 'auto' CHECK (language IN ('id','en','auto','mixed')),
  intent          TEXT,
  command_ref     INTEGER CHECK (command_ref IS NULL OR (command_ref BETWEEN 1 AND 251)),
  command_group   TEXT,                                                       -- A..O (grup perintah §6.1.1)
  classified_ops_json TEXT CHECK (classified_ops_json IS NULL OR json_valid(classified_ops_json)),
  operation_class TEXT    CHECK (operation_class IS NULL OR operation_class IN ('D','N')),
  status          TEXT    NOT NULL DEFAULT 'received' CHECK (status IN
                    ('received','parsing','parsed','needs_clarification','awaiting_confirm','previewing',
                     'applying','applied','rejected','queued','failed','cancelled')),
  queued_reason   TEXT    CHECK (queued_reason IS NULL OR queued_reason IN ('none','offline','limit','consent')),
  confidence      REAL    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  clarification_question TEXT,
  options_json    TEXT CHECK (options_json IS NULL OR json_valid(options_json)),
  refinement_of_command_id TEXT REFERENCES ai_commands(command_id) ON DELETE SET NULL,   -- G-25 delta
  error_code      TEXT,
  latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  cache_hit       INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  applied_at      INTEGER
);

-- Audit cakupan §8: hitung pemakaian per nomor perintah kanonik.
CREATE INDEX IF NOT EXISTS idx_ai_commands_ref      ON ai_commands(command_ref, status);
CREATE INDEX IF NOT EXISTS idx_ai_commands_project  ON ai_commands(project_id, created_at DESC);
-- Riwayat prompt (G-29) & antrean offline (G-33).
CREATE INDEX IF NOT EXISTS idx_ai_commands_queue
  ON ai_commands(status, created_at) WHERE status IN ('queued','needs_clarification','awaiting_confirm');
CREATE INDEX IF NOT EXISTS idx_ai_commands_group    ON ai_commands(command_group, created_at DESC);

-- 10.5 edit_plans — EditPlan tervalidasi Zod sebelum apply (AC-8, PR-3). AI TIDAK pernah menulis
--      langsung ke timeline (§11.6 #4): rencana ada di sini, penerapan terjadi lewat operasi domain.
CREATE TABLE IF NOT EXISTS edit_plans (
  plan_id          TEXT    NOT NULL PRIMARY KEY,
  command_id       TEXT    NOT NULL UNIQUE REFERENCES ai_commands(command_id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  ops_json         TEXT    NOT NULL CHECK (json_valid(ops_json)),
  plan_version     INTEGER NOT NULL DEFAULT 1 CHECK (plan_version >= 1),
  is_destructive   INTEGER NOT NULL DEFAULT 0 CHECK (is_destructive IN (0,1)),
  requires_confirm INTEGER NOT NULL DEFAULT 0 CHECK (requires_confirm IN (0,1)),
  is_user_modified INTEGER NOT NULL DEFAULT 0 CHECK (is_user_modified IN (0,1)),   -- G-23 toggle/ubah urutan
  diff_summary     TEXT    CHECK (diff_summary IS NULL OR length(diff_summary) <= 400),
  storyboard_json  TEXT CHECK (storyboard_json IS NULL OR json_valid(storyboard_json)),  -- G-32 thumbnail/klip
  step_count       INTEGER NOT NULL DEFAULT 0 CHECK (step_count >= 0),
  undo_group_id    TEXT,                                                      -- = undo_records.group_id saat apply
  applied_at       INTEGER,
  rejected_at      INTEGER,
  rejection_reason TEXT,
  model            TEXT,
  tokens_input     INTEGER NOT NULL DEFAULT 0 CHECK (tokens_input  >= 0),
  tokens_output    INTEGER NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
  created_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_edit_plans_project ON edit_plans(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edit_plans_pending
  ON edit_plans(project_id, created_at DESC) WHERE applied_at IS NULL AND rejected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_edit_plans_undo_group ON edit_plans(undo_group_id) WHERE undo_group_id IS NOT NULL;

-- 10.6 ai_jobs — pekerjaan AI berat & async via backend proxy (G-33). Boleh diantre saat offline.
CREATE TABLE IF NOT EXISTS ai_jobs (
  job_id        TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  command_id    TEXT REFERENCES ai_commands(command_id) ON DELETE SET NULL,
  job_type      TEXT    NOT NULL CHECK (job_type IN
                  ('scene_detect','asr','highlight','ocr','metadata','thumbnail','reframe','translate',
                   'tts','montage','search','index_asset','vision_color','script','moderation','qa','chat','parse_command')),
  status        TEXT    NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','running','succeeded','failed','cancelled','expired')),
  queued_reason TEXT    CHECK (queued_reason IS NULL OR queued_reason IN ('none','offline','limit','consent')),
  progress      REAL    NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  input_ref     TEXT,                                                          -- assetId/clipId/hash
  params_json   TEXT CHECK (params_json IS NULL OR json_valid(params_json)),
  result_ref    TEXT,                                                          -- cache key / file uri
  result_json   TEXT CHECK (result_json IS NULL OR json_valid(result_json)),    -- hasil kecil inline
  result_summary TEXT,
  remote_job_id TEXT,                                                          -- id job di backend (Stage 7)
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts  INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  cache_hit     INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0,1)),
  tokens_input  INTEGER NOT NULL DEFAULT 0 CHECK (tokens_input  >= 0),
  tokens_output INTEGER NOT NULL DEFAULT 0 CHECK (tokens_output >= 0),
  latency_ms    INTEGER,
  error_code    TEXT,
  error_message TEXT,
  is_retryable  INTEGER NOT NULL DEFAULT 0 CHECK (is_retryable IN (0,1)),
  started_at    INTEGER,
  finished_at   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (progress >= 0 AND progress <= 1)
);

-- Polling status hanya menyentuh job aktif (background worker + UI progress).
CREATE INDEX IF NOT EXISTS idx_ai_jobs_active
  ON ai_jobs(status, created_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_ai_jobs_project ON ai_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_type    ON ai_jobs(job_type, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_remote  ON ai_jobs(remote_job_id) WHERE remote_job_id IS NOT NULL;

-- 10.7 ai_result_cache — mencegah biaya berulang (AC-11, target ≥ 60% cache hit).
--      Kunci = SHA-256(jobType + normalizedInput + modelVersion) — api-contract §3.5. Global (lintas proyek).
CREATE TABLE IF NOT EXISTS ai_result_cache (
  cache_id       TEXT    NOT NULL PRIMARY KEY,
  content_hash   TEXT    NOT NULL,
  job_type       TEXT    NOT NULL,
  model_version  TEXT    NOT NULL DEFAULT 'gemini-2.5-flash',
  params_hash    TEXT,
  result_blob_ref TEXT,                                                        -- file besar (di cache/)
  result_json    TEXT CHECK (result_json IS NULL OR json_valid(result_json)),   -- hasil kecil inline
  result_mime    TEXT,
  size_bytes     INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  hit_count      INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  last_hit_at    INTEGER,
  project_id     TEXT REFERENCES projects(project_id) ON DELETE SET NULL,       -- asal pembuatan (diagnostik)
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  expires_at     INTEGER,
  UNIQUE (content_hash, job_type, model_version)
);

-- Eviction LRU (auto-evict batas 2 GB, NFR Penyimpanan).
CREATE INDEX IF NOT EXISTS idx_ai_result_cache_lru     ON ai_result_cache(last_hit_at, hit_count);
CREATE INDEX IF NOT EXISTS idx_ai_result_cache_expires ON ai_result_cache(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================================================
--  BAGIAN 11 — TRACKING ENGINE (M14) ★ INTI — SATU SUMBER KEBENARAN
-- -------------------------------------------------------------------------------------
--  Output tracking = transform per frame (`tracking_keyframes`). Konsumen (teks/sticker/efek/mask/
--  cutout/kamera/overlay/particle) TIDAK menyimpan data gerak sendiri — semuanya membaca lewat
--  `tracking_bindings` (§11.6 #10, ADR-004).
--  Invalidasi (TR-15): bila klip dipotong/di-speed/di-reverse/diganti media → target ditandai
--  `is_invalid = 1` + `status = 'invalid'`; binding TETAP hidup dengan `needs_retrack = 1`.
-- =====================================================================================

-- 11.1 tracking_sessions — job tracking LOKAL (bukan AIJob cloud), dapat dibatalkan & diproses batch.
CREATE TABLE IF NOT EXISTS tracking_sessions (
  session_id    TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  clip_id       TEXT    NOT NULL REFERENCES clips(clip_id) ON DELETE CASCADE,
  mode          TEXT    NOT NULL DEFAULT 'realtime_preview'
                        CHECK (mode IN ('realtime_preview','offline_batch','re_analyze','refine_segment')),
  status        TEXT    NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','analyzing','done','partial','failed','cancelled')),
  progress      REAL    NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  targets_json  TEXT CHECK (targets_json IS NULL OR json_valid(targets_json)),   -- spesifikasi target (TR-01..TR-08)
  analyzer      TEXT,                                                            -- mediapipe/optical_flow/hybrid
  model_version TEXT,
  frame_total   INTEGER CHECK (frame_total IS NULL OR frame_total >= 0),
  frame_done    INTEGER NOT NULL DEFAULT 0 CHECK (frame_done >= 0),
  inference_stride INTEGER NOT NULL DEFAULT 1 CHECK (inference_stride >= 1),     -- degradasi low-end (tiap N frame)
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
  invalidated_by_edit INTEGER NOT NULL DEFAULT 0 CHECK (invalidated_by_edit IN (0,1)),
  error_code    TEXT,
  error_message TEXT,
  started_at    INTEGER,
  finished_at   INTEGER,
  duration_ms   INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  render_time_ms INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_clip   ON tracking_sessions(clip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_active
  ON tracking_sessions(status, created_at) WHERE status IN ('queued','analyzing');
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_project ON tracking_sessions(project_id, created_at DESC);

-- 11.2 tracking_targets — satu target = satu subjek/objek terlacak (TR-01..TR-08).
CREATE TABLE IF NOT EXISTS tracking_targets (
  target_id       TEXT    NOT NULL PRIMARY KEY,
  project_id      TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  clip_id         TEXT    NOT NULL REFERENCES clips(clip_id) ON DELETE CASCADE,
  session_id      TEXT REFERENCES tracking_sessions(session_id) ON DELETE SET NULL,
  target_type     TEXT    NOT NULL CHECK (target_type IN
                    ('manual_point','manual_area','motion','face','hand','pose','gesture','multi_object',
                     'object','segment','camera','text')),
  subject_label   TEXT,                                                          -- "wajah #1", "tangan kiri", "sepatu"
  subject_ref     TEXT,                                                          -- opsional: asset/subject id
  source          TEXT    NOT NULL DEFAULT 'hybrid'
                          CHECK (source IN ('mediapipe','optical_flow','hybrid','manual','ai_cloud')),
  tracking_mode   TEXT    NOT NULL DEFAULT 'realtime' CHECK (tracking_mode IN ('realtime','batch')),
  track_start_ms  INTEGER CHECK (track_start_ms IS NULL OR track_start_ms >= 0),
  track_end_ms    INTEGER CHECK (track_end_ms   IS NULL OR track_end_ms   >= 0),
  frame_start     INTEGER,
  frame_end       INTEGER,
  frame_count     INTEGER NOT NULL DEFAULT 0 CHECK (frame_count >= 0),
  is_cached       INTEGER NOT NULL DEFAULT 0 CHECK (is_cached IN (0,1)),          -- re-use cache (D-13, 0 ms)
  cache_key       TEXT,
  avg_confidence  REAL    CHECK (avg_confidence IS NULL OR (avg_confidence >= 0 AND avg_confidence <= 1)),
  min_confidence  REAL    CHECK (min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)),
  drift_ratio     REAL    CHECK (drift_ratio IS NULL OR drift_ratio >= 0),        -- ≤ 2% face/point, ≤ 3% area (NFR)
  is_user_corrected INTEGER NOT NULL DEFAULT 0 CHECK (is_user_corrected IN (0,1)), -- TR-14
  smoothing_level INTEGER NOT NULL DEFAULT 0 CHECK (smoothing_level IN (0,1,2)),
  offset_x        REAL    NOT NULL DEFAULT 0,
  offset_y        REAL    NOT NULL DEFAULT 0,
  scale_adj       REAL    NOT NULL DEFAULT 1 CHECK (scale_adj <> 0),
  rotation_adj    REAL    NOT NULL DEFAULT 0,
  anchor_json     TEXT CHECK (anchor_json IS NULL OR json_valid(anchor_json)),    -- landmark/landmark-set referensi
  is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  -- Status & invalidasi (TR-15)
  status          TEXT    NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','partial','lost','invalid','retracking')),
  is_invalid      INTEGER NOT NULL DEFAULT 0 CHECK (is_invalid IN (0,1)),
  invalidation_reason TEXT CHECK (invalidation_reason IS NULL OR invalidation_reason IN
                        ('clip_trim','clip_speed','clip_reverse','media_replaced','media_relinked','manual','reanalyze')),
  invalidated_at  INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (track_end_ms IS NULL OR track_start_ms IS NULL OR track_end_ms >= track_start_ms)
);

CREATE INDEX IF NOT EXISTS idx_tracking_targets_clip    ON tracking_targets(clip_id, target_type);
CREATE INDEX IF NOT EXISTS idx_tracking_targets_project ON tracking_targets(project_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_tracking_targets_session ON tracking_targets(session_id) WHERE session_id IS NOT NULL;
-- Badge "perlu lacak ulang" (TR-15) & panel target.
CREATE INDEX IF NOT EXISTS idx_tracking_targets_invalid
  ON tracking_targets(project_id, invalidated_at) WHERE is_invalid = 1;
CREATE INDEX IF NOT EXISTS idx_tracking_targets_cache
  ON tracking_targets(cache_key) WHERE cache_key IS NOT NULL AND is_cached = 1;

-- 11.3 tracking_keyframes — TRANSFORM PER FRAME. Inilah "kebijakan tunggal" untuk semua konsumen.
--      `data_json` berisi point/transform/quad/landmark/skeleton/matte_ref sesuai target_type.
CREATE TABLE IF NOT EXISTS tracking_keyframes (
  tk_id            TEXT    NOT NULL PRIMARY KEY,
  target_id        TEXT    NOT NULL REFERENCES tracking_targets(target_id) ON DELETE CASCADE,
  frame_index      INTEGER NOT NULL CHECK (frame_index >= 0),
  time_ms          INTEGER NOT NULL CHECK (time_ms >= 0),
  data_json        TEXT    NOT NULL CHECK (json_valid(data_json)),
  -- Kolom turunan yang di-indexkan agar solver/render tidak perlu mem-parse JSON di jalur panas:
  x                REAL,
  y                REAL,
  scale            REAL,
  rotation         REAL,
  confidence       REAL    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  is_manual        INTEGER NOT NULL DEFAULT 0 CHECK (is_manual IN (0,1)),        -- koreksi user (TR-14)
  is_keyframe      INTEGER NOT NULL DEFAULT 0 CHECK (is_keyframe IN (0,1)),      -- ditandai user (diamond)
  smoothing_applied INTEGER NOT NULL DEFAULT 0 CHECK (smoothing_applied IN (0,1)),
  is_occluded      INTEGER NOT NULL DEFAULT 0 CHECK (is_occluded IN (0,1)),
  source           TEXT    CHECK (source IS NULL OR source IN ('mediapipe','optical_flow','hybrid','manual','interpolated')),
  created_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (target_id, frame_index)
);

-- Jalur panas: baca seluruh lintasan satu target berurutan waktu (render & overlay realtime).
CREATE INDEX IF NOT EXISTS idx_tracking_keyframes_target ON tracking_keyframes(target_id, frame_index);
CREATE INDEX IF NOT EXISTS idx_tracking_keyframes_time   ON tracking_keyframes(target_id, time_ms);
-- Editor TR-14 hanya menampilkan keyframe yang ditandai/dikoreksi.
CREATE INDEX IF NOT EXISTS idx_tracking_keyframes_edited
  ON tracking_keyframes(target_id, time_ms) WHERE is_manual = 1 OR is_keyframe = 1;

-- 11.4 tracking_bindings — jembatan target → konsumen. Inilah yang membuat teks/efek/mask "menempel"
--      pada subjek bergerak (TR-09..TR-13). `consumer_id` POLIMORFIK (tanpa FK) — integritas dijaga
--      aplikasi + view `v_orphan_bindings`; dibatasi UNIQUE per (target, tipe consumer, id consumer).
CREATE TABLE IF NOT EXISTS tracking_bindings (
  binding_id      TEXT    NOT NULL PRIMARY KEY,
  project_id      TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  target_id       TEXT    NOT NULL REFERENCES tracking_targets(target_id) ON DELETE CASCADE,
  consumer_type   TEXT    NOT NULL CHECK (consumer_type IN
                    ('text','sticker','effect','mask','cutout','camera','overlay','particle','audio_spectrum')),
  consumer_id     TEXT    NOT NULL,
  attach_anchor   TEXT    NOT NULL DEFAULT 'center' CHECK (attach_anchor IN
                    ('center','head','face','hand_l','hand_r','shoulder','top','bottom','left','right','point','quad')),
  offset_x        REAL    NOT NULL DEFAULT 0,
  offset_y        REAL    NOT NULL DEFAULT 0,
  scale_rel       REAL    NOT NULL DEFAULT 1 CHECK (scale_rel <> 0),
  rotation_rel    REAL    NOT NULL DEFAULT 0,
  smoothing_level INTEGER NOT NULL DEFAULT 0 CHECK (smoothing_level IN (0,1,2)),
  apply_scale     INTEGER NOT NULL DEFAULT 0 CHECK (apply_scale IN (0,1)),
  apply_rotation  INTEGER NOT NULL DEFAULT 0 CHECK (apply_rotation IN (0,1)),
  is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  needs_retrack   INTEGER NOT NULL DEFAULT 0 CHECK (needs_retrack IN (0,1)),    -- target invalid → "perlu lacak ulang"
  start_ms        INTEGER CHECK (start_ms IS NULL OR start_ms >= 0),
  end_ms          INTEGER CHECK (end_ms   IS NULL OR end_ms   >= 0),
  is_ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (target_id, consumer_type, consumer_id),
  CHECK (end_ms IS NULL OR start_ms IS NULL OR end_ms >= start_ms)
);

CREATE INDEX IF NOT EXISTS idx_tracking_bindings_target  ON tracking_bindings(target_id, is_enabled);
-- Render/apply: "konsumen X diikat ke target mana?"
CREATE INDEX IF NOT EXISTS idx_tracking_bindings_consumer ON tracking_bindings(consumer_type, consumer_id);
CREATE INDEX IF NOT EXISTS idx_tracking_bindings_project  ON tracking_bindings(project_id, consumer_type);
CREATE INDEX IF NOT EXISTS idx_tracking_bindings_retrack
  ON tracking_bindings(project_id) WHERE needs_retrack = 1;

-- =====================================================================================
--  BAGIAN 12 — EXPORT & RENDER (M10)
-- -------------------------------------------------------------------------------------
--  TANPA kolom `has_watermark` — tidak ada watermark di produk ini (§11.5, keputusan v2.0).
-- =====================================================================================

CREATE TABLE IF NOT EXISTS export_jobs (
  job_id         TEXT    NOT NULL PRIMARY KEY,
  project_id     TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id        TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  preset_id      TEXT REFERENCES export_presets(preset_id) ON DELETE SET NULL,
  settings_source TEXT   NOT NULL DEFAULT 'manual' CHECK (settings_source IN ('manual','ai','template')),
  preset_name    TEXT,                                                          -- snapshot nama preset (audit)
  resolution     TEXT,
  width          INTEGER CHECK (width  IS NULL OR (width  > 0 AND width  <= 16384)),
  height         INTEGER CHECK (height IS NULL OR (height > 0 AND height <= 16384)),
  fps            REAL    CHECK (fps IS NULL OR (fps > 0 AND fps <= 240)),
  aspect_ratio   TEXT,
  bitrate_mode   TEXT    CHECK (bitrate_mode IS NULL OR bitrate_mode IN ('cbr','vbr','abr')),
  bitrate_kbps   INTEGER CHECK (bitrate_kbps IS NULL OR bitrate_kbps > 0),
  codec          TEXT,
  container      TEXT,
  audio_codec    TEXT,
  audio_bitrate_kbps INTEGER,
  hw_accel       TEXT    CHECK (hw_accel IS NULL OR hw_accel IN ('auto','nvenc','qsv','vaapi','videotoolbox','software')),
  is_fallback_to_software INTEGER NOT NULL DEFAULT 0 CHECK (is_fallback_to_software IN (0,1)),  -- R-13
  range_start_ms INTEGER,
  range_end_ms   INTEGER,
  status         TEXT    NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','running','paused','succeeded','failed','cancelled','interrupted')),
  progress       REAL    NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  stage          TEXT,                                                          -- prepare/render/encode/mux/finalize
  frame_total    INTEGER,
  frame_done     INTEGER NOT NULL DEFAULT 0 CHECK (frame_done >= 0),
  eta_ms         INTEGER,
  output_uri     TEXT,
  partial_output_uri TEXT,                                                       -- file parsial WAJIB dibersihkan (R-08)
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  is_bundled     INTEGER NOT NULL DEFAULT 0 CHECK (is_bundled IN (0,1)),
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
  error_code     TEXT,
  error_message  TEXT,
  is_retryable   INTEGER NOT NULL DEFAULT 0 CHECK (is_retryable IN (0,1)),
  estimated_size_bytes INTEGER,
  estimated_duration_ms INTEGER,
  duration_ms    INTEGER,                                                        -- durasi video hasil
  render_time_ms INTEGER,                                                        -- waktu render (NFR: ≤ 1.2x realtime 1080p30)
  started_at     INTEGER,
  finished_at    INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (range_end_ms IS NULL OR range_start_ms IS NULL OR range_end_ms > range_start_ms)
);

-- Taskbar/UI progress hanya menyentuh job aktif; riwayat export per proyek terbaru.
CREATE INDEX IF NOT EXISTS idx_export_jobs_active
  ON export_jobs(status, created_at) WHERE status IN ('queued','running','paused');
CREATE INDEX IF NOT EXISTS idx_export_jobs_project ON export_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_preset  ON export_jobs(preset_id) WHERE preset_id IS NOT NULL;

-- 12.1 thumbnail_renders — cover proyek & AI thumbnail (G-10), thumbnail strip timeline, storyboard (G-32).
CREATE TABLE IF NOT EXISTS thumbnail_renders (
  render_id   TEXT    NOT NULL PRIMARY KEY,
  project_id  TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  asset_id    TEXT REFERENCES media_assets(asset_id) ON DELETE CASCADE,
  clip_id     TEXT REFERENCES clips(clip_id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL DEFAULT 'asset'
                      CHECK (kind IN ('asset','clip','project_cover','storyboard','waveform','ai_cover','face_crop')),
  time_ms     INTEGER NOT NULL DEFAULT 0 CHECK (time_ms >= 0),
  uri         TEXT    NOT NULL,
  width       INTEGER, height INTEGER,
  size_bytes  INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  is_ai_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_cover IN (0,1)),
  is_selected_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_selected_cover IN (0,1)),
  ai_job_id   TEXT,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  CHECK (asset_id IS NOT NULL OR clip_id IS NOT NULL OR kind IN ('project_cover','ai_cover','storyboard'))
);

CREATE INDEX IF NOT EXISTS idx_thumbnail_renders_asset  ON thumbnail_renders(asset_id, time_ms);
CREATE INDEX IF NOT EXISTS idx_thumbnail_renders_clip   ON thumbnail_renders(clip_id, time_ms);
CREATE INDEX IF NOT EXISTS idx_thumbnail_renders_cover
  ON thumbnail_renders(project_id, kind, is_selected_cover);

-- 12.2 share_records — analitik "Bagikan" (R-09).
CREATE TABLE IF NOT EXISTS share_records (
  share_id      TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT REFERENCES projects(project_id)   ON DELETE CASCADE,
  export_job_id TEXT REFERENCES export_jobs(job_id)    ON DELETE CASCADE,
  target_app    TEXT,                                                             -- tiktok/instagram/youtube/filesystem
  method        TEXT    NOT NULL DEFAULT 'os_share' CHECK (method IN ('os_share','reveal_folder','copy_path','clipboard','export_archive')),
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_share_records_project ON share_records(project_id, created_at DESC);

-- =====================================================================================
--  BAGIAN 13 — UNDO / REDO
-- -------------------------------------------------------------------------------------
--  1 perintah AI = 1 grup undo (§11.6 #7): `group_id` sama untuk semua operasi hasil satu perintah,
--  `is_ai_generated = 1`, `ai_command_id` menunjuk AICommand. ≥ 50 langkah, latensi < 150 ms.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS undo_records (
  undo_id       TEXT    NOT NULL PRIMARY KEY,
  project_id    TEXT    NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  group_id      TEXT    NOT NULL,                                                 -- 1 operasi AI = 1 group
  sequence      INTEGER NOT NULL CHECK (sequence >= 0),                           -- urutan global per proyek
  action_type   TEXT    NOT NULL,                                                 -- trim/effectAdd/trackingBind/applyPlan/...
  op_type       TEXT,                                                             -- nama opType kanonik (api-contract §3.3)
  payload_json  TEXT NOT NULL CHECK (json_valid(payload_json)),                   -- state sesudah
  inverse_payload_json TEXT NOT NULL CHECK (json_valid(inverse_payload_json)),    -- state sebelum (untuk undo)
  summary       TEXT,                                                             -- teks manusia untuk UI undo
  is_ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_generated IN (0,1)),
  ai_command_id TEXT REFERENCES ai_commands(command_id) ON DELETE SET NULL,
  edit_plan_id  TEXT,
  affected_entity_type TEXT,
  affected_entity_ids_json TEXT CHECK (affected_entity_ids_json IS NULL OR json_valid(affected_entity_ids_json)),
  is_undone     INTEGER NOT NULL DEFAULT 0 CHECK (is_undone IN (0,1)),
  is_redone     INTEGER NOT NULL DEFAULT 0 CHECK (is_redone IN (0,1)),
  is_compacted  INTEGER NOT NULL DEFAULT 0 CHECK (is_compacted IN (0,1)),         -- digabung untuk hemat ruang
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (project_id, sequence)
);

-- Undo (Ctrl+Z) membaca urutan terbalik → index DESC pada (project_id, sequence) adalah jalur panasnya.
CREATE INDEX IF NOT EXISTS idx_undo_records_project ON undo_records(project_id, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_undo_records_group   ON undo_records(project_id, group_id);
CREATE INDEX IF NOT EXISTS idx_undo_records_ai      ON undo_records(ai_command_id) WHERE ai_command_id IS NOT NULL;

-- =====================================================================================
--  BAGIAN 14 — TRIGGER (penjaga konsistensi; tidak menggantikan logika aplikasi)
-- -------------------------------------------------------------------------------------
--  Alasan: kolom agregat yang didenormalisasi (keputusan #20) tidak boleh pernah drift, karena UI
--  memakainya langsung (badge jumlah media, jumlah aset per grup, durasi proyek pada daftar proyek).
--  Semua trigger dibuat dengan `IF NOT EXISTS` dan bersifat idempoten.
--  CATATAN: `PRAGMA recursive_triggers` DEFAULT OFF → tidak ada rekursi tak berujung.
-- =====================================================================================

-- 14.1 projects.updated_at — sentuh otomatis setiap kali baris proyek berubah.
--      Trigger ini tidak menghalangi aplikasi yang memang mengeset updated_at sendiri (WHEN …).
CREATE TRIGGER IF NOT EXISTS trg_projects_touch
AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE projects
     SET updated_at = (CAST(strftime('%s','now') AS INTEGER) * 1000)
   WHERE project_id = NEW.project_id;
END;

-- 14.2 projects.duration_ms — durasi total = clip terjauh (tanpa join di sisi UI).
CREATE TRIGGER IF NOT EXISTS trg_clips_duration_ai
AFTER INSERT ON clips
FOR EACH ROW
BEGIN
  UPDATE projects
     SET duration_ms = (
           SELECT COALESCE(MAX(c.timeline_start_ms + c.duration_ms), 0)
             FROM clips c
             JOIN tracks t ON t.track_id = c.track_id
            WHERE t.project_id = projects.project_id)
   WHERE project_id = (SELECT project_id FROM tracks WHERE track_id = NEW.track_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_clips_duration_ad
AFTER DELETE ON clips
FOR EACH ROW
BEGIN
  UPDATE projects
     SET duration_ms = (
           SELECT COALESCE(MAX(c.timeline_start_ms + c.duration_ms), 0)
             FROM clips c
             JOIN tracks t ON t.track_id = c.track_id
            WHERE t.project_id = projects.project_id)
   WHERE project_id = (SELECT project_id FROM tracks WHERE track_id = OLD.track_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_clips_duration_au
AFTER UPDATE OF timeline_start_ms, duration_ms, track_id ON clips
FOR EACH ROW
BEGIN
  UPDATE projects
     SET duration_ms = (
           SELECT COALESCE(MAX(c.timeline_start_ms + c.duration_ms), 0)
             FROM clips c
             JOIN tracks t ON t.track_id = c.track_id
            WHERE t.project_id = projects.project_id)
   WHERE project_id IN (SELECT project_id FROM tracks WHERE track_id IN (NEW.track_id, OLD.track_id));
END;

-- 14.3 media_folders.media_count
CREATE TRIGGER IF NOT EXISTS trg_media_assets_folder_count_ai
AFTER INSERT ON media_assets
FOR EACH ROW
WHEN NEW.folder_id IS NOT NULL
BEGIN
  UPDATE media_folders
     SET media_count = (SELECT COUNT(*) FROM media_assets WHERE folder_id = NEW.folder_id)
   WHERE folder_id = NEW.folder_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_assets_folder_count_ad
AFTER DELETE ON media_assets
FOR EACH ROW
WHEN OLD.folder_id IS NOT NULL
BEGIN
  UPDATE media_folders
     SET media_count = (SELECT COUNT(*) FROM media_assets WHERE folder_id = OLD.folder_id)
   WHERE folder_id = OLD.folder_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_assets_folder_count_au
AFTER UPDATE OF folder_id ON media_assets
FOR EACH ROW
WHEN NEW.folder_id IS NOT OLD.folder_id
BEGIN
  UPDATE media_folders
     SET media_count = (SELECT COUNT(*) FROM media_assets WHERE folder_id = OLD.folder_id)
   WHERE folder_id = OLD.folder_id;
  UPDATE media_folders
     SET media_count = (SELECT COUNT(*) FROM media_assets WHERE folder_id = NEW.folder_id)
   WHERE folder_id = NEW.folder_id;
END;

-- 14.4 media_groups.asset_count
CREATE TRIGGER IF NOT EXISTS trg_media_group_items_count_ai
AFTER INSERT ON media_group_items
FOR EACH ROW
BEGIN
  UPDATE media_groups
     SET asset_count = (SELECT COUNT(*) FROM media_group_items WHERE group_id = NEW.group_id)
   WHERE group_id = NEW.group_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_group_items_count_ad
AFTER DELETE ON media_group_items
FOR EACH ROW
BEGIN
  UPDATE media_groups
     SET asset_count = (SELECT COUNT(*) FROM media_group_items WHERE group_id = OLD.group_id)
   WHERE group_id = OLD.group_id;
END;

-- 14.5 ai_conversations.turn_count
CREATE TRIGGER IF NOT EXISTS trg_ai_messages_count_ai
AFTER INSERT ON ai_messages
FOR EACH ROW
BEGIN
  UPDATE ai_conversations
     SET turn_count      = (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = NEW.conversation_id),
         last_message_at = (CAST(strftime('%s','now') AS INTEGER) * 1000)
   WHERE conversation_id = NEW.conversation_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ai_messages_count_ad
AFTER DELETE ON ai_messages
FOR EACH ROW
BEGIN
  UPDATE ai_conversations
     SET turn_count = (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = OLD.conversation_id)
   WHERE conversation_id = OLD.conversation_id;
END;

-- 14.6 templates.slot_count
CREATE TRIGGER IF NOT EXISTS trg_template_slots_count_ai
AFTER INSERT ON template_slots
FOR EACH ROW
BEGIN
  UPDATE templates
     SET slot_count = (SELECT COUNT(*) FROM template_slots WHERE template_id = NEW.template_id)
   WHERE template_id = NEW.template_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_template_slots_count_ad
AFTER DELETE ON template_slots
FOR EACH ROW
BEGIN
  UPDATE templates
     SET slot_count = (SELECT COUNT(*) FROM template_slots WHERE template_id = OLD.template_id)
   WHERE template_id = OLD.template_id;
END;

-- =====================================================================================
--  BAGIAN 15 — VIEW (query siap pakai untuk main process & UI; tanpa logika tersembunyi)
-- =====================================================================================

-- 15.1 Ringkasan proyek untuk daftar proyek (P-03) + badge status.
CREATE VIEW IF NOT EXISTS v_project_overview AS
SELECT
  p.project_id,
  p.name,
  p.aspect_ratio,
  p.width,
  p.height,
  p.fps,
  p.duration_ms,
  p.media_mode,
  p.cover_uri,
  p.created_at,
  p.updated_at,
  p.last_opened_at,
  (SELECT COUNT(*) FROM tracks t WHERE t.project_id = p.project_id) AS track_count,
  (SELECT COUNT(*) FROM clips c JOIN tracks t2 ON t2.track_id = c.track_id
    WHERE t2.project_id = p.project_id)                              AS clip_count,
  (SELECT COUNT(*) FROM media_assets a WHERE a.project_id = p.project_id) AS asset_count,
  (SELECT COUNT(*) FROM media_assets a2
    WHERE a2.project_id = p.project_id AND a2.is_missing = 1)        AS missing_count,
  (SELECT COUNT(*) FROM tracking_targets tt
    WHERE tt.project_id = p.project_id AND tt.is_invalid = 1)        AS invalid_tracking_count,
  (SELECT COUNT(*) FROM ai_commands ac
    WHERE ac.project_id = p.project_id AND ac.status = 'queued')     AS queued_command_count
FROM projects p;

-- 15.2 Media hilang → penggerak dialog relink (R-15, 02-design §2.1). Index: idx_media_assets_missing.
CREATE VIEW IF NOT EXISTS v_missing_media AS
SELECT
  a.asset_id,
  a.project_id,
  a.display_name,
  a.uri,
  a.type,
  a.is_bundled,
  a.bundled_rel_uri,
  a.checksum,
  a.missing_since,
  a.last_seen_at,
  (SELECT COUNT(*) FROM clips c        WHERE c.media_asset_id  = a.asset_id) AS clip_ref_count,
  (SELECT COUNT(*) FROM audio_clips ac WHERE ac.media_asset_id = a.asset_id) AS audio_ref_count,
  (SELECT COUNT(*) FROM media_relink_history h WHERE h.asset_id = a.asset_id) AS relink_attempts
FROM media_assets a
WHERE a.is_missing = 1;

-- 15.3 Antrean indeks (P-12/P-14): aset yang belum / stale / gagal diindeks.
CREATE VIEW IF NOT EXISTS v_asset_index_pending AS
SELECT
  a.asset_id,
  a.project_id,
  a.display_name,
  a.type,
  a.uri,
  a.duration_ms,
  a.size_bytes,
  a.index_status,
  a.indexed_at,
  (SELECT i.detector_model_version FROM asset_insights i WHERE i.asset_id = a.asset_id) AS model_version
FROM media_assets a
WHERE a.is_missing = 0
  AND a.index_status IN ('none','queued','stale','failed');

-- 15.4 Bahan yang dibutuhkan render satu klip (join siap pakai; hindari SELECT * di jalur render).
CREATE VIEW IF NOT EXISTS v_clip_render_input AS
SELECT
  c.clip_id,
  t.project_id,
  c.track_id,
  t.type               AS track_type,
  c."index"            AS clip_index,
  c.media_asset_id,
  a.uri,
  a.bundled_rel_uri,
  a.is_bundled,
  a.is_missing,
  a.type               AS asset_type,
  c.src_in_ms,
  c.src_out_ms,
  c.timeline_start_ms,
  (c.timeline_start_ms + c.duration_ms) AS timeline_end_ms,
  c.duration_ms,
  c.speed,
  c.is_reversed,
  c.is_freeze,
  c.volume,
  ct.pos_x, ct.pos_y, ct.scale_x, ct.scale_y, ct.rotation, ct.flip_h, ct.flip_v,
  ct.crop_x, ct.crop_y, ct.crop_w, ct.crop_h, ct.opacity, ct.aspect_mode,
  cg.brightness, cg.contrast, cg.saturation, cg.temperature, cg.tint,
  cg.lut_id, cg.lut_intensity, cg.look_preset,
  (SELECT COUNT(*) FROM effect_instances e WHERE e.clip_id = c.clip_id AND e.is_enabled = 1) AS enabled_effect_count,
  (SELECT COUNT(*) FROM masks m          WHERE m.clip_id = c.clip_id AND m.is_enabled = 1) AS enabled_mask_count
FROM clips c
JOIN tracks        t  ON t.track_id  = c.track_id
JOIN media_assets  a  ON a.asset_id  = c.media_asset_id
LEFT JOIN clip_transforms ct ON ct.clip_id = c.clip_id
LEFT JOIN color_grades    cg ON cg.clip_id = c.clip_id
WHERE c.is_enabled = 1
  AND t.is_hidden = 0;

-- 15.5 Status target tracking untuk panel & badge (TR-14/TR-15).
CREATE VIEW IF NOT EXISTS v_tracking_target_status AS
SELECT
  tt.target_id,
  tt.project_id,
  tt.clip_id,
  tt.target_type,
  tt.subject_label,
  tt.status,
  tt.is_invalid,
  tt.is_enabled,
  tt.is_cached,
  tt.frame_count,
  tt.avg_confidence,
  tt.drift_ratio,
  tt.invalidation_reason,
  (SELECT COUNT(*) FROM tracking_keyframes tk WHERE tk.target_id = tt.target_id) AS keyframe_count,
  (SELECT COUNT(*) FROM tracking_keyframes tk2
    WHERE tk2.target_id = tt.target_id AND (tk2.is_manual = 1 OR tk2.is_keyframe = 1)) AS edited_keyframe_count,
  (SELECT COUNT(*) FROM tracking_bindings tb WHERE tb.target_id = tt.target_id) AS binding_count,
  (SELECT COUNT(*) FROM tracking_bindings tb2
    WHERE tb2.target_id = tt.target_id AND tb2.needs_retrack = 1) AS needs_retrack_count
FROM tracking_targets tt;

-- 15.6 Deteksi keyframe yatim. Wajib ada karena `keyframes` bersifat polimorfik (tanpa FK ke owner).
--      Dipakai oleh job pembersihan (maintenance) & uji integritas Stage 8.
CREATE VIEW IF NOT EXISTS v_orphan_keyframes AS
SELECT k.keyframe_id, k.project_id, k.owner_type, k.owner_id, k.property, k.time_ms
FROM keyframes k
WHERE
  (k.owner_type = 'clip'      AND NOT EXISTS (SELECT 1 FROM clips c            WHERE c.clip_id        = k.owner_id))
  OR (k.owner_type = 'effect' AND NOT EXISTS (SELECT 1 FROM effect_instances e WHERE e.effect_id      = k.owner_id))
  OR (k.owner_type = 'text'   AND NOT EXISTS (SELECT 1 FROM text_overlays t    WHERE t.text_overlay_id = k.owner_id))
  OR (k.owner_type = 'mask'   AND NOT EXISTS (SELECT 1 FROM masks m            WHERE m.mask_id        = k.owner_id))
  OR (k.owner_type = 'audio'  AND NOT EXISTS (SELECT 1 FROM audio_clips a      WHERE a.audio_clip_id  = k.owner_id))
  OR (k.owner_type = 'track'  AND NOT EXISTS (SELECT 1 FROM tracks t           WHERE t.track_id       = k.owner_id))
  OR (k.owner_type = 'tracking' AND NOT EXISTS (SELECT 1 FROM tracking_targets tt WHERE tt.target_id  = k.owner_id))
  OR (k.owner_type IN ('transform','color')
      AND NOT EXISTS (SELECT 1 FROM clips c2 WHERE c2.clip_id = k.owner_id));

-- 15.7 Deteksi binding yatim (consumer_id polimorfik tanpa FK).
CREATE VIEW IF NOT EXISTS v_orphan_bindings AS
SELECT b.binding_id, b.project_id, b.consumer_type, b.consumer_id, b.target_id
FROM tracking_bindings b
WHERE
  (b.consumer_type IN ('text','sticker')
     AND NOT EXISTS (SELECT 1 FROM text_overlays t WHERE t.text_overlay_id = b.consumer_id))
  OR (b.consumer_type IN ('effect','particle','audio_spectrum')
     AND NOT EXISTS (SELECT 1 FROM effect_instances e WHERE e.effect_id = b.consumer_id))
  OR (b.consumer_type = 'mask'
     AND NOT EXISTS (SELECT 1 FROM masks m WHERE m.mask_id = b.consumer_id))
  OR (b.consumer_type IN ('cutout','overlay','camera')
     AND NOT EXISTS (SELECT 1 FROM clips c WHERE c.clip_id = b.consumer_id));

-- 15.8 Audit cakupan perintah AI (§11.6 #6, §8 Coverage Matrix).
CREATE VIEW IF NOT EXISTS v_ai_command_coverage AS
SELECT
  ac.command_ref,
  COUNT(*)                                                   AS usage_count,
  COUNT(DISTINCT ac.project_id)                              AS project_count,
  SUM(CASE WHEN ac.status = 'applied' THEN 1 ELSE 0 END)     AS applied_count,
  SUM(CASE WHEN ac.status = 'failed'  THEN 1 ELSE 0 END)     AS failed_count,
  SUM(CASE WHEN ac.cache_hit = 1      THEN 1 ELSE 0 END)     AS cache_hit_count,
  MAX(ac.created_at)                                         AS last_used_at
FROM ai_commands ac
WHERE ac.command_ref IS NOT NULL
GROUP BY ac.command_ref;

-- 15.9 Nomor perintah kanonik (#1–#251) yang belum pernah dipakai → mengukur cakupan §8.
CREATE VIEW IF NOT EXISTS v_ai_command_gaps AS
WITH RECURSIVE refs(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM refs WHERE n < 251
)
SELECT n AS command_ref
FROM refs
WHERE NOT EXISTS (SELECT 1 FROM ai_commands ac WHERE ac.command_ref = refs.n);

-- 15.10 Semua pekerjaan asinkron yang aktif (satu query untuk status bar / taskbar progress).
CREATE VIEW IF NOT EXISTS v_active_jobs AS
SELECT 'export'   AS job_kind, job_id     AS job_id, project_id, status, progress, started_at, error_code FROM export_jobs   WHERE status IN ('queued','running','paused')
UNION ALL
SELECT 'ai'       AS job_kind, job_id     AS job_id, project_id, status, progress, started_at, error_code FROM ai_jobs       WHERE status IN ('queued','running')
UNION ALL
SELECT 'index'    AS job_kind, job_id     AS job_id, project_id, status, progress, started_at, error_code FROM index_jobs    WHERE status IN ('queued','running','paused')
UNION ALL
SELECT 'tracking' AS job_kind, session_id AS job_id, project_id, status, progress, started_at, error_code FROM tracking_sessions WHERE status IN ('queued','analyzing');

-- 15.11 Monitoring biaya AI per hari (RSK-02). [v1.2] + `provider` & `est_cost_usd` (ADR-04).
--       `est_cost_usd` = ESTIMASI biaya (bukan tagihan, bukan monetisasi in-app; api-contract §2.16);
--       NULL bila harga provider tak diketahui → kolom agregat 0 (UI tetap tampilkan token terpisah).
CREATE VIEW IF NOT EXISTS v_ai_usage_daily AS
SELECT
  date(created_at / 1000, 'unixepoch')            AS usage_day,
  provider,                                       -- [v1.2] id registry (NULL untuk baris v1 lama)
  job_type,
  COUNT(*)                                        AS request_count,
  SUM(cache_hit)                                  AS cache_hit_count,
  ROUND(100.0 * SUM(cache_hit) / COUNT(*), 2)     AS cache_hit_pct,
  SUM(input_tokens)                               AS input_tokens,
  SUM(output_tokens)                              AS output_tokens,
  ROUND(SUM(COALESCE(est_cost_usd, 0.0)), 6)      AS est_cost_usd,   -- [v1.2]
  ROUND(AVG(latency_ms), 1)                       AS avg_latency_ms
FROM ai_usage_records
GROUP BY usage_day, provider, job_type;

-- =====================================================================================
--  BAGIAN 16 — FTS5 (pencarian teks & momen)
-- -------------------------------------------------------------------------------------
--  Dipakai untuk G-08 (video Q&A / cari momen), filter OCR (S-11), dan pencarian caption.
--  JIKA build SQLite tanpa FTS5 (jarang pada better-sqlite3): lewati blok ini — aplikasi wajib
--  mendeteksi lebih dulu:
--      SELECT COUNT(*) FROM pragma_module_list WHERE name = 'fts5';
--  Fallback bila FTS5 tidak ada: LIKE %...% pada ocr_text/transcript_text (lebih lambat, tetap benar).
-- =====================================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS asset_insights_fts USING fts5(
  insight_id UNINDEXED,
  ocr_text,
  transcript_text,
  tokenize = 'unicode61 remove_diacritics 1'
);

CREATE VIRTUAL TABLE IF NOT EXISTS caption_segments_fts USING fts5(
  segment_id UNINDEXED,
  text,
  tokenize = 'unicode61 remove_diacritics 1'
);

-- Sinkronisasi FTS dijaga trigger (tabel FTS tidak boleh menyimpang dari tabel sumber).
CREATE TRIGGER IF NOT EXISTS trg_asset_insights_fts_ai
AFTER INSERT ON asset_insights
FOR EACH ROW
BEGIN
  INSERT INTO asset_insights_fts (insight_id, ocr_text, transcript_text)
  VALUES (NEW.insight_id, COALESCE(NEW.ocr_text, ''), COALESCE(NEW.transcript_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_insights_fts_au
AFTER UPDATE OF ocr_text, transcript_text ON asset_insights
FOR EACH ROW
BEGIN
  DELETE FROM asset_insights_fts WHERE insight_id = OLD.insight_id;
  INSERT INTO asset_insights_fts (insight_id, ocr_text, transcript_text)
  VALUES (NEW.insight_id, COALESCE(NEW.ocr_text, ''), COALESCE(NEW.transcript_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_insights_fts_ad
AFTER DELETE ON asset_insights
FOR EACH ROW
BEGIN
  DELETE FROM asset_insights_fts WHERE insight_id = OLD.insight_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_caption_segments_fts_ai
AFTER INSERT ON caption_segments
FOR EACH ROW
BEGIN
  INSERT INTO caption_segments_fts (segment_id, text) VALUES (NEW.segment_id, COALESCE(NEW.text, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_caption_segments_fts_au
AFTER UPDATE OF text ON caption_segments
FOR EACH ROW
BEGIN
  DELETE FROM caption_segments_fts WHERE segment_id = OLD.segment_id;
  INSERT INTO caption_segments_fts (segment_id, text) VALUES (NEW.segment_id, COALESCE(NEW.text, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_caption_segments_fts_ad
AFTER DELETE ON caption_segments
FOR EACH ROW
BEGIN
  DELETE FROM caption_segments_fts WHERE segment_id = OLD.segment_id;
END;

-- =====================================================================================
--  BAGIAN 17 — SEED IDEMPOTENT (katalog bawaan & profil guest)
-- -------------------------------------------------------------------------------------
--  Semua seed memakai `INSERT OR IGNORE` sehingga aman dijalankan ulang. ID deterministik
--  (bukan acak) supaya pembaruan katalog dari CDN dapat dipetakan ke baris yang sama.
-- =====================================================================================

-- 17.1 Catat migrasi inisial.
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, app_version, notes)
VALUES (1, 'initial_schema', CAST(strftime('%s','now') AS INTEGER) * 1000, '0.1.0',
        'Skema awal Stage 6 — entitas §11 spec v2.2 (AI-first + tracking-first, tanpa monetisasi)');

-- 17.2 Metadata database.
INSERT OR IGNORE INTO app_meta (key, value_json) VALUES
  ('schema_version',        '{"v":1}'),
  ('ai_model_default',      '{"model":"gemini-2.5-flash"}'),
  ('media_mode_default',    '{"mode":"reference"}'),
  ('cache_budget_bytes',    '{"v":2147483648}'),
  ('index_model_version',   '{"v":"mediapipe-1"}'),
  ('created_by',            '{"stage":"STAGE 6 DATABASE"}');

-- 17.3 Profil guest lokal (default; akun opsional).
INSERT OR IGNORE INTO users (user_id, display_name, locale, is_guest)
VALUES ('local-guest', 'Guest', 'id', 1);

-- 17.4 Preferensi default (hanya non-rahasia; token & backendBaseUrl ada di OS keychain).
INSERT OR IGNORE INTO user_settings (user_id, key, value_json) VALUES
  ('local-guest', 'ui.language',              '{"v":"id"}'),
  ('local-guest', 'ui.theme',                 '{"v":"dark"}'),
  ('local-guest', 'ui.timeline_zoom',         '{"v":1}'),
  ('local-guest', 'performance.gpu_tier',     '{"v":"auto"}'),
  ('local-guest', 'performance.preview_quality', '{"v":"auto"}'),
  ('local-guest', 'performance.hw_accel',     '{"v":"auto"}'),
  ('local-guest', 'performance.tracking_stride', '{"v":1}'),
  ('local-guest', 'performance.max_tracking_objects', '{"v":5}'),
  ('local-guest', 'autosave.interval_ms',     '{"v":3000}'),
  ('local-guest', 'autosave.max_checkpoints', '{"v":10}'),
  ('local-guest', 'undo.max_steps',           '{"v":50}'),
  ('local-guest', 'ai.default_language',      '{"v":"auto"}'),
  ('local-guest', 'ai.auto_queue_offline',    '{"v":true}'),
  ('local-guest', 'telemetry.opt_in',         '{"v":false}'),
  ('local-guest', 'export.default_preset_id', '{"v":"preset_tiktok_1080x1920"}'),
  ('local-guest', 'export.ask_ai_settings',   '{"v":true}'),
  ('local-guest', 'media.default_mode',       '{"v":"reference"}'),
  -- [v1.2] Preferensi privasi (ADR-05). 'privacy.mode' = standard|local-only|cloud.
  --        Kunci 'privacy.confirm.<provider>' dibuat ON-DEMAND saat pengguna menyetujui provider
  --        yang memakai tier-gratis untuk training (TIDAK diseed di sini agar tidak ambigu).
  ('local-guest', 'privacy.mode',             '{"v":"standard"}');

-- 17.5 Preset export bawaan (R-10). `is_builtin = 1` → tidak dapat dihapus pengguna.
INSERT OR IGNORE INTO export_presets
  (preset_id, name, target_platform, width, height, aspect_ratio, fps, codec, container,
   bitrate_mode, bitrate_kbps, audio_codec, audio_bitrate_kbps, hw_accel, is_builtin, sort_index)
VALUES
  ('preset_tiktok_1080x1920',  'TikTok 1080x1920',    'tiktok',    1080, 1920, '9:16', 30, 'h264', 'mp4', 'vbr', 8000,  'aac', 128, 'auto', 1, 10),
  ('preset_ig_reels_1080x1920','Instagram Reels',      'instagram', 1080, 1920, '9:16', 30, 'h264', 'mp4', 'vbr', 8000,  'aac', 128, 'auto', 1, 20),
  ('preset_yt_shorts_1080x1920','YouTube Shorts',      'youtube',   1080, 1920, '9:16', 30, 'h264', 'mp4', 'vbr', 10000, 'aac', 128, 'auto', 1, 30),
  ('preset_story_1080x1920',   'Story 1080x1920',      'instagram', 1080, 1920, '9:16', 30, 'h264', 'mp4', 'vbr', 8000,  'aac', 128, 'auto', 1, 40),
  ('preset_square_1080',       'Square 1080x1080',     'instagram', 1080, 1080, '1:1',  30, 'h264', 'mp4', 'vbr', 8000,  'aac', 128, 'auto', 1, 50),
  ('preset_youtube_1080p',     'YouTube 1080p',        'youtube',   1920, 1080, '16:9', 30, 'h264', 'mp4', 'vbr', 12000, 'aac', 192, 'auto', 1, 60),
  ('preset_youtube_4k',        'YouTube 4K',           'youtube',   3840, 2160, '16:9', 30, 'h265', 'mp4', 'vbr', 40000, 'aac', 192, 'auto', 1, 70),
  ('preset_custom',            'Custom',               'custom',    1080, 1920, '9:16', 30, 'h264', 'mp4', 'vbr', 8000,  'aac', 128, 'auto', 1, 99);

-- 17.6 Resep Auto-Mode bawaan (G-22; ≥ 8 resep). `plan_template_json` adalah KERANGKA —
--      pengisian ops lengkap dilakukan Stage 4 (prompt engineering) tanpa mengubah skema ini.
INSERT OR IGNORE INTO edit_recipes
  (recipe_id, name, description, mode, category, plan_template_json, required_asset_count, default_duration_ms, is_builtin)
VALUES
  ('recipe_vlog',      'Vlog',                'Rangkaian momen harian dengan musik',            'vlog',      'daily',     '{"ops":[]}', 3, 60000,  1),
  ('recipe_promo',     'Promo Produk',        'Highlight produk + harga + CTA',                 'promo',     'business',  '{"ops":[]}', 2, 30000,  1),
  ('recipe_tutorial',  'Tutorial',            'Struktur langkah dengan teks petunjuk',          'tutorial',  'education', '{"ops":[]}', 2, 90000,  1),
  ('recipe_quote',     'Quote',               'Satu foto + teks motivasi + musik',              'quote',     'social',    '{"ops":[]}', 1, 15000,  1),
  ('recipe_recap',     'Rekap Acara',         'Montage highlight acara',                        'recap',     'event',     '{"ops":[]}', 5, 90000,  1),
  ('recipe_slideshow', 'Slideshow',           'Foto berurutan mengikuti lagu',                  'slideshow', 'mixed',     '{"ops":[]}', 3, 30000,  1),
  ('recipe_story',     'Story',               'Format vertikal singkat bergaya story',          'story',     'social',    '{"ops":[]}', 1, 15000,  1),
  ('recipe_custom',    'Custom',              'Kerangka kosong untuk resep buatan pengguna',    'custom',    'custom',    '{"ops":[]}', 1, 60000,  1);

-- =====================================================================================
--  BAGIAN 18 — MIGRASI MAJU (pola wajib; §11.6 #9)
-- -------------------------------------------------------------------------------------
--  Aturan:
--    1. Setiap perubahan skema = file baru `migrations/00X_<nama>.sql`, TIDAK mengubah riwayat.
--    2. Naikkan `projects.schema_version`, `schema_migrations`, dan `app_meta.schema_version`.
--    3. Sebelum migrasi: backup `project.db` (bagian 19.1). Migrasi berjalan dalam SATU transaksi.
--    4. Gagal → rollback, catat ke `schema_migration_errors` dengan `ERR_DB_MIGRATION_FAILED`,
--       proyek tetap dapat dibuka dalam mode baca-saja (`projects.is_read_only = 1`).
--    5. Skema lebih BARU dari app (impor `.keylox` dari versi berikutnya) → JANGAN migrasi mundur:
--       set `is_read_only = 1` + pesan "update app" (api-contract §4.4).
--    6. Migrasi WAJIB maju saja (tanpa DOWN): rollback = restore backup/snapshot, bukan migrasi mundur.
--
--  Contoh migrasi versi 2 (TAMBAH kolom) — aman & cepat karena SQLite tidak menulis ulang tabel
--  selama DEFAULT berupa konstanta:
--
--    -- 001_001 -> 002_add_clip_motion_blur.sql
--    -- BEGIN;                    -- dibungkus transaksi oleh runner (better-sqlite3: db.transaction)
--    -- ALTER TABLE clips ADD COLUMN motion_blur_amount REAL NOT NULL DEFAULT 0;
--    -- ALTER TABLE clips ADD COLUMN is_audio_linked INTEGER NOT NULL DEFAULT 0 CHECK (is_audio_linked IN (0,1));
--    -- CREATE INDEX IF NOT EXISTS idx_clips_motion_blur ON clips(motion_blur_amount) WHERE motion_blur_amount > 0;
--    -- UPDATE projects SET schema_version = 2;
--    -- INSERT INTO schema_migrations (version, name, applied_at, notes) VALUES (2, 'add_clip_motion_blur', ..., '...');
--    -- COMMIT;
--
--  Contoh migrasi REWORK v1.2 (ADD kolom idempoten — guard `pragma_table_info`):
--    KENAPA di-guard: `ALTER TABLE ... ADD COLUMN` GAGAL bila kolom sudah ada (tidak ada IF NOT EXISTS
--    di SQLite). Karena file ini idempoten (dijalankan berkali-kali), guard berikut WAJIB:
--
--    -- 001_002 -> 003_ai_usage_provider_cost.sql   (dijalankan oleh runner dalam SATU transaksi)
--    --   const cols = db.prepare("SELECT name FROM pragma_table_info('ai_usage_records')").all().map(r=>r.name);
--    --   if (!cols.includes('provider'))     db.exec("ALTER TABLE ai_usage_records ADD COLUMN provider TEXT;");
--    --   if (!cols.includes('est_cost_usd')) db.exec("ALTER TABLE ai_usage_records ADD COLUMN est_cost_usd REAL;");
--    --   db.exec("CREATE INDEX IF NOT EXISTS idx_ai_usage_records_provider ON ai_usage_records(provider) WHERE provider IS NOT NULL;");
--    --   db.exec("CREATE INDEX IF NOT EXISTS idx_ai_usage_records_created_at ON ai_usage_records(created_at);");
--    --   db.exec("CREATE INDEX IF NOT EXISTS idx_ai_usage_records_provider_day ON ai_usage_records(provider, created_at) WHERE provider IS NOT NULL;");
--    --   db.exec("DROP VIEW IF EXISTS v_ai_usage_daily;");   -- view WAJIB di-drop lalu dibuat ulang
--    --   db.exec("<CREATE VIEW v_ai_usage_daily ... (versi v1.2, lihat BAGIAN 15.11)>");
--    --   db.exec("INSERT OR IGNORE INTO user_settings (user_id,key,value_json) VALUES ('local-guest','privacy.mode','{\"v\":\"standard\"}');");
--    --   db.exec("UPDATE projects SET schema_version = 3;");
--    --   db.exec("INSERT INTO schema_migrations (version,name,applied_at,notes) VALUES (3,'ai_usage_provider_cost',...,'rework v1.2');");
--
--    CATATAN: `ALTER TABLE ADD COLUMN` dengan nilai DEFAULT konstanta aman di SQLite (tidak menulis ulang
--    tabel). Kolom baru `provider`/`est_cost_usd` NULL-able → baris lama tetap valid. View tidak punya
--    `IF NOT EXISTS` untuk kolom baru, jadi view harus di-`DROP VIEW IF EXISTS` lalu dibuat ulang.
--
--  Contoh migrasi yang MENGUBAH CONSTRAINT (butuh 12-step rebuild — SQLite tidak punya ALTER CONSTRAINT):
--    1) PRAGMA foreign_keys = OFF;  (di luar transaksi)
--    2) BEGIN;
--    3) CREATE TABLE clips_new (...skema baru...);
--    4) INSERT INTO clips_new SELECT <kolom eksplisit> FROM clips;
--    5) DROP TABLE clips;
--    6) ALTER TABLE clips_new RENAME TO clips;
--    7) Buat ulang semua index & trigger milik `clips` (bagian 7.3 & 14.x);
--    8) COMMIT;
--    9) PRAGMA foreign_key_check;  → wajib kosong
--   10) PRAGMA foreign_keys = ON;
--   11) ANALYZE;
--  JANGAN lupa membuat ulang index: `DROP TABLE` ikut menghapus index & trigger miliknya.
--
--  Catatan versi skema per file:
--    * `app.db` memakai `schema_migrations` global + `app_meta.schema_version`.
--    * `project.db` (dalam .keylox) memakai `projects.schema_version` (satu baris proyek) + manifest.json.
--      Keduanya wajib sinkron saat ekspor: `manifest.schemaVersion` = `projects.schema_version`.
-- =====================================================================================

-- =====================================================================================
--  BAGIAN 19 — OPERASIONAL (backup, pemeliharaan, batas disk)
-- =====================================================================================

-- 19.1 Backup sebelum migrasi (wajib). better-sqlite3:
--        db.prepare("VACUUM INTO ?").run(backupPath);          -- aman & konsisten dengan WAL aktif
--      JANGAN menyalin file mentah saat WAL aktif tanpa file -wal/-shm.
--
-- 19.2 Pemeliharaan rutin (dijadwalkan saat idle, mis. setelah export selesai):
--        PRAGMA optimize;                 -- memperbarui statistik → query plan stabil
--        ANALYZE;                         -- setelah impor besar / indeks folder selesai
--        PRAGMA incremental_vacuum(1000);  -- auto_vacuum=INCREMENTAL (bagian 1)
--        VACUUM;                           -- hanya setelah hapus besar (proyek/aset massal), bukan tiap startup
--
-- 19.3 Batas disk (NFR: cache ≤ 2 GB, auto-evict). Kandidat eviction yang aman dihapus:
--        - thumbnail_renders (dapat dirender ulang)
--        - asset_insights + embedding_vectors (dapat dibangun ulang, §11.6 #5)
--        - ai_result_cache (kedaluwarsa: `expires_at < now`), dan `result_blob_ref` yang tak dirujuk
--        - project_snapshots lama (is_pinned = 0) → sisakan `autosave.max_checkpoints`
--        - tracking_keyframes dari target `is_invalid = 1` (opsional; lihat 20.2)
--      Query kandidat eviction (termuda dulu yang dibuang):
--        SELECT cache_id, size_bytes FROM ai_result_cache
--         WHERE expires_at IS NOT NULL AND expires_at < (CAST(strftime('%s','now') AS INTEGER) * 1000)
--         ORDER BY expires_at;
--
-- 19.4 Cek integritas (dipakai saat startup pasca-crash & oleh Stage 8 QA):
--        PRAGMA integrity_check;          -- harus 'ok'
--        PRAGMA foreign_key_check;        -- harus 0 baris
--        SELECT * FROM v_orphan_keyframes;      -- harus 0 baris
--        SELECT * FROM v_orphan_bindings;       -- harus 0 baris
-- =====================================================================================

-- =====================================================================================
--  BAGIAN 20 — PROSEDUR APLIKASI (transaksi wajib; dijalankan main process, bukan renderer)
-- -------------------------------------------------------------------------------------
--  Bagian ini adalah spesifikasi langkah di atas skema: urutan statement yang harus dijalankan
--  agar aturan §11.6 tetap benar meski aplikasi melakukan operasi kompleks.
-- =====================================================================================

-- 20.1 Hapus proyek (cascade penuh, §11.6 #2) — cukup satu statement karena FK CASCADE:
--        DELETE FROM projects WHERE project_id = ?;
--      Yang ikut terhapus otomatis: tracks → clips (+ clip_transforms, color_grades,
--      effect_instances, masks, chroma_keys, blends) → tracking_targets → tracking_keyframes/
--      tracking_bindings, text_overlays, caption_tracks → caption_segments, audio_clips →
--      audio_effects/voiceovers, ai_conversations/ai_commands/edit_plans/ai_jobs, index_jobs,
--      export_jobs → share_records, undo_records, project_snapshots, thumbnail_renders,
--      media_folders, media_groups → media_group_items, keyframes, dan
--      **media_assets milik proyek (project_id NOT NULL) → asset_insights, embedding_vectors,
--      media_relink_history** (aset = bagian dari proyek, §11.3).
--      Yang BERTAHAN: aset library global (`media_assets.project_id IS NULL`, mis. folder yang
--      dipindai tanpa proyek), katalog (templates/lut/effect_presets/music/presets/recipes),
--      cache AI lintas proyek (`ai_result_cache`), `users`/`user_settings`/`audit_logs`.
--      CATATAN: `clips.media_asset_id` memakai ON DELETE RESTRICT — ini bukan penghalang pada
--      cascade proyek (klip dan aset proyek dihapus dalam satu perintah), melainkan pelindung agar
--      menghapus SATU aset secara langsung (20.7) tidak pernah membuang klip diam-diam.

-- 20.2 Invalidasi tracking saat klip berubah (TR-15, §11.6 #11) — satu transaksi:
--        BEGIN;
--        UPDATE tracking_targets
--           SET is_invalid = 1,
--               status = 'invalid',
--               invalidation_reason = 'clip_trim',   -- clip_trim|clip_speed|clip_reverse|media_replaced
--               invalidated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
--         WHERE clip_id = ?;
--        UPDATE tracking_bindings
--           SET needs_retrack = 1
--         WHERE target_id IN (SELECT target_id FROM tracking_targets WHERE clip_id = ?);
--        COMMIT;
--      Binding TETAP hidup (menunjuk target) dengan badge "perlu lacak ulang"; pengguna dapat
--      me-re-track segmen (mode 're_analyze') tanpa kehilangan binding.

-- 20.3 Relink media hilang (R-15, prinsip `mediaMode` §0.2) — satu transaksi:
--        BEGIN;
--        -- 1) catat jejak sebelum ubah
--        INSERT INTO media_relink_history
--          (relink_id, asset_id, project_id, old_uri, new_uri, method, checksum_match)
--        SELECT ?, asset_id, project_id, uri, ?, 'manual',
--               CASE WHEN checksum IS NOT NULL AND checksum = ? THEN 1 ELSE 0 END
--          FROM media_assets WHERE asset_id = ?;
--        -- 2) perbarui referensi + bersihkan status hilang
--        UPDATE media_assets
--           SET uri = ?,
--               uri_scheme = 'file',
--               is_missing = 0,
--               missing_since = NULL,
--               last_seen_at = CAST(strftime('%s','now') AS INTEGER) * 1000,
--               probe_status = CASE WHEN probe_status = 'failed' THEN 'pending' ELSE probe_status END,
--               updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
--         WHERE asset_id = ?;
--        COMMIT;
--      Untuk `mediaMode = 'bundled'`, ubah `bundled_rel_uri` (dalam arsip) dan set `is_bundled = 1`;
--      `uri` tetap disimpan sebagai jejak asal. Insiden checksum berbeda → `checksum_match = 0` +
--      UI memperingatkan "file berbeda dari yang diimpor".
--      Relink massal: usulkan kandidat dari riwayat folder yang sama:
--        SELECT h.old_uri, h.new_uri FROM media_relink_history h
--         WHERE h.project_id = ? ORDER BY h.created_at DESC;

-- 20.4 Duplikat proyek (`project:duplicate`) — salin baris dengan ID baru, JANGAN menyalin media:
--        1) INSERT projects (… salinan kolom + project_id baru …);
--        2) tracks → clips → anak-anak (transform/grade/efek/mask/chroma/blend/keyframes);
--        3) media_assets DIBAGI PAKAI (tidak disalin) kecuali folder-nya berbeda;
--        4) tracking_targets ditandai `is_cached = 0`, `session_id = NULL` (lacak ulang bila perlu);
--        5) undo_records & project_snapshots TIDAK disalin (riwayat milik proyek asal).

-- 20.5 Autosave & snapshot (P-04; ≤ 3 s setelah perubahan, checkpoint ≥ 3):
--        BEGIN;
--        INSERT INTO project_snapshots (snapshot_id, project_id, version, trigger, state_blob_ref)
--        SELECT ?, ?, COALESCE(MAX(version), 0) + 1, ?, ? FROM project_snapshots WHERE project_id = ?;
--        DELETE FROM project_snapshots
--         WHERE project_id = ? AND is_pinned = 0
--           AND snapshot_id NOT IN (
--                 SELECT snapshot_id FROM project_snapshots
--                  WHERE project_id = ? ORDER BY created_at DESC LIMIT 10);
--        COMMIT;

-- 20.6 Export: bersihkan file parsial (R-08) & catat hasil:
--        UPDATE export_jobs
--           SET status = 'failed',
--               error_code = 'ERR_EXPORT_CANCELLED',
--               partial_output_uri = NULL,        -- file parsial sudah dihapus dari disk
--               finished_at = CAST(strftime('%s','now') AS INTEGER) * 1000
--         WHERE job_id = ?;

-- 20.7 Hapus satu aset (media:deleteAsset) tanpa menghapus proyek — urutan aman:
--        BEGIN;
--        UPDATE clips        SET media_asset_id = ? WHERE media_asset_id = ?;   -- hanya bila pengguna memilih "ganti media"
--        -- jika pengguna memilih "hapus klip": DELETE FROM clips WHERE media_asset_id = ?;
--        DELETE FROM media_assets WHERE asset_id = ?;   -- asset_insights/embedding/media_group_items ikut (CASCADE §11.6 #5)
--        COMMIT;
--      Klip yang dihapus harus selalu dibungkus satu UndoRecord (payload + inverse_payload).

-- =====================================================================================
--  BAGIAN 21 — VERIFIKASI SKEMA (sanity check setelah menjalankan file ini)
-- =====================================================================================
--  Jumlah tabel data (tanpa view/FTS): SELECT COUNT(*) FROM sqlite_master
--                                        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
--                                          AND name NOT LIKE '%_fts%'
--                                          AND name NOT LIKE '%_fts_%';
--  Jumlah index:                        SELECT COUNT(*) FROM sqlite_master
--                                        WHERE type = 'index' AND name LIKE 'idx_%';
--  Semua FK valid:                      PRAGMA foreign_key_check;   -- harus kosong
--  Migrasi tercatat:                    SELECT version, name FROM schema_migrations;
--  Katalog bawaan lengkap:              SELECT COUNT(*) FROM export_presets WHERE is_builtin = 1;   -- 8
--                                       SELECT COUNT(*) FROM edit_recipes  WHERE is_builtin = 1;   -- 8
--  Tidak ada entitas monetisasi (§11.6 #8):
--      SELECT name FROM sqlite_master
--       WHERE type = 'table'
--         AND (lower(name) LIKE '%subscription%' OR lower(name) LIKE '%entitlement%'
--           OR lower(name) LIKE '%watermark%'  OR lower(name) LIKE '%ad_session%'
--           OR lower(name) LIKE '%premium%');   -- harus 0 baris
--
--  Selamat: skema Keylox v1 siap. Perubahan berikutnya WAJIB lewat migrasi maju (bagian 18).
-- =====================================================================================
