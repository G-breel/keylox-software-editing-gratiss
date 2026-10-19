# Desain UX — Keylox (Stage 3, bagian UX)

> **Dokumen:** `02-design.md` · **Stage 3** dari SUPERAPP_PIPELINE
> **Sumber kebenaran:** `00-spec.md` v2.2 (desktop Electron, 205 fitur, 251 perintah AI) · `01-architecture.md` · `api-contract.md`
> **Status:** Draft — bagian UX; bagian visual (§6+) dilengkapi `ui-designer`.
> **Bahasa:** Indonesia
> **Penulis:** ux-architect (STAGE 3 Desainer, bagian 1)

---

## Prinsip Visual & UX (anti-AI-slop) — patokan untuk §6+

Prinsip ini **wajib** dipatuhi oleh bagian visual dan implementasi. Tidak boleh dilanggar tanpa ADR.

1. **Palet terkunci** (tidak boleh ditambah warna dekoratif): bg `#1a1a1a` (app shell) / `#222222` (panel) / `#2a2a2a` (elevated/card); border `#333`; text `#f0f0f0` (primary) / `#888` (muted); accent `#ffffff` (putih, untuk CTA sekunder/outline); active `#ff6600` (oranye, satu-satunya warna "aksi"); success `#4ade80`; danger `#ef4444`; warning `#f59e0b`. Tidak ada gradient dekoratif, tidak ada warna brand tambahan, tidak ada glassmorphism.
2. **Inspector CONTEXTUAL** — panel kanan berubah isinya sesuai seleksi (klip/teks/efek/audio/tracking/mask), **bukan** tab statis yang selalu sama. Tidak ada "tab Effect" tetap; yang muncul adalah properti milik objek yang sedang dipilih.
3. **Timeline multi-track** wajib menampilkan: track header, thumbnail strip, waveform audio, playhead vertikal, marker, keyframe lane (diamond), dan clip edge handle. Tidak boleh diganti "simple list".
4. **Empty state minimal** — hanya hint text kecil (mis. "Belum ada media. Drag file ke sini atau tekan Ctrl+I") + satu aksi. **Tidak** ada ilustrasi stock, tidak ada maskot, tidak ada animasi Lottie.
5. **Animasi minimal** — hanya `150ms ease-out` untuk hover/expand/collapse/modal. Tidak ada animasi dekoratif, parallax, atau bounce. `prefers-reduced-motion` dimatikan total.
6. **Ikon** — monokrom, stroke 1.5px, 16/20px. Tidak ada emoji sebagai ikon UI (emoji hanya di theme toggle legacy, tidak dipakai).
7. **Tipografi** — satu sans-serif (Inter/system), monospace untuk timecode & angka. Ukuran 11/12/13/14/16/20/24. Tidak ada font dekoratif.

---

## §1 Peta Navigasi & Screen Graph (Desktop)

### 1.1 Topologi window

Keylox adalah app desktop multi-window. Ada **dua kelas window**:

- **Window utama (Main Editor)** — satu per proyek yang sedang dibuka. Berisi seluruh editor. Dapat dibuka lebih dari satu (satu window per proyek) untuk kerja paralel.
- **Window utilitas** — Settings, Project Manager, Welcome — dapat dibuka sebagai window terpisah **atau** modal overlay di atas Main Editor (keputusan implementasi: modal default, opsi "buka di window baru" via menu). Keduanya berbagi state via IPC.

```
┌──────────────────────────────────────────────────────────────────┐
│  APP SHELL (Electron main process)                                │
│  ├── Welcome Window  (first-run / tidak ada proyek terbuka)        │
│  ├── Main Editor Window × N  (1 proyek per window)                 │
│  │     ├── Modal: Export Dialog                                    │
│  │     ├── Modal: EditPlan Preview                                 │
│  │     ├── Modal: Tracking Editor (overlay pada preview)            │
│  │     ├── Panel: Project Manager (slide-in)                       │
│  │     └── Panel: Prompt Bar (selalu terlihat, dock bawah)         │
│  ├── Settings Window (modal / window terpisah)                     │
│  └── System tray (opsional, v2)                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Screen graph (transisi antar layar)

```
[LAUNCH]
   │
   ▼
┌─────────────┐   pilih "Buka proyek"   ┌──────────────────┐
│  WELCOME    │────────────────────────►│  PROJECT MANAGER │
│  (first-run │   pilih "Proyek baru"   │  (daftar proyek) │
│  / no proj) │────────────────────────►│                  │
└──────┬──────┘                          └────────┬─────────┘
       │  drag file/folder ke window               │  pilih proyek
       │  (quick start)                            │
       ▼                                           ▼
┌──────────────────────────────────────────────────────────────┐
│  MAIN EDITOR  (proyek terbuka)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Top Bar  │  │ Media    │  │ Preview  │  │Inspector │       │
│  │          │  │ Panel    │  │ +TL      │  │(context) │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ Prompt Bar (dock bawah, selalu terlihat)              │      │
│  └──────────────────────────────────────────────────────┘      │
└────┬──────────────┬──────────────┬──────────────┬────────────┘
     │              │              │              │
     │ Export       │ Settings     │ Project Mgr  │ Close project
     ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐   ┌─────────────┐
│ EXPORT   │  │ SETTINGS │  │ PROJECT  │   │ WELCOME     │
│ DIALOG   │  │ (window/ │  │ MANAGER  │   │ (jika tidak │
│ (modal)  │  │  modal)  │  │ (panel)  │   │  ada proyek │
└──────────┘  └──────────┘  └──────────┘   │  terbuka)   │
                                           └─────────────┘
```

Transisi kunci:
- **Welcome → Main Editor**: via "Proyek baru" (dialog nama+rasio) atau "Buka proyek" atau drag file/folder ke window Welcome (quick start: buat proyek otomatis dari nama folder).
- **Main Editor → Welcome**: saat proyek ditutup dan tidak ada proyek lain terbuka. Jika masih ada proyek lain terbuka, window Main Editor ditutup tanpa ke Welcome.
- **Main Editor → Export Dialog**: tombol Export di top bar, atau Ctrl+E, atau perintah AI `#1–#11` (one-prompt full edit yang diakhiri export).
- **Main Editor → Settings**: menu app / Ctrl+, (koma) / ikon gear. Dibuka sebagai modal overlay (default) agar konteks proyek tetap terlihat di belakang.
- **Main Editor → Project Manager**: Ctrl+Shift+O atau menu "File → Buka proyek lain". Slide-in panel kiri, tidak menutup editor.
- **EditPlan Preview** muncul sebagai modal di atas Main Editor saat AI menghasilkan rencana; menutup preview tidak mengubah state (AC: perubahan rencana tidak merusak state proyek).
- **Tracking Editor** muncul sebagai overlay pada area preview (kanan bawah) saat sesi tracking aktif atau saat pengguna memilih target tracking; dapat di-dock ke panel kanan.

### 1.3 Aturan navigasi

- **Satu sumber kebenaran per window**: window Main Editor memegang state proyek aktif. Window lain (Settings, Project Manager) tidak memegang state proyek; mereka memanggil IPC ke main process.
- **Fokus window**: window yang terakhir aktif menerima shortcut global app (menu bar). Shortcut editor (J/K/L, dll.) hanya aktif saat Main Editor terfokus.
- **Konfirmasi sebelum kehilangan pekerjaan**: menutup Main Editor dengan perubahan belum tersimpan → dialog "Simpan / Buang / Batal" (autosave ≤ 3 s membuat ini jarang, tetapi tetap ada).
- **Back/forward** tidak dipakai (app desktop, bukan browser). Navigasi via menu/shortcut/panel.

---

## §2 User Flow per Task Utama

### 2.1 Flow: Import → Edit → Export (manual)

Tujuan: pengguna yang mau kontrol penuh.

```
1. Buka app → Welcome → "Proyek baru" (nama + rasio) → Main Editor kosong.
2. Import bahan:
   a. Drag file/folder ke Media Panel (kiri) ATAU Ctrl+I/Ctrl+Shift+I.
   b. Dialog native open (system:openFileDialog) → pilih multi-file/folder.
   c. Progress bar di Media Panel; thumbnail muncul saat selesai.
   d. State kosong Media Panel hilang; muncul grid thumbnail + metadata (durasi, resolusi).
3. Susun timeline:
   a. Drag thumbnail dari Media Panel ke track di timeline (drop zone highlight).
   b. Clip muncul dengan thumbnail strip + waveform (audio).
   c. Trim dengan drag edge handle; split dengan Ctrl+B pada playhead; ripple delete dengan Delete.
   d. Tambah track via tombol "+" di track header (video/overlay/text/audio).
4. Edit visual:
   a. Pilih klip → Inspector (kanan) berubah: Transform, Color, Effect, Mask, Blend, Audio.
   b. Ubah via slider/input; preview update real-time (WebGL).
   c. Keyframe: klik diamond di timeline lane; nilai otomatis keyframed.
5. Edit audio:
   a. Pilih audio clip → Inspector: volume, fade, mute, EQ, ducking.
   b. Waveform di timeline; fade handle drag langsung di clip.
6. Preview: Space (play/pause), J/K/L (shuttle), I/O (in/out point), ,/. (frame step).
7. Export:
   a. Ctrl+E → Export Dialog.
   b. Pilih preset (TikTok/IG/YouTube/Custom) atau "AI pilih setelan".
   c. Estimasi ukuran + durasi render ditampilkan.
   d. "Export" → progress bar di dialog + taskbar; notifikasi OS saat selesai; "Buka folder".
8. Undo/redo kapan saja: Ctrl+Z / Ctrl+Y. Autosave ≤ 3 s.
```

Error path:
- File tidak didukung → toast "Format tidak didukung" + daftar gagal (media:importFiles response.failed), klip yang sukses tetap masuk.
- Media hilang saat buka proyek → dialog relink (R-15) daftar aset hilang, tombol "Cari" per aset + "Lewati".
- Export gagal (disk penuh/codec) → dialog error dengan kode + "Coba lagi" + saran (ganti codec/folder).

### 2.2 Flow: AI One-Prompt (jalur utama produk)

Tujuan: satu perintah → video selesai, tanpa sentuhan manual (G-21).

```
1. Proyek terbuka dengan bahan (atau drag folder → quick start membuat proyek).
2. Fokus Prompt Bar (dock bawah) — Ctrl+P atau klik. Indikator "siap menerima perintah".
3. Ketik/ucap perintah (G-24 suara): "bikin video 45 detik bergaya cinematic dari folder ini".
   a. Input suara: tombol mic → indikator merekam → transkripsi dapat diedit sebelum kirim.
4. Tekan Enter / "Kirim". Status: "Memahami..." (≤ 4 s p95).
   a. Bila offline → perintah diantre (G-33), status jelas, tidak hilang.
   b. Bila confidence < 0.7 → klarifikasi: pertanyaan + 2–4 opsi (AC-2). Pengguna pilih opsi.
5. AI menghasilkan EditPlan → modal EditPlan Preview muncul:
   a. Daftar langkah berbahasa manusia (G-23): "Potong klip 1 di 0:05", "Urutkan by tanggal", "Grade cinematic", "Tambah glow", "Subtitle ID", "Musik ceria".
   b. Setiap langkah: toggle on/off, drag untuk ubah urutan, klik untuk ubah durasi/param.
   c. Storyboard thumbnail per klip (G-32), waktu pratinjau ≤ 15 s untuk 20 klip.
   d. Tombol: "Terapkan" (primary, active #ff6600), "Tolak", "Minta versi lain".
6. Tracking Engine menyiapkan data jika plan memuat subjek bergerak (TR-01..): progress bar "Melacak..." di bawah preview. Dapat dibatalkan; jika dibatalkan, plan tetap apply tanpa binding tracking.
7. Tekan "Terapkan" → timeline terbentuk; 1 entri undo; autosave.
   a. Notifikasi toast "Rencana diterapkan (12 langkah)".
8. Refinement iteratif (G-25): ketik "lebih cepat", "jangan terlalu gelap", "ganti musiknya" → delta pada hasil sebelumnya (bukan dari nol), 100% reversibel. Riwayat prompt ≥ 50 (G-29).
9. Export: "Export" dari prompt ("ekspor untuk TikTok") atau Ctrl+E manual.
```

State UI selama flow:
- Prompt Bar menampilkan status: idle / "Memahami..." / "Menyusun rencana..." / "Melacak..." / "Diterapkan" / "Diantre (offline)".
- EditPlan Preview modal memblokir interaksi timeline (fokus pada rencana), tetapi preview video tetap dapat diputar.
- Tombol Apply disabled sampai plan valid (Zod) dan tidak ada operasi yang gagal validasi.

### 2.3 Flow: Tracking (interactive select → track → bind → edit)

Tujuan: menempel teks/efek/mask/kamera pada subjek bergerak (TR-01..TR-15). Jalur pendamping: tracking editor manual (TR-14).

```
1. Pilih klip di timeline → Inspector menampilkan section "Tracking" (kontekstual).
2. Mulai tracking:
   a. "Lacak subjek" → pilih tipe: Wajah / Tangan / Badan / Objek / Area / Titik / Gerak.
   b. Untuk objek: interactive select (TR-02) — klik pada objek di preview → bbox muncul → "Lacak".
   c. Untuk multi-objek (TR-08): ulangi; daftar target di panel "Tracking Targets".
3. Sesi tracking berjalan:
   a. Mode realtime (preview resolusi turun) atau batch (klip panjang) dengan progress.
   b. Overlay di preview: bbox/landmark/skeleton + ID target + confidence.
   c. Dapat dibatalkan; hasil parsial disimpan dengan status "tidak lengkap".
4. Setelah selesai:
   a. TrackingTarget + TrackingKeyframe tersimpan (SQLite).
   b. Status target: OK / drift tinggi / hilang (TR-14 menampilkan warning).
5. Binding ke konsumen (TR-09..TR-13):
   a. Tambah teks → "Tempel ke target X" (anchor: center/top/bottom/left/right + offset).
   b. Tambah efek (glow, lens blur, partikel) → "Ikuti target".
   c. Mask → "Mask dinamis mengikuti target".
   d. Cutout → "Cutout dinamis".
   e. Kamera virtual → "Reframe dari tracking" / "Stabilkan".
   f. Setiap binding menampilkan badge "terikat ke [Target #id]" di inspector.
6. Koreksi manual (TR-14) — jalur pendamping:
   a. Buka Tracking Editor (overlay di preview): timeline keyframe per target.
   b. Drag keyframe (diamond) untuk koreksi posisi; smoothing level 0/1/2; offset (dx,dy,scale,rot); trim track (start/end).
   c. Tambah/hapus keyframe manual; "Re-lacak dari sini" (reanalyze segmen).
   d. Smoothing preview real-time.
7. Invalidasi (TR-15): bila klip dipotong/di-speed/di-reverse/ganti media → target ditandai "perlu lacak ulang" (badge kuning) + binding tetap hidup. Pengguna dapat re-track atau biarkan (binding membaca data lama dengan warning).
```

Empty state Tracking:
- Klip tanpa target: "Belum ada target. Pilih 'Lacak subjek' untuk mulai." (hint text, tanpa ilustrasi).
- Target hilang di segmen: badge merah "Target hilang di 0:12–0:18" + tombol "Re-lacak segmen".

### 2.4 Flow: Folder Index (batch import + AI indexing)

Tujuan: bahan menumpuk → terindeks → AI auto-pick (P-10..P-14).

```
1. Import folder:
   a. Ctrl+Shift+I atau drag folder ke Media Panel / Welcome.
   b. Dialog: pilih folder, opsi recursive, opsi "watch folder" (P-10, #207).
   c. Progress import: "Mengimpor 247 file (120/247)..." + tombol Batal.
   d. Setelah import selesai → toast "247 media diimpor; 3 gagal" + daftar gagal.
2. AI indexing (background, P-12):
   a. Otomatis dimulai setelah import (atau manual via "Indeks folder").
   b. Worker (indexing.worker) memproses chunked: durasi, resolusi, scene, subjek, kualitas, teks (OCR), embedding (D-11).
   c. Progress di status bar bawah: "Mengindeks 45/247..." + tombol "Jeda"/"Batal" (index:cancel).
   d. Hasil: AssetInsight per aset; Media Panel menampilkan badge "terindeks" + filter (subjek, kualitas, durasi).
3. Auto-group (P-13): AI mengelompokkan aset (mis. "liburan", "produk", "talking-head") → tab grup di Media Panel. Dapat diganti nama/hapus grup.
4. Auto-pick (P-13): saat one-prompt, AI memilih bahan dari indeks ("bikin promo produk 30 detik, fokus sepatu" → pilih klip yang mengandung sepatu).
5. Re-index inkremental (P-14): bila aset baru ditambah atau model versi naik → index:reindex (hanya yang stale). index:clearCache untuk bersihkan.
6. Watched folder (#207): bila file baru masuk folder → notifikasi "12 media baru terdeteksi" + tombol "Impor".
```

State kosong Media Panel sebelum import:
- "Belum ada media. Drag file/folder ke sini, atau tekan Ctrl+I (file) / Ctrl+Shift+I (folder)." (hint text, tanpa ilustrasi).

---

## §3 Daftar Layar, Transisi & State per Layar

### 3.1 Welcome Screen

**Tujuan:** entry point saat tidak ada proyek terbuka; onboarding ringan.

**Region:**
- Kiri: logo + tagline "Bilang apa yang kamu mau. Sisanya kami." + 3 tombol: "Proyek baru", "Buka proyek", "Impor folder (quick start)".
- Kanan: daftar proyek terakhir (lazy list, 5 item) + "Lihat semua" → Project Manager.
- Bawah: status koneksi AI (connected/offline) + versi app.

**State:**
- **Kosong (no recent projects):** kanan menampilkan hint "Belum ada proyek. Mulai dengan 'Proyek baru'." (tanpa ilustrasi).
- **Loading (membuka proyek):** tombol "Buka proyek" menampilkan spinner inline + disabled; tidak ada splash full-screen.
- **Error (gagal buka):** toast dengan kode error + "Coba lagi"/"Pilih file lain".
- **First-run:** banner tipis di atas: "Tip: drag folder ke sini untuk langsung mulai." (dapat ditutup, tidak muncul lagi setelah 1 proyek dibuat).

**Transisi:** → Main Editor (proyek baru/buka) atau → Project Manager ("Lihat semua").

### 3.2 Main Editor

**Tujuan:** layar utama editing. Satu window per proyek.

**Region (layout default, dapat di-resize/dock):**

```
┌────────────────────────────────────────────────────────────────────┐
│  TOP BAR: menu (File/Edit/View/Track/AI/Help) · nama proyek ·     │
│  undo/redo · play controls (J/K/L) · timecode · Export · Settings  │
├────────────┬───────────────────────────────┬───────────────────────┤
│ MEDIA PANEL│  PREVIEW + TIMELINE           │  INSPECTOR (context)  │
│ (kiri)     │  (tengah, atas: preview       │  (kanan)              │
│ thumbnail  │   bawah: timeline multi-track)│  berubah sesuai       │
│ grid/list  │                               │  seleksi              │
│ + folder   │                               │                       │
│ tabs       │                               │                       │
├────────────┴───────────────────────────────┴───────────────────────┤
│  PROMPT BAR (dock bawah, selalu terlihat): input + mic + status    │
├────────────────────────────────────────────────────────────────────┤
│  STATUS BAR: indeks progress · performa (fps) · koneksi AI · undo  │
└────────────────────────────────────────────────────────────────────┘
```

- **Top Bar**: tinggi 40px; menu bar (File, Edit, View, Track, AI, Help) + nama proyek (editable inline) + undo/redo + shuttle (J/K/L ikon) + timecode monospace + tombol Export (active #ff6600) + Settings gear.
- **Media Panel (kiri)**: lebar default 280px, resizable 200–480px. Tab: "Semua", "Folder", "Grup" (auto-group), "Favorit". Grid thumbnail 4 kolom (list view toggle). Drag ke timeline. Klik kanan: "Impor file/folder", "Re-index", "Hapus dari proyek".
- **Preview (tengah atas)**: 16:9 / rasio proyek, WebGL canvas. Overlay: playhead timecode, safe-area guides (toggle), tracking overlay (bbox/landmark) saat aktif, in/out point markers. Fullscreen preview: F (preview saja, panel tersembunyi).
- **Timeline (tengah bawah)**: tinggi default 240px, resizable 120–480px. Multi-track: video, overlay, text, audio. Thumbnail strip + waveform + playhead + marker + keyframe lane (diamond). Zoom (Ctrl+scroll / +/-). Scroll horizontal (shift+scroll / trackpad).
- **Inspector (kanan)**: lebar default 320px, resizable 240–480px. **Contextual**: isi berubah sesuai seleksi:
  - Tidak ada seleksi → "Pilih klip/teks/efek untuk mengedit propertinya." + shortcut hint.
  - Klip video → Transform, Color, Effect, Mask, Blend, Audio (sub-sections collapsible).
  - Teks → Content, Style, Animation, Tracking bind.
  - Audio clip → Volume, Fade, EQ, Ducking.
  - Effect instance → Params (slider), keyframe toggle.
  - Tracking target → Target info, Keyframes, Smoothing, Offset, Trim, Binding list.
  - Mask → Type, Feather, Invert, Tracking bind.
- **Prompt Bar (dock bawah)**: tinggi 56px. Input teks (placeholder "Ketik perintah... (Ctrl+P)"), tombol mic (G-24), tombol "Kirim", status chip (idle/memahami/melacak/diantre), riwayat prompt (dropdown). Selalu terlihat; dapat di-collapse ke 32px (chevron).
- **Status Bar**: tinggi 24px. Indeks progress (jika berjalan), fps preview, koneksi AI (ikon), "Autosaved 12s ago", ukuran proyek.

**State per region:**

*Media Panel*
- Kosong: hint text + 2 tombol (Impor file / Impor folder).
- Loading (import): progress bar inline + "Membatalkan" + daftar file saat ini.
- Error (gagal probe): thumbnail dengan badge merah + tooltip alasan; tombol "Hapus".
- Terindeks: badge "✓" kecil + filter chips (subjek, kualitas, durasi).

*Preview*
- Kosong (tidak ada klip di playhead): area hitam + hint "Tambah klip ke timeline atau jalankan perintah AI." (tanpa ilustrasi).
- Loading (decode frame): spinner kecil di pojok kanan bawah; preview tetap menampilkan frame terakhir.
- Error (media corrupt): area hitam + teks "Media tidak dapat diputar" + tombol "Relink"/"Hapus klip".

*Timeline*
- Kosong (tidak ada klip): track kosong dengan garis putus-putus + hint "Drag media ke sini atau ketik perintah." (tanpa ilustrasi).
- Loading (render thumbnail strip): placeholder abu-abu per klip; waveform muncul saat siap.
- Error (gagal render): klip tetap tampil dengan badge merah "Gagal render"; hover menampilkan alasan.

*Inspector*
- Kosong (no selection): hint + daftar shortcut yang relevan.
- Loading (fetch properti): skeleton tipis (3 baris abu) 150ms lalu isi.
- Error: "Gagal memuat properti" + "Coba lagi".

*Prompt Bar*
- Idle: placeholder + mic.
- Memahami: spinner + "Memahami..." + tombol "Batal".
- Klarifikasi: pertanyaan + 2–4 opsi (radio) + "Kirim pilihan".
- Diantre (offline): chip kuning "Diantre (offline)" + jumlah antrean.
- Error: chip merah + pesan + "Coba lagi".

**Transisi internal Main Editor:**
- Seleksi klip/teks/efek → Inspector swap konten dengan fade 150ms (bukan tab).
- Hover klip di timeline → tooltip (nama, durasi, resolusi) muncul 300ms.
- Drag clip edge → preview scrub real-time.
- Playhead bergerak → semua panel sinkron (timecode, preview, inspector yang time-dependent).

### 3.3 Project Manager

**Tujuan:** daftar proyek, buka/buat/hapus/duplikat, relink.

**Region:** modal/panel (slide-in kiri, lebar 480px) atau window terpisah. Daftar proyek (lazy, search, sort by updated/name), thumbnail cover, metadata (durasi, jumlah klip, ukuran), aksi (Buka, Duplikat, Rename, Hapus, Export .keylox).

**State:**
- Kosong: "Belum ada proyek. Buat proyek baru." + tombol.
- Loading: skeleton 5 baris.
- Error (gagal list): "Gagal memuat daftar proyek" + "Coba lagi".
- Search tanpa hasil: "Tidak ada proyek dengan kata itu." (hint text).

**Transisi:** → Main Editor (buka) atau → Welcome (jika semua proyek ditutup).

### 3.4 Export Dialog

**Tujuan:** konfigurasi export (manual atau AI).

**Region:** modal tengah (lebar 640px). Bagian: preset (TikTok 1080×1920 30fps, IG Reels, YouTube 1080p/4K, Custom), settings (resolusi, fps, bitrate, codec, container, audio), estimasi ukuran+durasi render, pilihan "AI pilih setelan" (R-18), tombol Export/Cancel, progress bar saat berjalan.

**State:**
- Idle: form editable.
- Estimating: spinner kecil di estimasi + "Menghitung...".
- Exporting: progress bar + % + ETA + "Batal" (export:cancel); tombol Export disabled; taskbar progress.
- Sukses: centang hijau (#4ade80) + "Export selesai" + "Buka folder" + "Tutup".
- Error: merah (#ef4444) + kode + pesan + "Coba lagi"/"Ganti setelan".
- Disk penuh: pesan spesifik + saran folder lain.

**Transisi:** → Main Editor (tutup) atau → OS file explorer (Buka folder).

### 3.5 Settings

**Tujuan:** preferensi app, koneksi AI, hardware accel, shortcut, tema.

**Region:** window/modal dengan sidebar kiri (kategori) + konten kanan. Kategori: Umum, AI & Koneksi, Performa, Shortcut, Privasi, Tentang. (Tidak ada field API key — §5.1 arsitektur.)

**State:**
- Loading: skeleton.
- Error (gagal simpan): toast "Gagal menyimpan pengaturan" + "Coba lagi"; nilai kembali ke sebelumnya.
- Test connection: spinner + hasil (latensi ms atau error).

**Transisi:** → Main Editor (tutup) tanpa reload; perubahan diterapkan langsung (kecuali yang butuh restart, ditandai).

### 3.6 Tracking Editor (overlay)

**Tujuan:** koreksi data tracking per frame (TR-14).

**Region:** overlay pada area preview (kanan bawah, dapat di-dock ke panel kanan). Isi: daftar target (kiri kecil), keyframe timeline per target (tengah), panel smoothing/offset/trim (kanan kecil).

**State:**
- Kosong (tidak ada target): "Pilih 'Lacak subjek' untuk mulai." (hint).
- Tracking berjalan: progress + "Membatalkan".
- Drift tinggi: badge kuning per target + "Smoothing direkomendasikan".
- Target hilang: badge merah + "Re-lacak segmen".

**Transisi:** buka/tutup via tombol "Tracking" di Inspector atau shortcut Ctrl+T; tidak menutup Main Editor.

### 3.7 EditPlan Preview (modal)

**Tujuan:** tampilkan rencana AI, toggle/ubah, apply/tolak (G-23, G-32).

**Region:** modal tengah (lebar 720px, tinggi max 80vh). Bagian: header (perintah asli + confidence), storyboard thumbnail horizontal (scroll), daftar langkah (drag reorder, toggle, edit durasi/param), footer (Terapkan primary #ff6600, Tolak, Minta versi lain).

**State:**
- Loading (menyusun): skeleton daftar + "Menyusun rencana...".
- Klarifikasi (confidence rendah): pertanyaan + opsi (bukan daftar langkah).
- Error (plan invalid): "Rencana tidak dapat diterapkan" + detail + "Coba lagi"/"Ubah perintah".
- Empty (0 langkah): "AI tidak menemukan operasi. Coba perintah yang lebih spesifik." (hint).

**Transisi:** → Main Editor (apply/tolak) dengan animasi modal 150ms.

---

### 3.8 Pola State Kosong / Error / Loading (global)

### 3.8.1 Pola komponen state

Semua layar/region menggunakan 4 state standar. Tidak ada state lain.

| State | Visual | Perilaku |
|---|---|---|
| **Empty** | Hint text 1 baris (#888, 12px) + maksimal 1 tombol aksi (outline putih). Tidak ada ilustrasi. | Aksi utama mengisi state (import/tambah). |
| **Loading** | Spinner 16px inline (putih, opacity 0.6) + teks status singkat. Skeleton hanya untuk daftar ≥ 5 item. | Operasi dapat dibatalkan bila > 2 s. |
| **Error** | Teks merah (#ef4444) 1 baris + kode error (kecil, #888) + tombol "Coba lagi" (outline). | Retryable sesuai error shape; log details + requestId ke logger. |
| **Populated** | Konten normal. | — |

### 3.8.2 Aturan loading

- Loading > 200 ms baru tampil spinner (hindari flicker).
- Loading > 2 s wajib tombol "Batal" (bila operasi dapat dibatalkan).
- Loading tidak boleh memblokir seluruh window kecuali operasi destruktif (export, hapus proyek) — gunakan modal progress.
- Progress bar deterministik (0–100%) untuk operasi dengan total diketahui (import, indeks, export, tracking batch); indeterminate hanya untuk operasi tanpa total (AI parse).

### 3.8.3 Aturan error

- Pesan user-facing berasal dari `error.message` (bahasa manusia), bukan kode.
- Kode error ditampilkan kecil (#888) hanya di tooltip/detail (untuk support), bukan di toast utama.
- Retryable → tombol "Coba lagi"; non-retryable → "Tutup" + saran (mis. "Coba format lain").
- Error jaringan AI → "Mode offline; perintah diantre." (bukan "gagal").
- Crash → crash reporter opt-in (Sentry) + dialog "Terjadi kesalahan tak terduga" + tombol "Restart"/"Laporkan".

### 3.8.4 Aturan empty state (anti-AI-slop)

- Hanya hint text + maksimal 1 aksi. Tidak ada ilustrasi stock, maskot, animasi Lottie, atau empty-state artwork.
- Contoh yang benar: Media Panel kosong → "Belum ada media. Drag file ke sini atau tekan Ctrl+I." + tombol "Impor file".
- Contoh yang salah: ilustrasi folder dengan wajah tersenyum + "Mulai kreativitasmu!".

---

## §4 Keyboard Shortcuts Map

### 4.1 Konvensi

- Shortcut global app (menu bar) aktif kapan saja window Main Editor/Welcome terfokus.
- Shortcut editor hanya aktif saat Main Editor terfokus dan tidak ada modal terbuka (kecuali ditandai "global").
- Mac: `Ctrl` → `Cmd`; `Alt` → `Option`. Dokumen ini pakai notasi Windows; implementasi memetakan modifier.

### 4.2 Transport & navigasi waktu

| Shortcut | Aksi | Konteks |
|---|---|---|
| `Space` | Play / Pause | Editor |
| `J` | Shuttle mundur (1×/2×/4×) | Editor |
| `K` | Pause | Editor |
| `L` | Shuttle maju (1×/2×/4×) | Editor |
| `I` | Set in-point (mark in) | Editor |
| `O` | Set out-point (mark out) | Editor |
| `Home` | Lompat ke awal timeline | Editor |
| `End` | Lompat ke akhir timeline | Editor |
| `,` (koma) | Mundur 1 frame | Editor |
| `.` (titik) | Maju 1 frame | Editor |
| `Shift+,` | Mundur 1 detik | Editor |
| `Shift+.` | Maju 1 detik | Editor |
| `F` | Fullscreen preview (toggle) | Editor |
| `Ctrl+G` | Pergi ke timecode (input) | Editor |

### 4.3 File & proyek

| Shortcut | Aksi | Konteks |
|---|---|---|
| `Ctrl+N` | Proyek baru | Global |
| `Ctrl+O` | Buka proyek | Global |
| `Ctrl+Shift+O` | Project Manager (panel) | Global |
| `Ctrl+S` | Simpan | Global |
| `Ctrl+Shift+S` | Simpan sebagai (.keylox) | Global |
| `Ctrl+W` | Tutup proyek/window | Global |
| `Ctrl+Q` | Keluar app | Global |
| `Ctrl+I` | Impor file | Editor |
| `Ctrl+Shift+I` | Impor folder | Editor |
| `Ctrl+E` | Export dialog | Editor |
| `Ctrl+,` | Settings | Global |

### 4.4 Edit & timeline

| Shortcut | Aksi | Konteks |
|---|---|---|
| `Ctrl+Z` | Undo | Editor |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo | Editor |
| `Ctrl+C` | Salin klip | Editor |
| `Ctrl+V` | Tempel | Editor |
| `Ctrl+D` | Duplikat klip | Editor |
| `Delete` / `Backspace` | Hapus seleksi (ripple) | Editor |
| `Shift+Delete` | Hapus (tanpa ripple) | Editor |
| `Ctrl+B` | Split pada playhead | Editor |
| `Ctrl+A` | Pilih semua klip | Editor |
| `Esc` | Batalkan seleksi / tutup modal | Global |
| `Ctrl+]` | Bawa ke depan (layer) | Editor |
| `Ctrl+[` | Kirim ke belakang (layer) | Editor |
| `Ctrl+=` / `Ctrl++` | Zoom in timeline | Editor |
| `Ctrl+-` | Zoom out timeline | Editor |
| `Ctrl+0` | Fit timeline ke view | Editor |
| `Ctrl+Shift+Z` | Redo (alternatif) | Editor |

### 4.5 AI & prompt

| Shortcut | Aksi | Konteks |
|---|---|---|
| `Ctrl+P` | Fokus Prompt Bar | Editor |
| `Enter` | Kirim perintah (saat Prompt Bar fokus) | Editor |
| `Ctrl+Enter` | Kirim & langsung apply (skip preview) — hanya untuk perintah non-destruktif | Editor |
| `Esc` | Batalkan perintah yang sedang diproses | Editor |
| `Ctrl+Shift+P` | Buka riwayat prompt | Editor |
| `Ctrl+Shift+E` | EditPlan Preview (ulang terakhir) | Editor |

### 4.6 Tracking

| Shortcut | Aksi | Konteks |
|---|---|---|
| `Ctrl+T` | Tracking Editor (toggle overlay) | Editor |
| `Ctrl+Shift+T` | Mulai lacak subjek (interactive select) | Editor |
| `Ctrl+Alt+T` | Re-lacak target terpilih | Editor |
| `Ctrl+Shift+K` | Smoothing target terpilih (cycle 0/1/2) | Editor (Tracking) |

### 4.7 Panel & view

| Shortcut | Aksi | Konteks |
|---|---|---|
| `Tab` | Cycle fokus panel (Media → Preview → Inspector → Prompt) | Editor |
| `Ctrl+1` | Toggle Media Panel | Editor |
| `Ctrl+2` | Toggle Preview fullscreen | Editor |
| `Ctrl+3` | Toggle Inspector | Editor |
| `Ctrl+4` | Toggle Prompt Bar collapse | Editor |
| `Ctrl+Shift+M` | Toggle marker lane | Editor |
| `Ctrl+Shift+K` | Toggle keyframe lane | Editor |
| `?` | Buka peta shortcut (modal) | Global |

### 4.8 Aturan konflik shortcut

- Shortcut editor tidak boleh override shortcut global OS/browser (mis. Ctrl+T di browser = new tab, tetapi di app desktop aman).
- Bila modal terbuka, shortcut editor dinonaktifkan; hanya Esc/Enter berlaku sesuai modal.
- Shortcut dapat di-rebind di Settings → Shortcut; konflik dideteksi dan ditolak (pesan "Shortcut sudah dipakai oleh X").
- Daftar shortcut diekspor ke `?` modal dan ke Settings.

---

## §5 Multi-window, Drag-drop & Responsif

### 5.1 Multi-window

**Aturan:**
- Satu proyek = satu Main Editor window (tidak boleh dibuka proyek yang sama di dua window; jika dicoba → fokus window yang sudah ada + toast "Proyek sudah terbuka").
- Window terpisah untuk proyek berbeda diperbolehkan (kerja paralel). Setiap window memegang state proyek sendiri; main process menyinkronkan autosave ke SQLite.
- Settings & Project Manager default modal di atas window aktif; opsi "Buka di window baru" via menu (untuk multi-monitor).
- Drag window antar monitor: layout responsif mengikuti ukuran window baru (§5.3).
- Saat app ditutup dengan beberapa window terbuka: simpan state "window terakhir" (posisi/ukuran) untuk restore.

**Manajemen window (IPC `window:create/close/minimize/maximize`):**
- `window:create { projectId? }` → buat window baru; jika projectId diberikan, buka proyek itu.
- Tutup window dengan perubahan belum tersimpan → dialog konfirmasi (autosave meminimalkan).
- Window state (posisi, ukuran, panel layout) disimpan per proyek di settings (key `windowState.<projectId>`).

### 5.2 Drag-drop

**Sumber drop yang didukung:**
1. **File/folder dari OS** → drop ke Media Panel atau Preview atau Welcome → import (file) / import folder (folder). Drop zone highlight (border putus-putus #ff6600) saat drag masuk.
2. **Thumbnail media** dari Media Panel → drop ke track di timeline → buat klip di posisi drop (snap ke playhead/grid).
3. **Thumbnail media** → drop ke Preview → buat overlay (PIP) di posisi drop (koordinat).
4. **Klip di timeline** → drag untuk pindah posisi/track (constrained: tidak boleh ke track yang tidak kompatibel, mis. audio clip ke video track).
5. **Efek/transisi** dari Inspector/panel efek → drop ke klip/transition zone.
6. **Tekstur/LUT file** → drop ke inspector color → import LUT.
7. **Proyek .keylox** → drop ke Welcome/Project Manager → buka proyek.

**Perilaku:**
- Drag handle: thumbnail klip menampilkan grip (6 dots) saat hover; cursor `grab` → `grabbing`.
- Drop zone valid: highlight border #ff6600 + tooltip "Lepas untuk menambahkan".
- Drop zone invalid: cursor `not-allowed`, tidak ada highlight.
- Multi-drag: pilih beberapa klip → drag bersama; drop membuat urutan sesuai selection order.
- Drag antar window: media dari window A dapat di-drag ke window B (drop → import referensi, bukan copy file, kecuali beda proyek → konfirmasi "Impor ke proyek ini?").
- Drag dari panel ke desktop (export klip) — v2 (out of scope MVP).

**State kosong drop:** saat drag masuk window tanpa drop target yang valid → overlay full-window "Lepas file untuk diimpor" (hint, bukan ilustrasi).

### 5.3 Responsif

**Target resolusi:**
- **Minimum:** 1280 × 720 (panel collapse otomatis jika lebih kecil dari minimum tidak didukung; app menolak resize di bawah minimum dengan toast "Resolusi minimum 1280×720").
- **Optimal:** 1920 × 1080 (layout default seperti §3.2).
- **HiDPI:** scaling 1×/1.25×/1.5×/2× (Windows display scale). Semua ukuran dalam CSS logical px; ikon & thumbnail di-render 2× pada HiDPI (devicePixelRatio). Teks tidak blur.

**Strategi layout adaptif:**
- Panel (Media, Inspector) dapat di-collapse ke ikon (rail 48px) via tombol atau shortcut Ctrl+1/3; state disimpan.
- Timeline tinggi dapat dikecilkan hingga 120px (hanya track header + playhead) untuk fokus preview.
- Preview area selalu mendapat ruang prioritas (flex-grow); panel side fixed width.
- Pada lebar < 1440px: Media Panel default collapse ke rail; Inspector default 280px.
- Pada lebar ≥ 1920px: semua panel default terbuka; timeline 320px.
- Pada lebar ≥ 2560px (4K monitor): opsi "layout luas" (3 kolom + timeline lebih tinggi) di Settings → Tampilan.

**HiDPI & performa:**
- Thumbnail strip di-render sesuai devicePixelRatio (max 2×) untuk ketajaman.
- WebGL preview canvas ukuran = container × devicePixelRatio, capped 2× untuk performa.
- Font rendering: subpixel antialiasing di Windows (ClearType), grayscale di macOS (default OS).
- Icon stroke 1.5px logical → 3px pada 2× (tetap tajam).

**Aksesibilitas dasar (detail di Stage 8/QA):**
- Semua interaktif dapat diakses keyboard (tab order logis: top bar → media → preview → timeline → inspector → prompt).
- Focus ring: 2px putih (#ffffff) dengan offset 2px; tidak boleh dihilangkan.
- Kontras: text #f0f0f0 pada bg #1a1a1a = 15.3:1 (≥ WCAG AAA). Muted #888 pada #1a1a1a = 5.9:1 (≥ AA).
- `prefers-reduced-motion`: semua animasi 150ms dimatikan (transisi instan).
- Screen reader: landmark regions (nav, main, aside, footer) + aria-label pada ikon button.

---

## Catatan untuk ui-designer (§6+)

Bagian berikut **belum** ditulis dan menjadi tanggung jawab `ui-designer`:
- §6 Design tokens (CSS variables, spacing 4px grid, typography scale, shadow/elevation).
- §7 Component library (button, input, slider, dropdown, modal, toast, tooltip, badge, tabs contextual, track header, clip, keyframe diamond, marker, waveform, thumbnail strip).
- §8 Layout grid & spacing specification.
- §9 Iconography & asset spec.
- §10 Motion spec (150ms ease-out, reduced-motion).
- §11 Dark/light (app ini dark-only default; light theme opsional v2 — jangan tambah ke MVP).

Patokan yang tidak boleh dilanggar: palet §Prinsip, inspector contextual, timeline multi-track, empty state minimal, animasi 150ms.

---

*Bagian UX ditulis oleh ux-architect (STAGE 3, bagian 1). Bagian visual §6+ dilengkapi ui-designer (STAGE 3, bagian 2).*

---

## §6 Design Tokens

### 6.1 Warna (palet terkunci — tidak boleh ditambah)

Semua warna didefinisikan sebagai token semantik. Tidak ada warna dekoratif di luar daftar ini. Hex literal di komponen dilarang; selalu gunakan token.

**Surface (background)**
- `--bg-app` `#1a1a1a` — app shell / window background.
- `--bg-panel` `#222222` — panel (Media, Inspector, Timeline background).
- `--bg-elevated` `#2a2a2a` — card, dropdown, modal, hover row.
- `--bg-overlay` `#000000` dengan opacity 0.5 — backdrop modal (hanya untuk modal, bukan glassmorphism; tidak ada blur).

**Border**
- `--border-subtle` `#333333` — semua border panel/section/divider.
- `--border-strong` `#444444` — border input focus ring (sekunder), handle resize.

**Text**
- `--text-primary` `#f0f0f0` — teks utama, ikon aktif.
- `--text-muted` `#888888` — label sekunder, hint, metadata.
- `--text-disabled` `#555555` — teks disabled (hanya untuk disabled state).

**Aksen & status**
- `--accent` `#ffffff` — CTA sekunder, outline button, focus ring, link. Tidak dipakai untuk "aksi utama" dekoratif.
- `--active` `#ff6600` — satu-satunya warna aksi (primary button, selected tab, playhead, drop zone valid, selected clip edge).
- `--success` `#4ade80` — status sukses (export selesai, indeks selesai, target OK).
- `--danger` `#ef4444` — error, badge gagal, destructive action.
- `--warning` `#f59e0b` — drift tinggi, target hilang, antrean offline, perlu lacak ulang.
- `--info` `#ffffff` (alias accent) — tooltip info; tidak ada warna biru terpisah.

**Aturan tambahan**
- Tidak ada gradient (linear/radial) di mana pun, termasuk background button.
- Tidak ada `backdrop-filter: blur` kecuali backdrop modal opasitas (tanpa blur). Glassmorphism dilarang.
- Tidak ada warna brand tambahan. Cyan `#00aaff` dan sejenisnya dilarang.
- Warna status (`success/danger/warning`) hanya untuk status, bukan dekorasi.

### 6.2 Typography

**Font family**
- Sans (UI utama): `Inter` dengan fallback `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`. Satu font untuk seluruh UI.
- Mono (timecode, angka, kode error): `JetBrains Mono` dengan fallback `ui-monospace, SFMono-Regular, Consolas, monospace`.
- Tidak ada font dekoratif.

**Skala ukuran (px, logical)**
- 11 — metadata kecil, badge, kode error.
- 12 — hint text, label panel, status bar.
- 13 — teks body default (input, list, tooltip).
- 14 — subjudul section, tab label.
- 16 — judul panel, tombol primary.
- 20 — judul modal.
- 24 — judul layar (Welcome).

**Berat font**
- 400 (regular) — body.
- 500 (medium) — label, tombol.
- 600 (semibold) — judul section/panel.
- 700 (bold) — judul layar & modal (dipakai hemat).

**Line height**
- 1.2 untuk judul (20, 24).
- 1.4 untuk label (14, 16).
- 1.5 untuk body (13) dan hint (12).
- 1.0 untuk timecode mono (angka tidak wrap).

**Letter spacing:** 0 default; -0.01em untuk judul 20/24; +0.02em untuk label uppercase kecil (badge).

### 6.3 Spacing

- Base unit: 4 px. Semua spacing adalah kelipatan 4.
- Skala: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Penggunaan:
  - 4 — gap ikon-teks dalam tombol, padding badge.
  - 8 — gap antar item list, padding input vertikal.
  - 12 — padding panel section, gap antar komponen form.
  - 16 — padding panel, gap grid thumbnail.
  - 20 — padding modal body.
  - 24 — padding top bar / status bar horizontal.
  - 32 — jarak antar region besar.
  - 48/64 — reserved untuk layout luas (≥ 2560 px).
- Tidak ada spacing "magic number" di luar skala.

### 6.4 Radius

- 0 — divider, track lane, clip edge handle.
- 4 — badge, chip, tooltip.
- 6 — button, input, dropdown item, tab.
- 10 — card, panel section, modal, toast.
- 9999 (pill) — status chip, progress bar track, avatar/badge bulat.

Radius konsisten: elemen interaktif kecil 6, container 10.

### 6.5 Shadow & Elevation

Hanya 3 level; tidak ada shadow dekoratif berlapis.

- `--shadow-1` `0 1px 2px rgba(0,0,0,0.3)` — card, dropdown item hover.
- `--shadow-2` `0 4px 12px rgba(0,0,0,0.4)` — dropdown, popover, tooltip.
- `--shadow-3` `0 8px 24px rgba(0,0,0,0.5)` — modal, dialog, overlay panel.
- Tidak ada inner shadow, glow, atau neon.

Elevation juga dinyatakan lewat background step (panel `#222` → elevated `#2a2a`) bukan shadow.

### 6.6 Motion

- Durasi tunggal: **150 ms** untuk semua transisi (hover, expand/collapse, modal in/out, inspector swap, tooltip).
- Easing tunggal: `ease-out` (`cubic-bezier(0, 0, 0.2, 1)`). Tidak ada spring, bounce, atau overshoot.
- Properti yang dianimasikan: `opacity`, `transform` (translate/scale). Tidak ada animasi width/height langsung (gunakan max-height + opacity untuk collapse).
- `prefers-reduced-motion: reduce` → semua transisi menjadi 0 ms (instan), tidak ada animasi.
- Tidak ada animasi dekoratif, parallax, atau loading Lottie. Spinner adalah rotasi 360° linear 800 ms (satu-satunya pengecualian, hanya untuk loading).
- Playhead bergerak via `requestAnimationFrame` tanpa transisi CSS.

### 6.7 Ikon

- Monokrom, stroke 1.5 px logical (3 px pada 2×).
- Ukuran 16 px (toolbar/inline) dan 20 px (top bar/menu).
- Library: satu set ikon konsisten (Lucide/Feather style). Tidak ada emoji sebagai ikon UI.
- Ikon button wajib punya `aria-label`.

### 6.8 Z-index

- 0 — canvas/preview.
- 10 — panel side, timeline.
- 20 — dropdown, popover, tooltip.
- 30 — modal backdrop.
- 40 — modal dialog.
- 50 — toast.
- 60 — crash dialog / topmost.

---

## §7 Komponen per Layar

### 7.1 Komponen primitif (dipakai semua layar)

- **Button**
  - Variant: `primary` (bg `--active` #ff6600, text putih), `secondary` (bg `--bg-elevated`, text primary), `ghost` (transparent, hover bg elevated), `danger` (bg danger).
  - Size: sm (24 px tinggi), md (32), lg (40).
  - State: default, hover (brightness 1.05 + translateY -1px untuk primary), active (brightness 0.95), focus (ring 2px putih offset 2), disabled (opacity 0.5, no pointer).
  - Icon-only button wajib `aria-label`.

- **Input text / number**
  - Tinggi 32 px, padding 8/12, border `--border-subtle`, radius 6, bg `--bg-panel`.
  - Focus: border `--border-strong` + ring 2px `--active` opacity 0.3 (bukan glow).
  - Error: border danger + pesan merah 11 px di bawah.
  - Number input: stepper ± kecil (16 px) di kanan; mono font untuk nilai.

- **Slider**
  - Track 4 px, radius pill, bg `--border-subtle`; fill `--active`.
  - Thumb 12 px bulat, bg putih, border 1 px `--border-subtle`.
  - Label kiri (nama) + nilai mono di kanan (selalu tampil, editable via klik → input).
  - State: hover thumb scale 1.15 (150 ms); dragging menampilkan tooltip nilai.

- **Dropdown / Select**
  - Trigger: button ghost dengan chevron 12 px.
  - Menu: bg `--bg-elevated`, shadow-2, radius 6, max-height 240 px dengan scroll.
  - Item: tinggi 28 px, hover bg `--bg-panel`, selected menampilkan checkmark `--active`.
  - Searchable bila > 8 item (input di atas menu).

- **Toggle (switch)**
  - 32×18 px, track bg `--border-subtle` off / `--active` on, thumb 14 px putih.
  - Animasi translate 150 ms ease-out. Label di kiri.

- **Checkbox / Radio**
  - 16 px, border `--border-subtle`, checked fill `--active` + checkmark putih.
  - Radio: bulat.

- **Tabs (kontekstual, bukan inspector)**
  - Dipakai hanya untuk Media Panel (Semua/Folder/Grup/Favorit) dan Settings sidebar kategori.
  - Underline 2 px `--active` pada tab aktif; tab lain text muted.
  - Tidak dipakai sebagai "tab statis" di Inspector.

- **Modal**
  - Backdrop `--bg-overlay` opacity 0.5, tanpa blur.
  - Container: bg `--bg-panel`, radius 10, shadow-3, padding 20.
  - Header: judul 20 semibold + tombol close (ghost, ikon X).
  - Footer: tombol rata kanan (Cancel ghost, Primary active).
  - Animasi: fade + scale 0.98→1, 150 ms.

- **Toast**
  - Posisi: kanan bawah di atas status bar, stack vertikal, max 3.
  - Tinggi auto, lebar max 360, radius 10, shadow-2, bg `--bg-elevated`.
  - Ikon status kiri (success/danger/warning/info) + teks 13 + tombol aksi opsional + close.
  - Auto-dismiss 4 s (kecuali error persisten). Animasi slide-in dari kanan 150 ms.

- **Tooltip**
  - bg `--bg-elevated`, text 12, radius 4, shadow-2, padding 4/8.
  - Delay 300 ms sebelum tampil; instant saat sudah hover chain.
  - Shortcut ditampilkan dalam `<kbd>` mono.

- **Badge**
  - 4 px radius, padding 2/6, font 11 medium.
  - Variant warna status (success/danger/warning) dengan bg opacity 0.15 + text warna status; neutral bg `--bg-elevated` text muted.

- **Progress bar**
  - Track 4 px pill bg `--border-subtle`; fill `--active`.
  - Deterministik 0–100 dengan % teks mono di kanan (12 px).
  - Indeterminate: bar 30% lebar bergerak (satu-satunya animasi non-150ms, linear 1.2 s) hanya untuk operasi tanpa total.

- **Skeleton**
  - Bar abu `--bg-elevated` dengan shimmer opacity 0.6→1 (150 ms? gunakan 1.2 s linear pulse) — hanya untuk daftar ≥ 5 item.

- **Spinner**
  - 16 px, stroke 2 px, warna putih opacity 0.6, rotasi 360° 800 ms linear. Dipakai inline.

### 7.2 Main Editor

**Top Bar (tinggi 40 px)**
- Kiri: menu bar (File, Edit, View, Track, AI, Help) — teks 13, hover underline.
- Tengah-kiri: nama proyek (editable inline, klik → input, Enter simpan, Esc batal).
- Tengah: undo/redo (ikon 16, disabled state), shuttle controls (J/K/L ikon 16), timecode mono 13 (format `00:00:00:00`), tombol Export (primary, active #ff6600, tinggi 28).
- Kanan: Settings gear (ghost), window controls (min/max/close, Windows style).
- Border bawah `--border-subtle`.

**Media Panel (kiri, default 280 px, resizable 200–480)**
- Header: tab row (Semua/Folder/Grup/Favorit) + tombol view toggle (grid/list) + tombol Impor (ghost, ikon +).
- Body: grid thumbnail 4 kolom (gap 8) atau list (baris 48 px).
- Thumbnail card: rasio 16:9, radius 6, overlay durasi (mono 11, kanan bawah), badge indeks (✓ kecil success) pojok kiri atas, hover menampilkan grip 6-dots + checkbox selection.
- Footer: progress import (jika berjalan) + status indeks.
- Empty: hint text + 2 tombol (Impor file / Impor folder).
- Drag: thumbnail draggable; drop zone di timeline highlight border putus-putus `--active`.

**Preview (tengah atas, flex)**
- Canvas WebGL, rasio proyek, bg hitam.
- Overlay top-left: timecode mono 12 (opacity 0.8).
- Overlay top-right: safe-area toggle, fullscreen toggle (ikon 16).
- Overlay bottom: in/out point markers (garis vertikal kuning/putih).
- Tracking overlay: bbox/landmark/skeleton (stroke 1.5, warna per target: #ff6600, #4ade80, #f59e0b, #ef4444 rotating) + ID + confidence (11 px) saat sesi aktif.
- Empty: area hitam + hint 12 px muted di tengah.
- Loading: spinner 16 px pojok kanan bawah.
- Error: area hitam + teks danger + tombol Relink/Hapus.

**Timeline (tengah bawah, default 240 px, resizable 120–480)**
- Struktur: ruler (timecode) di atas + track lanes + playhead overlay.
- Track header (kiri, lebar 120 px): nama track (editable), ikon tipe, mute/solo (audio), lock, visibility (video), tombol hapus track.
- Track lane: tinggi 40 px (video/overlay/text), 32 px (audio). Background `--bg-panel`, border bawah `--border-subtle`.
- Clip block: radius 4, bg `--bg-elevated`, border 1 px `--border-subtle`; thumbnail strip di dalam; audio clip menampilkan waveform.
- Clip edge handle: 6 px lebar di kiri/kanan, cursor ew-resize, hover highlight `--active`.
- Playhead: garis vertikal 2 px `--active` dengan triangle handle di atas (ruler).
- Marker: diamond 8 px `--accent` (putih) di ruler, label opsional 11 px di atas.
- Keyframe lane: baris 16 px di bawah clip (toggle), diamond 8 px `--warning`/`--active`.
- Snap grid: garis vertikal tipis `--border-subtle` opacity 0.3 pada interval zoom-dependent.
- Empty: track kosong dengan garis putus-putus `--border-subtle` + hint.

**Inspector (kanan, default 320 px, resizable 240–480) — CONTEXTUAL**
- Header: judul objek yang dipilih (mis. "Klip: DSC_0042.mp4") + tombol collapse section "Semua".
- Body: daftar section collapsible (chevron 12 px), animasi expand 150 ms.
- Empty: hint + daftar shortcut relevan.
- Loading: skeleton 3 baris abu.
- Error: teks danger + "Coba lagi".

**Prompt Bar (dock bawah, tinggi 56 px, collapse ke 32)**
- Kiri: tombol mic (ghost, ikon mic 20) + status chip (idle/memahami/melacak/diantre).
- Tengah: input teks (placeholder "Ketik perintah... (Ctrl+P)"), font 13.
- Kanan: tombol "Kirim" (primary, tinggi 32), tombol riwayat (ghost, ikon clock).
- Status chip: warna status (diantre warning, error danger, melacak active).
- Collapse: chevron di kanan; collapsed menampilkan hanya status chip + ikon mic.

**Status Bar (tinggi 24 px)**
- Kiri: indeks progress (jika berjalan) + fps preview (mono 11).
- Tengah: "Autosaved 12s ago" (muted 11).
- Kanan: koneksi AI (ikon 12, hijau/merah), ukuran proyek.

### 7.3 Welcome Screen

- Layout: dua kolom. Kiri (flex): logo (wordmark, 24 semibold) + tagline 16 muted + 3 tombol vertikal (Proyek baru primary, Buka proyek secondary, Impor folder ghost), lebar tombol 240.
- Kanan (320 px): daftar proyek terakhir (5 item, baris 56 px: thumbnail 48 + nama + metadata muted) + "Lihat semua" link.
- Bawah: status koneksi AI (ikon + teks 12) + versi app (muted 11).
- First-run: banner tipis di atas (bg elevated, border subtle) dengan tip + close.
- Empty (no recent): kanan menampilkan hint 12 muted + tombol "Proyek baru".

### 7.4 Project Manager

- Modal/panel slide-in kiri, lebar 480 px, shadow-3.
- Header: judul "Proyek" 20 + search input + sort dropdown.
- Body: lazy list, baris 72 px: thumbnail cover 64 + nama (14 semibold) + metadata (durasi, jumlah klip, ukuran, muted 11) + aksi (Buka primary kecil, menu "..." ghost).
- Footer: tombol "Proyek baru" (primary) + "Impor .keylox" (ghost).
- Empty: hint + tombol.
- Loading: skeleton 5 baris.
- Error: teks danger + "Coba lagi".

### 7.5 Export Dialog

- Modal tengah, lebar 640 px.
- Header: "Export" 20 + close.
- Body dua kolom:
  - Kiri: preset list (TikTok, IG Reels, YouTube 1080p/4K, Custom) sebagai radio card (radius 6, border subtle, selected border active 2 px).
  - Kanan: form settings (resolusi dropdown, fps dropdown, bitrate slider+input, codec dropdown, container dropdown, audio toggle). Toggle "AI pilih setelan" (switch) di atas.
- Bawah body: estimasi ukuran + durasi render (mono 12, muted) + progress area (saat exporting).
- Footer: Cancel (ghost) + Export (primary active). Saat exporting: Export disabled, progress bar + % + ETA + tombol "Batal".
- State sukses: centang success 24 + "Export selesai" + "Buka folder" + "Tutup".
- State error: teks danger + kode + pesan + "Coba lagi"/"Ganti setelan".

### 7.6 Settings

- Modal/window, lebar 800 px, tinggi 600.
- Sidebar kiri 200 px: kategori (Umum, AI & Koneksi, Performa, Shortcut, Privasi, Tentang) sebagai list, selected bg elevated + border-left active 2 px.
- Konten kanan: section dengan judul 16 + form rows (label kiri 160 px + control kanan flex).
- Koneksi AI: status dot + latensi + tombol "Test koneksi" (ghost) + spinner.
- Shortcut: tabel (aksi | shortcut | edit button).
- Perubahan yang butuh restart: badge warning "Perlu restart".
- Footer: "Simpan" (primary) — meski auto-apply, tombol konfirmasi untuk perubahan besar.

### 7.7 Tracking Editor (overlay)

- Overlay pada area preview, kanan bawah, dapat di-dock ke panel kanan. Ukuran default 480×320, resizable.
- Layout tiga kolom:
  - Kiri (120 px): daftar target (baris 28 px: warna dot + ID + status badge).
  - Tengah (flex): keyframe timeline per target terpilih (track mini dengan diamond keyframe, playhead).
  - Kanan (140 px): smoothing (radio 0/1/2), offset (dx, dy, scale, rot input number), trim start/end, tombol "Re-lacak dari sini".
- Header: judul "Tracking" 14 + tombol dock/close.
- State: empty hint; tracking berjalan progress+cancel; drift tinggi badge warning; target hilang badge danger.

### 7.8 EditPlan Preview (modal)

- Modal tengah, lebar 720 px, tinggi max 80vh.
- Header: perintah asli (13 muted, italic) + confidence badge + tombol close.
- Body atas: storyboard thumbnail horizontal (scroll, tinggi 80 px, gap 8).
- Body tengah: daftar langkah (baris 48 px): drag handle (6 dots) + toggle checkbox + teks langkah (13) + edit durasi/param (ghost kecil) + badge status.
- Footer: "Minta versi lain" (ghost) + "Tolak" (ghost) + "Terapkan" (primary active).
- State loading: skeleton daftar + "Menyusun rencana...".
- State klarifikasi: pertanyaan + radio opsi + "Kirim pilihan".
- State error: teks danger + detail + "Coba lagi"/"Ubah perintah".
- State empty: hint.

---

## §8 Inspector Contextual

Prinsip: panel kanan **berubah isi** sesuai seleksi. Tidak ada tab statis. Transisi swap konten: fade 150 ms (opacity 0→1), tidak ada slide.

### 8.1 Aturan umum

- Header panel: nama objek yang dipilih (14 semibold) + tipe (badge kecil muted) + tombol "..." (menu: duplikat, hapus, salin properti).
- Section: collapsible, default expanded untuk section pertama, collapsed untuk sisanya; state collapse disimpan per tipe objek.
- Field: label 12 muted di kiri (lebar 100 px) + control di kanan (flex). Jarak antar field 8 px.
- Keyframe toggle: ikon diamond 12 px di kanan label; aktif = `--active` (filled), nonaktif = outline muted. Klik membuat field keyframed pada playhead.
- Binding badge: chip kecil `--bg-elevated` dengan ikon link + "terikat ke Target #id" (warning color jika invalid).

### 8.2 State "tidak ada seleksi"

- Hint: "Pilih klip, teks, efek, atau target untuk mengedit propertinya."
- Daftar shortcut relevan (12 muted): "Space play, I/O in-out, Ctrl+B split, Delete hapus".
- Tidak ada form.

### 8.3 Klip video (selected)

Section (urutan):
1. **Transform** — Position (x, y px), Scale (%, link aspect), Rotation (°, slider -180..180), Anchor (9 titik grid), Opacity (%), Flip H/V (toggle).
2. **Color** — Brightness, Contrast, Saturation, Temperature, Tint (slider -100..100), Hue (°), LUT (dropdown + intensity), Curves (tombol "Buka curves" → modal), Vignette (slider).
3. **Effect** — daftar efek aktif (chip removable) + tombol "Tambah efek" (dropdown 17 shader) + tiap efek: parameter slider + keyframe toggle.
4. **Mask** — Type (None/Linear/Radial/Path), Feather, Invert, Opacity, Tracking bind (dropdown target).
5. **Blend** — Mode (dropdown 16 blend modes), Opacity.
6. **Audio** — Volume (slider -∞..+6 dB), Mute (toggle), Fade in/out (handle di timeline + input), EQ (3 band), Ducking (toggle + target).
7. **Tracking** — "Lacak subjek" (button) + daftar target (mini) + status.

### 8.4 Teks

1. **Content** — Text area (multi-line), Font (dropdown), Size (number), Weight (dropdown), Color (picker sederhana: swatch 8 warna palet + hex input), Align (left/center/right), Letter spacing.
2. **Style** — Stroke (warna + width), Shadow (offset + blur + color), Background box (toggle + color + padding), Line height.
3. **Animation** — In (dropdown 12 animasi) + durasi, Out + durasi, Easing (dropdown), Delay.
4. **Position & Tracking** — Anchor (9 titik), Offset (x,y), "Tempel ke target" (dropdown target + anchor point: center/top/bottom/left/right + offset dx,dy), Badge binding.
5. **Timing** — Start, Durasi (linked ke timeline), Fade.

### 8.5 Audio clip

1. **Volume** — slider + input dB, Mute toggle, Solo toggle.
2. **Fade** — Fade in (detik), Fade out (detik), curve (linear/log).
3. **EQ** — 3 band (low/mid/high) slider dB.
4. **Ducking** — toggle + target (audio/voice) + amount dB + attack/release.
5. **Info** — nama file, durasi, sample rate, channel (muted 11).

### 8.6 Effect instance (saat efek dipilih di daftar)

1. **Params** — daftar parameter shader (slider sesuai tipe: float/vec2/color/enum) + keyframe toggle per param.
2. **Rentang waktu** — start, end (linked ke clip).
3. **Blend dengan klip** — opacity efek.

### 8.7 Tracking target (saat target dipilih)

1. **Target info** — ID, tipe (Wajah/Tangan/Badan/Objek/Area/Titik/Gerak), confidence rata-rata (badge warna), jumlah keyframe.
2. **Keyframes** — jumlah, status (OK/drift/hilang), tombol "Buka Tracking Editor".
3. **Smoothing** — level 0/1/2 (radio).
4. **Offset** — dx, dy, scale, rot (number input).
5. **Trim** — start frame, end frame.
6. **Binding list** — daftar konsumen terikat (teks/efek/mask/cutout/kamera) dengan badge status; tombol "Lepas binding".

### 8.8 Mask

1. **Type** — None/Linear/Radial/Path/Tracking.
2. **Params** — Feather, Invert, Opacity, Expand.
3. **Tracking bind** — dropdown target + mode (follow bbox / follow landmark).

---

## §9 Timeline Visual

### 9.1 Ruler (skala waktu)

- Baris tinggi 20 px di atas track.
- Tick mark: interval adaptif berdasarkan zoom (1s/5s/10s/30s/1min/5min).
- Label timecode mono 10 px di tick utama.
- Background `--bg-panel`, border bawah `--border-subtle`.

### 9.2 Track lanes

- Track header (kiri, 120 px): bg `--bg-panel`, border kanan `--border-subtle`.
  - Baris 1: ikon tipe (16) + nama (12, editable inline) + tombol collapse (chevron).
  - Baris 2: tombol kecil (mute/solo/lock/visibility) 16 px, gap 4.
- Track body: bg `--bg-app` dengan garis horizontal `--border-subtle` opacity 0.5 per track.
- Drop zone saat drag: highlight bg `--active` opacity 0.1 + border putus-putus `--active`.

### 9.3 Clip block

- Radius 4, border 1 px `--border-subtle`, bg `--bg-elevated`.
- Thumbnail strip: gambar frame tiap ~1 s (atau sesuai zoom) di dalam clip, object-fit cover.
- Label nama (11, primary) di kiri atas dengan text-shadow hitam tipis (satu-satunya shadow teks, untuk keterbacaan di atas thumbnail).
- Durasi (mono 10) di kanan bawah.
- Audio clip: waveform (stroke 1 px, warna `--active` opacity 0.7) mengisi clip; volume envelope opsional (garis putus).
- Selected clip: border 2 px `--active`, shadow-1.
- Hover: brightness 1.05, cursor grab.
- Edge handle: 6 px, bg `--active` opacity 0 (hover opacity 1), cursor ew-resize.

### 9.4 Playhead

- Garis vertikal 2 px `--active`, tinggi penuh timeline + ruler.
- Handle di ruler: segitiga 10 px `--active` menghadap bawah.
- Bergerak via rAF, tanpa CSS transition.
- Saat scrub (drag handle): tampil timecode tooltip mono 12 di atas handle.

### 9.5 Marker

- Diamond 8 px `--accent` (putih) di ruler, rotasi 45°.
- Label opsional 11 px di atas diamond (bg elevated, radius 4, padding 2/4).
- Klik marker → jump playhead. Drag marker → ubah waktu. Hover → tooltip nama + waktu.

### 9.6 Keyframe diamond

- 8 px diamond, fill `--warning` (#f59e0b) untuk keyframe user, `--active` untuk keyframe yang sedang dipilih/drag.
- Posisi: di keyframe lane (baris 16 px di bawah clip) pada waktu yang sesuai.
- Hover: scale 1.2 (150 ms). Drag: garis vertikal guide `--border-strong`.
- Tooltip: parameter + nilai + waktu.

### 9.7 Waveform

- Render via canvas, stroke 1 px `--active` opacity 0.6.
- Background track body.
- Fade handle: segitiga kecil di pojok clip (audio) untuk drag fade in/out.

### 9.8 Snap grid

- Garis vertikal 1 px `--border-subtle` opacity 0.25 pada interval yang bergantung zoom.
- Snap target: playhead, marker, clip edge, keyframe (magnet 8 px).
- Saat snap aktif: garis guide `--active` 1 px opacity 0.8 + tooltip waktu.

---

## §10 Empty / Loading / Error State (minimal)

Prinsip: hint text 1 baris (#888, 12 px) + maksimal 1 tombol aksi (outline putih). Tidak ada ilustrasi stock, maskot, animasi Lottie, empty-state artwork.

### 10.1 Pola komponen state (4 state standar)

| State | Visual | Perilaku |
|---|---|---|
| Empty | Hint text 1 baris (#888, 12px) + maksimal 1 tombol aksi (outline putih, ghost). Tidak ada ilustrasi. | Aksi utama mengisi state (import/tambah). |
| Loading | Spinner 16px inline (putih, opacity 0.6) + teks status singkat. Skeleton hanya untuk daftar ≥ 5 item. | Operasi dapat dibatalkan bila > 2 s. |
| Error | Teks merah (#ef4444) 1 baris + kode error (kecil, #888) + tombol "Coba lagi" (outline). | Retryable sesuai error shape. |
| Populated | Konten normal. | — |

### 10.2 Aturan loading

- Loading > 200 ms baru tampil spinner (hindari flicker).
- Loading > 2 s wajib tombol "Batal" (bila operasi dapat dibatalkan).
- Loading tidak memblokir seluruh window kecuali operasi destruktif (export, hapus proyek) — gunakan modal progress.
- Progress bar deterministik (0–100%) untuk operasi dengan total diketahui; indeterminate hanya untuk operasi tanpa total.

### 10.3 Aturan error

- Pesan user-facing berasal dari `error.message` (bahasa manusia), bukan kode.
- Kode error ditampilkan kecil (#888) hanya di tooltip/detail.
- Retryable → "Coba lagi"; non-retryable → "Tutup" + saran.
- Error jaringan AI → "Mode offline; perintah diantre." (bukan "gagal").
- Crash → dialog "Terjadi kesalahan tak terduga" + "Restart"/"Laporkan".

### 10.4 Contoh empty state yang benar

- Media Panel kosong → "Belum ada media. Drag file ke sini atau tekan Ctrl+I." + tombol "Impor file".
- Timeline kosong → "Belum ada klip. Drag media ke sini atau ketik perintah." (tanpa ilustrasi).
- Preview kosong → area hitam + "Tambah klip ke timeline atau jalankan perintah AI."
- Inspector kosong → "Pilih klip/teks/efek untuk mengedit propertinya."
- Tracking kosong → "Belum ada target. Pilih 'Lacak subjek' untuk mulai."

Contoh yang salah (dilarang): ilustrasi folder dengan wajah tersenyum + "Mulai kreativitasmu!".

### 10.5 Contoh loading/error per region

- Media Panel loading import: progress bar inline + "Membatalkan" + nama file saat ini.
- Media Panel error probe: thumbnail dengan badge merah + tooltip alasan + "Hapus".
- Preview loading decode: spinner kecil pojok kanan bawah; frame terakhir tetap tampil.
- Preview error corrupt: area hitam + "Media tidak dapat diputar" + "Relink"/"Hapus klip".
- Timeline loading thumbnail strip: placeholder abu per klip; waveform muncul saat siap.
- Inspector loading: skeleton 3 baris abu 150 ms lalu isi.
- Prompt Bar: idle placeholder + mic; memahami spinner + "Memahami..." + "Batal"; diantre chip kuning; error chip merah.

---

## §11 Responsif & HiDPI

### 11.1 Target resolusi

- Minimum: 1280 × 720. Resize di bawah minimum ditolak dengan toast "Resolusi minimum 1280×720".
- Optimal: 1920 × 1080 (layout default).
- HiDPI: scaling 1×/1.25×/1.5×/2×. Semua ukuran dalam CSS logical px; ikon & thumbnail di-render 2× pada HiDPI (devicePixelRatio). Teks tidak blur.

### 11.2 Strategi layout adaptif

- Panel (Media, Inspector) dapat di-collapse ke rail 48px via tombol atau Ctrl+1/3; state disimpan.
- Timeline tinggi dapat dikecilkan hingga 120px (hanya track header + playhead).
- Preview area selalu mendapat ruang prioritas (flex-grow); panel side fixed width.
- Lebar < 1440 px: Media Panel default collapse ke rail; Inspector default 280 px.
- Lebar ≥ 1920 px: semua panel default terbuka; timeline 320 px.
- Lebar ≥ 2560 px (4K): opsi "layout luas" di Settings → Tampilan.

### 11.3 HiDPI & performa

- Thumbnail strip di-render sesuai devicePixelRatio (max 2×).
- WebGL preview canvas = container × devicePixelRatio, capped 2×.
- Font rendering: subpixel antialiasing Windows (ClearType), grayscale macOS.
- Icon stroke 1.5 px logical → 3 px pada 2×.
- Resize handle lebar 6 px logical (12 px pada 2×) agar mudah di-grab.

### 11.4 Collapse panel (rail mode)

- Rail 48 px: ikon 20 px vertikal, tooltip on hover, klik expand.
- Animasi collapse: width 280→48, 150 ms ease-out, konten fade out 100 ms.
- State collapse disimpan per proyek (`windowState.<projectId>`).

---

## §12 Aksesibilitas

### 12.1 Kontras

- Text primary #f0f0f0 pada bg #1a1a1a = 15.3:1 (≥ WCAG AAA).
- Text muted #888 pada #1a1a1a = 5.9:1 (≥ AA).
- Danger #ef4444 pada #1a1a1a = 5.1:1 (≥ AA large text; untuk teks kecil gunakan pada bg elevated atau bold).
- Active #ff6600 pada #1a1a1a = 5.4:1 (≥ AA large text; tombol primary menggunakan text putih pada bg active = 4.6:1, ≥ AA).
- Tidak ada teks di bawah 4.5:1 kontras (kecuali disabled, yang tidak memerlukan interaksi).

### 12.2 Focus ring

- 2 px solid putih (#ffffff) dengan offset 2 px pada semua elemen interaktif.
- Tidak boleh dihilangkan (`outline: none` dilarang tanpa pengganti).
- Focus visible hanya saat navigasi keyboard (bukan mouse click) untuk estetika, tetapi ring tetap ada untuk keyboard.
- Urutan tab logis: top bar → media panel → preview → timeline → inspector → prompt bar → status bar.

### 12.3 Keyboard

- Semua interaktif dapat diakses keyboard (lihat §4 shortcut map).
- Modal: focus trap (Tab cycle dalam modal), Esc tutup, Enter konfirmasi primary.
- Dropdown: Arrow up/down navigasi, Enter pilih, Esc tutup.
- Slider: Arrow left/right ±1, Shift+Arrow ±10, Home/End min/max.
- Timeline: Arrow left/right frame step, Space play/pause (saat tidak ada input fokus).

### 12.4 Screen reader

- Landmark regions: `<header>` top bar, `<nav>` menu, `<main>` preview+timeline, `<aside>` media & inspector, `<footer>` prompt+status.
- Ikon button wajib `aria-label` (bahasa Indonesia, mis. "Putar", "Jeda", "Ekspor").
- State dinamis diumumkan via `aria-live="polite"` untuk: status AI (memahami/melacak), progress indeks, autosave.
- Gambar thumbnail: `alt` = nama file + durasi.
- Clip di timeline: `role="button"` + `aria-label` "Klip DSC_0042, durasi 5 detik, mulai 0:12".
- Tracking overlay: tidak perlu diumumkan per frame; status target diumumkan saat berubah (OK/drift/hilang).

### 12.5 Reduced motion

- `prefers-reduced-motion: reduce` → semua transisi 0 ms, spinner tetap (loading indicator wajib), playhead tetap bergerak (fungsional, bukan dekoratif).

### 12.6 Touch target (untuk laptop dengan touchscreen)

- Minimum 24 px (laptop touch jarang); ideal 32 px untuk tombol.
- Handle resize 6 px logical dengan hit area 12 px.

### 12.7 Warna bukan satu-satunya pembeda

- Status selalu disertai ikon + teks, tidak hanya warna.
- Error field: border merah + ikon + teks pesan.
- Tracking status: badge warna + teks (OK/Drift/Hilang).

---

*Bagian visual §6+ ditulis oleh ui-designer (STAGE 3, bagian 2). Patokan anti-AI-slop: palet terkunci, inspector contextual, timeline multi-track, empty state minimal, animasi 150ms.*
