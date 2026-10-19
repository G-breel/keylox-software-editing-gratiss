# PRD / Product Spec — **Keylox**

> **Stage 1 dari SUPERAPP_PIPELINE** · Dokumen ini adalah bahan GATE 1 dan sumber kebenaran untuk stage berikutnya (arsitektur, database, UI, QA).
> Pipeline: `00-spec.md` (ini) → `01-arsitektur` → `02-...` → `06-database` → `07-...`

| Field | Nilai |
|---|---|
| **Produk** | Keylox — Super App Video Editing **AI-First + Tracking-first** |
| **Status** | Draft v2.2 — **REVISI Stage 1 (perubahan arah proyek): platform mobile → desktop Electron** — menunggu persetujuan |
| **Author** | Alex (Product Manager) |
| **Tanggal** | 19 Oktober 2026 |
| **Versi** | 2.2 (menggantikan v2.1) |
| **Baseline kompetitor** | Keyflow `com.angkin.keyflow` v1.3.2 (reverse engineering apktool) |
| **Platform utama** | Desktop - Electron (Node.js + Chromium) + native FFmpeg; Windows (primary), macOS & Linux (secondary) |
| **Model AI cloud** | Google Gemini API — `gemini-2.5-flash` (natural language, video understanding, vision/OCR, ASR, TTS) |
| **Model AI on-device** | MediaPipe Tasks (ImageSegmenter, InteractiveSegmenter, FaceLandmarker, HandLandmarker, PoseLandmarker, GestureRecognizer, ObjectDetector, ImageClassifier, ImageEmbedder) |
| **Kemampuan inti** | **AI editing (M12)** dan **Tracking Engine (M14)** — keduanya inti, keduanya MVP + Must |
| **Model bisnis** | **100% GRATIS. Tanpa watermark, tanpa iklan, tanpa langganan, tanpa paywall.** |
| **Stakeholder** | Eng Lead, Design Lead, Legal, Support/CS |

### Riwayat revisi

| Versi | Sumber | Ringkas |
|---|---|---|
| 1.0 | Draft awal | 177 fitur, monetisasi ada (watermark + AdMob + Pro) |
| 2.0 | GATE 1 | Monetisasi dihapus total; AI dipromosikan jadi inti; batch import folder; 225 perintah AI |
| **2.1** | **GATE 1 ulang** | **Tracking dipromosikan jadi kemampuan INTI** (fitur baru `M14 TR-01..TR-15`, semua MVP + Must); **Tracking Capability Matrix**; **251 perintah AI**; integrasi tracking↔efek & tracking↔mask |
| **2.2** | **REVISI Stage 1** | **Platform berubah: bukan aplikasi mobile, tapi aplikasi desktop (.exe) untuk laptop** — Electron (Node.js + Chromium) + native FFmpeg, AI via Gemini API. Stack & NFR berubah; fitur/konten tetap (AI-first, tracking inti, 205 fitur, 154 MVP, 251 perintah AI). Thermal/baterai mobile dihapus; distribusi .exe (NSIS + portable) |

### Perubahan dari v2.0 → v2.1 (hasil GATE 1 ulang: "utamakan fitur tracking-nya juga")

| # | Perubahan | Dampak |
|---|---|---|
| 7 | **Tracking menjadi kemampuan INTI (sejajar AI editing)** — modul baru **M14 Tracking Engine** dengan 15 fitur `TR-01..TR-15` | **15 fitur baru, semuanya MVP + Must**, punya AC terukur & perintah AI |
| 8 | **Semua fitur tracking lama naik ke MVP + Must** | `D-03` interactive select (v2→MVP), `D-06` pose (v2→MVP), `D-07` gesture (v2→MVP), `D-12` face blur (v2→MVP), `X-08` stabilisasi (v3→MVP), `S-10` tracking text (v2→MVP), `D-09` object detection (Should→**Must**), `D-13` cache tracking (Should→**Must**) |
| 9 | **Section baru: Tracking Capability Matrix (§7)** | 15 baris tracking × input → output → konsumen → perintah AI → status |
| 10 | **Perintah AI diperluas: 225 → 251** (2 grup baru: **N tracking** 226–249, **O operasional** 250–251) | Bahan Stage 4; **utang perintah turunan (`†`) dilunasi** |
| 11 | **Integrasi tracking ↔ efek & mask wajib** | Efek spasial (glow, lens blur, chromatic aberration, find edges, twitch, partikel, animasi, motion) & mask (K-03/K-04) harus dapat di-bind ke target tracking |
| 12 | **Utang `†` turun 23 → 16 fitur** (7 fitur tracking & export kini punya perintah kanonik), dan **0 fitur MVP** yang bergantung hanya pada perintah turunan | Menutup temuan GATE 1 sebelumnya |

### Perubahan dari v1.0 → v2.0 (GATE 1) — tetap berlaku

| # | Perubahan | Dampak |
|---|---|---|
| 1 | **Seluruh monetisasi dihapus** (modul M13, watermark, AdMob, IAP, subscription, paywall, kredensial entitlement) | 10 fitur dihapus; semua fitur jadi gratis; entitas `Subscription`, `AdSession`, `WatermarkConfig` dihapus |
| 2 | **AI dipromosikan jadi inti MVP** (bukan pendamping). Prinsip: *cukup prompt → AI langsung edit semuanya* | 26 dari 33 fitur AI kini di MVP; Timeline manual jadi **opsional/pendamping** |
| 3 | **Section baru: AI Action Coverage Matrix** — setiap fitur editing wajib punya perintah AI pemicu | **128/128** fitur editing MVP tercakup saat v2.0 → **149/149** setelah v2.1; masing-masing 100% |
| 4 | **Import batch dari folder + AI indexing** (fitur baru, MVP) | 5 fitur baru (`P-10`..`P-14`), entitas baru (`MediaIndex`/`AssetInsight`, `PromptTemplate`, `EditRecipe`) |
| 5 | **AI wajib bisa menambah/mengatur semua 17 efek shader + filter + transisi + animasi + mask + blend** | 9 shader & 4 mask/blend/color-tool naik ke MVP; 12 fitur efek/animasi baru (`E-20`..`E-25`) |
| 6 | **Perintah AI diperluas** dari 50 → **225 perintah** (v2.0), kini **251** (v2.1) | Bahan langsung untuk Stage 4 (prompt engineering) |

> **Catatan ID stabil:** ID fitur (`P-01`, `T-14`, `G-21`, `TR-01`, dst.) **dipertahankan** dari v1.0 agar traceability ke stage 2–8 tidak putus. ID yang dihapus (`U-01`..`U-10`, `R-05`, `R-06`) **tidak didaur ulang** — nomor dibiarkan kosong dengan catatan. **M13** juga dibiarkan kosong (jejak modul monetisasi), sehingga modul tracking memakai nomor **M14**. ID risiko/asumsi (`RSK-*`, `ASM-*`) **bukan kontrak** dan boleh berubah.

---

## 0. Ringkasan Eksekutif (PR-FAQ singkat)

**Press release satu paragraf.**
Keylox adalah editor video desktop yang **digemari karena satu hal: cukup bilang apa yang kamu mau, videonya jadi.** Pengguna tidak perlu memahami timeline, keyframe, curves, atau chroma key — cukup menulis atau mengucapkan perintah seperti *"bikin video 45 detik bergaya cinematic dari folder liburan, pakai musik ceria, kasih subtitle Indonesia"*, lalu AI menyusun rencana edit, menampilkan pratinjau, dan menerapkannya. **Keylox juga mengerti isi videonya secara harfiah** — ia dapat **melacak** wajah, tangan, badan, gestur, dan objek bergerak di dalam footage, sehingga teks, sticker, efek, mask, dan bahkan kamera virtual bisa **menempel pada orang atau benda yang bergerak** — bukan sekadar menempel di layar. Di belakang layar Keylox memiliki **seluruh kekuatan editor kelas pro** (timeline multi-track, 17 efek shader, color grading lengkap, mask, blend, chroma key, tracking & stabilisasi, efek partikel) sehingga setiap hasil AI masih bisa diutak-atik manual oleh yang mau. **Semua ini gratis: tanpa watermark, tanpa iklan, tanpa langganan.** Fitur Keyflow direplikasi lengkap sebagai fondasi yang sudah tervalidasi pasar; **AI editing dan tracking adalah dua alasan produk ini ada.**

**FAQ (yang paling sering ditanya)**
- *Kalau saya tidak mau repot, apa yang harus saya lakukan?* — Buka app, ucapkan/tulis satu perintah, tekan Apply. Selesai. Timeline manual sepenuhnya opsional.
- *Kalau saya mau kontrol penuh?* — Semua lapisan manual tetap ada (timeline, keyframe, curves, mask, blend, **tracking editor**), dan **setiap** dari mereka juga bisa dipanggil lewat perintah AI.
- *Ada fitur tracking?* — Ya, dan itu salah satu kemampuan inti. "Lacak wajah dan tempelkan text di atasnya", "tempelkan sticker ke tangan yang bergerak", "biarkan mask ini mengikuti orangnya", "stabilkan video ini", "buat background blur tapi subjek tetap fokus" — semuanya satu perintah.
- *Apakah berbayar?* — Tidak. Tidak ada watermark, iklan, langganan, atau fitur terkunci.
- *Kalau internet mati?* — Editing inti (timeline, trim, color, effect, **tracking**, export) dan sebagian perintah AI dasar tetap jalan offline. Fitur pemahaman video (subtitle, scene detect, pencarian momen) butuh internet dan otomatis diantre.
- *Kenapa bukan model `magic_touch.tflite` milik Keyflow?* — Model itu proprietary dan tidak boleh dipakai. Keylox memakai model open-source MediaPipe Selfie/MultiClass Segmentation.
- *Apakah video saya diupload ke server?* — Tidak untuk fitur on-device — dan **tracking sepenuhnya on-device**. Untuk fitur Gemini, hanya dikirim dengan **persetujuan eksplisit per sesi** (detail di §13).

**Fakta kunci eksekusi:** **205 fitur** (MVP 154 · v2 39 · v3 12) · **251 perintah AI** · **100% fitur editing MVP punya perintah AI pemicu (149/149)** · **15/15 fitur tracking MVP + Must** · seluruh 17 efek shader Keyflow, 13 fitur MediaPipe, timeline multi-track + keyframe, dan seluruh kelompok audio tersedia. Tidak ada fitur Keyflow yang di-drop.

---

## 1. Problem Statement & Target User

### 1.1 Problem statement

> **Kreator video di desktop (laptop) punya bahan melimpah tetapi tidak punya waktu, skill, atau kesabaran untuk mengeditnya menjadi konten selesai.**
> Editor yang lengkap (CapCut/Keyflow kelas pro) menuntut puluhan tap manual untuk setiap perubahan gaya dan memaksa seluruh keputusan editing (mana bagian bagus, apa captionnya, warna apa yang cocok, musik apa yang pas) dikerjakan manusia dari nol. Editor yang "instan" berbasis template menghasilkan output generik yang tidak bisa dikustomisasi.
>
> Akibatnya: (1) satu video pendek 3–15 menit memakan 1–3 jam kerja, mayoritas untuk *mechanical labor* (potong jeda diam, bikin subtitle manual, cari bagian layak, ganti warna klip satu per satu, cari musik); (2) kreator pemula berhenti di "video mentah + musik"; (3) bahan menumpuk tak terpakai di galeri karena **tidak terindeks** — orang tidak tahu apa yang dia punya dan di mana momen bagusnya.

**Biaya tidak menyelesaikan masalah ini:** kreator tetap kehilangan 2–3 jam per video, bahan menumpuk tak terpakai, dan kualitas output stagnan karena keputusan kreatif yang sulit (color grading, struktur cerita) jarang diambil orang awam.

**Kenapa AI-first adalah jawabannya (dan bukan tambahan):** semua *mechanical labor* di atas adalah pekerjaan yang AI bisa lakukan jauh lebih cepat — memotong, memilih, memberi warna, menulis caption, mencari momen. Yang tersisa untuk manusia hanya **niat** dan **selera**. Maka produk ini harus dirancang dari sisi prompt, bukan dari sisi tool palette.

**Kenapa tracking juga inti (temuan GATE 1 ulang):** masalah kedua yang sama melelahkannya adalah **bahan yang bergerak**. Begitu pengguna ingin teks, sticker, efek, blur, atau mask *menempel* pada orang/benda yang bergerak, editor mobile konvensional menuntut **keyframe manual frame demi frame** — pekerjaan yang paling membosankan dan paling sering gagal (hasil masih goyang/lepas). Contoh nyata: menaruh harga di produk yang dipegang tangan, membuat glow di tangan yang melambai, mem-blur wajah orang di belakang, atau menstabilkan video genggam yang bergetar. Semua itu **tidak dapat dilakukan dengan baik secara manual** oleh persona utama (Rara) — tetapi **dapat dilakukan otomatis oleh sebuah Tracking Engine**. Karena itu tracking diperlakukan sama intinya dengan AI editing: pengguna tidak lagi "mengunci" objek secara manual; ia hanya **menyebut subjeknya**.

**Bukti yang mendasari:**
- Reverse engineering Keyflow v1.3.2 menunjukkan investasi besar pada **kompleksitas manual**: 17 shader effect, keyframe copy/paste, curves/levels/color balance — semua dikendalikan tangan. Tidak ada artefak apa pun yang mengindikasikan fitur bahasa alami atau pemahaman isi video. **Celahnya jelas: kekuatan manual Keyflow tanpa bebannya.** Tracking yang ada di Keyflow bersifat terbatas pada wajah/tangan sebagai titik tempel — tidak ada lapisan tracking persisten, multi-objek, atau binding ke mask/efek.
- Pasar editor pro-on-mobile sudah tervalidasi (Keyflow keluar dari tahap eksperimen).

### 1.2 Value proposition

> **Keylox membuat [kreator desktop] bisa [menghasilkan video bergaya pro] hanya dengan [satu perintah bahasa alami], tanpa [skill editing, labor berjam-jam, biaya langganan, atau watermark] — dan membuat [teks, efek, mask, serta kamera menempel pada subjek yang bergerak] tanpa [satu pun keyframe manual].**

Kalimat posisi produk: **"Bilang apa yang kamu mau. Sisanya kami."**

### 1.3 Target user (segmen)

| # | Segmen | Deskripsi | Ukuran relatif | Pain utama | Fitur Keylox yang menjual |
|---|---|---|---|---|---|
| **S1** | **Kreator solo "daily poster"** (PRIMARY) | 18–30 th, bikin 1–3 konten/hari untuk Reels/TikTok/Shorts. Editor utama: laptop. Tidak paham color grading. | ±55% | Mechanical labor: potong diam, subtitle, warna, cari momen | **One-prompt full edit (G-21)**, auto-subtitle, batch import + AI indexing, auto-cut, caption otomatis, **stabilisasi & auto-reframe (TR-12, TR-13)** |
| **S2** | **Kreator menengah "prosumer" + UMKM** (PRIMARY) | Freelancer/UMKM/affiliate marketer. Butuh kontrol penuh & konsistensi brand. Sudah pakai CapCut/Premiere Rush. | ±25% | Konten cepat + konsistensi brand | Curves/levels/LUT, mask, blend, chroma key, template brand, prompt library & favorit, **tracking produk & label harga (TR-02, TR-09)** |
| **S3** | **Mobile-first editor enthusiast** (SECONDARY) | Suka eksperimen effect, aktif di komunitas. | ±12% | Editor mobile terlalu dangkal | 17 shader effect, blend/overlay, **tracking text/efek/partikel menempel subjek (TR-05, TR-09)**, multi-object tracking (TR-08), tracking editor (TR-14), audio spectrum, effect stack |
| **S4** | **Pemula absolut / casual** (SECONDARY) | Pertama kali edit; tidak paham istilah editing. | ±8% | Bingung UI; menyerah di step pertama | Auto-Mode (G-22), template, perintah suara, "auto edit semuanya", **"lacak orangnya dan jaga dia di tengah" (TR-03, TR-13)** |
| **S5** | **Bisnis kecil / reseller** (EXPANSION, v2+) | Bikin konten promosi produk massal dari arsip. | Kecil di MVP, besar jangka panjang | Volume produksi, konsistensi produk | Batch import folder, AI indexing & auto-pick bahan, batch export, template brand, **tracking produk berulang lintas klip** |

**Persona utama untuk seluruh acceptance criteria:** **"Rara"** — 24 th, admin toko online di Bandung. Laptop kelas menengah (i5/Ryzen5, 8 GB RAM), koneksi 4G tidak stabil. Posting 2 video/hari ke TikTok & IG Reels. Punya 4.000+ file di galeri yang tidak pernah dia rapikan. Tahu "potong" dan "filter", tidak tahu "curves" atau "chroma key". Waktu luang: 30–60 menit per video.

**Non-persona (bukan target v1):** editor film profesional dengan kebutuhan 4K 10-bit multi-cam; pengguna iOS; tim kolaborasi realtime.

---

## 2. Prinsip Produk: **AI-FIRST + TRACKING-FIRST**

### 2.1 Prinsip utama

> **PR-1 — "Cukup prompt."** Satu perintah bahasa alami harus dapat menghasilkan video selesai. Pengguna tidak diwajibkan menyentuh timeline, panel efek, atau slider mana pun. UI manual adalah **opsional dan pendamping**, bukan jalan masuk utama.

> **PR-2 — Semua bisa dipanggil AI.** Tidak ada fitur editing yang hanya bisa diakses lewat UI manual. Setiap fitur editing memiliki minimal satu perintah AI yang memicunya (§8 AI Action Coverage Matrix).

> **PR-3 — AI mengusulkan, manusia memutuskan.** AI menghasilkan **EditPlan** (rencana edit terstruktur), bukan langsung menulis ke timeline. Rencana ditampilkan, bisa diubah, baru diterapkan. Setiap operasi reversibel.

> **PR-4 — Kekuatan pro tetap ada.** Semua kemampuan editor kelas pro tetap tersedia untuk yang ingin turun tangan. AI tidak menggantikan kedalaman; AI menghilangkan hambatan masuk.

> **PR-5 — Gratis penuh.** Tidak ada watermark, iklan, langganan, atau fitur terkunci. Nilai tambah produk tidak boleh ditahan di balik pembayaran.

> **PR-6 — Gagal dengan anggun.** Bila AI tidak tersedia (offline/limit), produk tetap berfungsi sebagai editor lengkap; perintah yang tidak bisa diproses **diantre**, bukan hilang.

> **PR-7 — Tracking adalah kemampuan inti (v2.1).** Keylox **mengerti isi dan posisi objek di dalam video**, bukan hanya gambarnya. Tracking (wajah, tangan, badan, gestur, objek, dan gerak kamera) diperlakukan **setara prioritasnya dengan AI editing**: seluruh fitur tracking adalah **MVP + Must**, memiliki data tracking persisten yang dapat dipakai ulang, dan **setiap konsumen (teks, sticker, efek, mask, cutout, kamera) dapat menempel pada subjek yang bergerak**. Satu sumber kebenaran: **M14 Tracking Engine** (§6.2).

### 2.2 Perjalanan pengguna AI-First + Tracking-first (jalur utama)

```
User punya bahan (galeri/folder)
        │
        ▼
[1] IMPORT BATCH DARI FOLDER        → semua media masuk proyek (P-10)
        │
        ▼
[2] AI INDEKS BAHAN (background)    → durasi, resolusi, isi/scene, subjek, kualitas, teks (P-12)
        │
        ▼
[3] USER MENULIS/MENGUCAP PROMPT    → "bikin vlog 60 detik, musik ceria, subtitle ID" (G-01, G-24, G-22)
        │
        ▼
[4] AI MENGAMBIL BAHAN RELEVAN      → auto-pick dari indeks (P-13)
        │
        ▼
[5] AI MENYUSUN EditPlan            → daftar operasi: trim, urut, warna, efek, teks, audio, TRACKING (G-21, G-23)
        │
        ▼
[6] TRACKING ENGINE MENYIAPKAN DATA → lacak wajah/tangan/badan/objek → transform per frame   (M14 TR-01..TR-15)
        │                                ├─ stabilisasi (TR-12) · kamera virtual (TR-13)
        │                                └─ binding: teks/sticker/efek/mask/cutout menempel subjek (TR-09..TR-11)
        ▼
[7] PRATINJAU RENCANA               → user lihat langkah, toggle/ubah urutan, preview cepat             (G-23, G-32)
        │
        ▼
[8] APPLY                           → timeline terbentuk; 1 entri undo                                     (G-01)
        │
        ▼
[9] REFINEMENT ITERATIF             → "lebih cepat", "jangan terlalu gelap", "perbaiki tracking di detik 12" (G-25, G-19, TR-14)
        │
        ▼
[10] EXPORT (AI pilih setelan)      → R-18/R-10                                                            
```

**Jalur pendamping (opsional, kapan saja):** buka timeline → edit manual seperti editor biasa. Setiap hasil manual tetap bisa diminta diubah AI ("rapikan semua celah kosong"). **Tracking juga punya jalur pendamping:** pengguna dapat membuka *tracking editor* (TR-14) untuk mengoreksi data tracking secara manual per frame.

### 2.3 Tiga pilar AI + satu pilar tracking

1. **AI Cloud (Gemini `gemini-2.5-flash`)** — pemahaman bahasa & video: NL→EditPlan, scene detect/auto-cut, highlight/montage, ASR subtitle, OCR, Q&A video, metadata, thumbnail, translate, TTS, vision color-matching.
2. **AI On-device (MediaPipe)** — realtime & offline: segmentasi (background/cutout), face/hand/pose detection, gesture, beauty, object detection, klasifikasi, **embedding untuk indeks & pencarian aset**.
3. **AI Orchestrator (glue, di dalam app)** — menjaga urutan *analisis → rencana → apply deterministik*. Bertanggung jawab atas: validasi `EditPlan`, konflik operasi, undo grouping, antrean offline, caching, dan pencegahan biaya berulang.
4. **★ Tracking Engine (M14, inti)** — mengubah deteksi per-frame menjadi **data tracking persisten** (transform per frame), membinding-nya ke teks/sticker/efek/mask/cutout/kamera, menyediakan koreksi manual, dan caching. **Ini yang membuat efek & teks "menempel" pada subjek yang bergerak.**

### 2.4 Yang dimaksud "AI mengedit semuanya" + "tracking sebagai inti"

AI dapat memicu **seluruh** kategori berikut lewat perintah (bukan hanya beberapa):

| Kategori | Contoh yang bisa diminta AI | Bukti cakupan |
|---|---|---|
| Struktur & timeline | potong, urut, gabung, split, durasi total, rapikan celah | §8 M2 |
| Transform & kanvas | crop, rotate, flip, zoom, rasio, auto-reframe, stabilkan | §8 M3 |
| Warna & filter | cinematic, hangat, curves, levels, color balance, LUT, tiru referensi | §8 M4 |
| **Efek shader (17)** | glow, lens blur, chromatic aberration, light sweep, fractal noise, turbulent displace, halftone, find edges, twitch, audio spectrum, four color gradient, radial wipe, particular | §8 M5 |
| **Animasi & transisi** | animasi masuk/keluar, Ken Burns, parallax, shake, motion blur, transisi radial wipe/zoom/glitch | §8 M5 |
| **Compositing** | overlay/PIP, blend mode, mask, chroma key, luma key | §8 M6 |
| **★ Tracking (inti)** | lacak wajah/tangan/badan, ikuti objek, gestur, multi-objek, bind teks/sticker/efek, mask dinamis, cutout dinamis, stabilisasi, kamera virtual | **§7 (matriks penuh)** |
| Teks & caption | judul, subtitle otomatis, gaya karaoke, tracking text, OCR→caption, terjemah | §8 M8 |
| Audio | volume, fade, musik, ducking, denoise, voiceover, beat sync | §8 M9 |
| Export | resolusi, fps, format, preset platform, setelan optimal otomatis | §8 M10 |
| Pemahaman bahan | scene detect, highlight, cari momen, buang klip blur/tanpa orang | §8 M12 |
| Folder & batch | impor folder, indeks, auto-pick bahan, auto-group | §8 M1 |

---

## 3. Ruang Lingkup & Definisi Tahap

| Tahap | Horison | Definisi | Kriteria "selesai" |
|---|---|---|---|
| **MVP** | 0–5 bulan (α 7 mgg, β 7 mgg, γ 5 mgg) | **AI-First + Tracking-first core**: prompt → video jadi, **Tracking Engine penuh (15/15 MVP+Must)**, seluruh kapabilitas editing yang perlu dipanggil AI, semua 17 shader, export lengkap. Gratis penuh. | Satu prompt dapat menghasilkan video selesai tanpa sentuhan manual; 100% fitur editing MVP punya perintah AI; **100% fitur tracking punya AC drift/akurasi + perintah AI**; crash-free ≥ 99% |
| **v2** | 5–10 bulan | Pendalaman: animasi lanjutan & kinetic text, motion blur, beat-reactive, voice/TTS, batch export, cloud opsional, **tracking lanjutan (occlusion berat, deformable/3D track, plan tracking)** | Parity penuh Keyflow + AI & tracking tingkat lanjut; semua fitur punya perintah AI |
| **v3** | 10–18 bulan | Generatif & jangkauan: translate/dubbing, alpha export, export audio/GIF, batch multi-proyek, efek generatif dari referensi | Diferensiasi defensible; retensi D30 ≥ 40% |

**Aturan penjadwalan:**
1. Fitur masuk **MVP** jika (a) dibutuhkan agar satu prompt bisa menghasilkan video selesai, **atau** (b) merupakan bagian dari janji "semua fitur bisa dikontrol AI" sehingga harus ada di engine sejak awal, **atau** (c) merupakan **kemampuan tracking** (keputusan GATE 1 ulang: tracking = inti, tanpa pengecualian).
2. Fitur yang hanya memperdalam/memperindah (bukan pembeda) masuk **v2**.
3. Fitur yang bergantung pada model/mitra yang belum matang atau bersifat jangkauan baru masuk **v3**.
4. **Tidak ada** fitur yang naik tahap tanpa memindahkan fitur lain turun (aturan trade-off, §14.4).

> Penegasan: karena AI-first **dan** tracking-first, MVP memang berisi banyak fitur (154). Yang membuatnya layak adalah **AI yang mengoperasikannya** dan **satu Tracking Engine yang melayani semua konsumen**, sehingga beban UI/UX untuk pengguna justru turun. UI manual untuk sebagian fitur MVP boleh datang menyusul di v2 — yang wajib ada di MVP adalah **kapabilitas engine + perintah AI-nya**.

---

## 4. Arsitektur Modul (high level, untuk stage berikutnya)

```
Keylox
├── M12 AI Core                    ★★ INTI: prompt → EditPlan → apply, chat, recipes, coverage
├── M14 Tracking Engine            ★★ INTI: point/area/motion/face/hand/pose/gesture/multi-objek,
│                                       binding ke text/sticker/efek/mask/cutout, stabilisasi, kamera virtual
├── M1  Project, Media & Folder      (workspace, batch import folder, AI index, undo, player)
├── M2  Timeline Engine              (multi-track, trim/split, speed, keyframe)
├── M3  Transform & Geometry         (termasuk reframe & stabilisasi — konsumen M14)
├── M4  Color & Filter               (LUT, curves, levels, color balance)
├── M5  Effects (GLSL shader)        (17 shader Keyflow + animasi + transisi; dapat di-bind ke M14)
├── M6  Compositing                  (blend, overlay/PIP, mask, chroma key; mask dapat mengikuti M14)
├── M7  On-device AI                 (MediaPipe: seg/face/hand/pose/gesture/beauty/embedding) → suplai M14
├── M8  Text & Caption               (text, animasi, subtitle, tracking text → konsumen M14)
├── M9  Audio                        (mix, fade, musik, voiceover, spectrum)
├── M10 Export & Render              (MediaCodec + FFmpeg, preset, batch)
└── M11 Template

DIHAPUS pada v2.0: M13 Monetization & Account (tidak ada fitur berbayar)
M13 dibiarkan kosong; modul tracking memakai nomor M14 agar tidak mencampur jejak penghapusan.
```

**Alur data tracking (wajib, satu sumber kebenaran):**

```
MediaAsset → [M7 detektor: MediaPipe per-frame] → [M14 Tracking Engine: solver + optical flow]
                                                        │  menghasilkan transform per frame
                                                        ▼
                                            TrackingTarget + TrackingKeyframe (tersimpan)
                                                        │
                    ┌───────────────┬───────────────┬───┴───────────┬──────────────┐
                    ▼               ▼               ▼               ▼              ▼
                 M8 teks        M5 efek         M6 mask       M7 cutout      M3 kamera
              (S-10, S-13)    (E-01,E-13,     (K-03,K-04)   (D-01, D-02)   (X-06, X-08)
                               E-20,E-21)
```

**Fitur yang lebih cocok di web/backend (bukan app desktop):**

| Kebutuhan | Kenapa tidak di app | Bentuk |
|---|---|---|
| **Panggilan Gemini API** | API key tidak boleh ada di binary (bisa diekstrak); butuh rate limit & observabilitas biaya | Backend proxy (Cloud Run/Functions) |
| **Antrean job AI berat** (ASR video panjang, montage, indeks folder besar) | Durasi > siklus hidup app; harus selamat dari app ditutup | Worker antrian asinkron + notifikasi (OS notification) |
| **Indeks aset bersama & cache hasil analisis** | Menghindari pengulangan biaya & mempercepat lintas device | Backend + object storage + cache ber-hash |
| **Katalog musik berlisensi, LUT, font, sticker, template** | Ukuran & pembaruan konten tanpa rilis app | CDN + API katalog + admin CMS (web) |
| **Unduhan model MediaPipe** | Model tidak perlu ikut installer (ukuran); bisa diperbarui tanpa rilis app | CDN + manifest versi model |
| **Analytics produk & biaya AI** | Agregasi lintas pengguna, tanpa PII | Backend + Firebase |
| Dokumentasi, halaman privasi, komparasi fitur | SEO | Website |
| Worker generatif (v3: dubbing, TTS massal, template generator) | GPU | Worker backend |

> **Yang justru TIDAK boleh di backend:** tracking. **Seluruh tracking (M14) berjalan on-device** — demi privasi, latensi, kualitas offline, dan biaya. Backend hanya menyediakan **unduhan model**.

Nama modul di atas dipakai sebagai referensi di seluruh dokumen (mis. `M5/E-03`, `M12/G-21`, `M14/TR-09`).

---

## 5. Peta Cakupan terhadap Keyflow (Traceability)

Setiap artefak Keyflow dari hasil reverse engineering dipetakan ke ID fitur Keylox. **Tidak ada yang hilang.**

| Artefak Keyflow (bukti) | Fitur Keyflow | ID Keylox | Tahap |
|---|---|---|---|
| strings `Crop`,`Rotate` | Crop, rotate, flip | X-01..X-04 | MVP |
| strings `Mask`,`Blend`,`Overlay` | Mask, blend, overlay/PIP | K-01..K-05 | MVP/v2 |
| strings `Speed`,`Reverse` | Speed, reverse, freeze | T-14,T-16,T-17 | MVP |
| strings `sharpen`,`vignette` | Sharpen, vignette | C-03,C-04 | MVP |
| strings `Text`,`Caption`,`Tracking` | Text, caption, tracking text | S-01..S-10 | MVP/v2 |
| strings `Audio`,`Glow`,`Effect` | Audio, effect, glow | A-*, E-*, E-01 | MVP |
| `a63.smali` — 17 effect | chroma_key, particular, curves, levels, color_balance_hls, lens_blur, glow, turbulent_displace, chromatic_aberration, twitch, fractal_noise, light_sweep, audio_spectrum, four_color_gradient, halftone, find_edges, radial_wipe | E-01..E-13, K-05 | **MVP (semua)** |
| `a61.smali` — keyframe ops | Copy/Delete/Paste keyframes, "1 keyframe" | T-18..T-20 | MVP/v2 |
| `am1.smali` — GLSL shader | Effect berbasis shader, parameter uniform | E-15,E-18 | MVP/v2 |
| `magic_touch.tflite` | Background removal / smart select | D-01,D-03 | MVP |
| MediaPipe 10 tasks | Segmenter, InteractiveSegmenter, FaceLandmarker, HandLandmarker, PoseLandmarker, GestureRecognizer, ImageClassifier, ObjectDetector, ImageEmbedder, TextClassifier/Embedder | D-01..D-13 **+ M14 TR-01..TR-15** | **MVP (semua)** |
| `thumbnails/sample_*` (color/key) | Color grading sample / preset | C-09,C-13 | MVP |
| Timeline multi-track | Timeline multi-track | T-01..T-13 | MVP/v2 |
| Export (res/bitrate/fps/format) | Export setting | R-01..R-04,R-18 | MVP |
| ~~Watermark + AdMob~~ | ~~Monetisasi~~ | ~~U-01..U-05~~ | **DIHAPUS (keputusan produk v2.0)** |
| Template ("kemungkinan") | Template gallery & apply | M-01,M-02 | MVP |
| *Tidak ada di Keyflow (kemampuan baru)* | **Tracking layer persisten**: point/area/motion track, multi-object, binding ke teks/efek/mask, kamera virtual, tracking editor | **M14 `TR-01..TR-15`** | **MVP + Must (v2.1)** |

**Kesimpulan traceability:** 100% artefak Keyflow terwakili. Satu-satunya elemen Keyflow yang **tidak** direplikasi adalah **watermark + iklan AdMob** — dihapus secara sengaja berdasarkan keputusan produk di GATE 1 (Keylox gratis penuh, tanpa watermark & iklan). Sebaliknya, Keylox **menambahkan** kemampuan yang tidak ada di Keyflow: **AI editing (M12)** dan **Tracking Engine (M14)** — keduanya kini inti produk.

## 6. Daftar Fitur Lengkap

**Legenda kolom:**
- `ID` — referensi stabil (dipertahankan dari v1.0), dipakai stage 2–8.
- `Stage` — **MVP** / **v2** / **v3**.
- `MoSCoW` — Must / Should / Could / Won't (untuk tahap tempat fitur itu berada).
- `US` — user story ringkas (`S1..S5` = persona dari §1.3).
- `AC` — acceptance criteria terukur (minimal satu angka/observable).
- `AI` — perintah AI pemicu; lihat §6.1.1 (nomor perintah) dan §8 (matriks lengkap).

> **Urutan penyajian:** dua **kemampuan inti** ditampilkan lebih dulu — **AI Core (M12)** dan **Tracking Engine (M14)** — karena keduanya adalah inti produk yang sejajar prioritasnya (v2.1). Modul manual (M1–M11) menyusul sebagai lapisan pendamping. Nomor modul **tidak** berubah agar referensi lama tetap valid; **M13 tetap kosong** (jejak modul monetisasi yang dihapus pada v2.0), sehingga modul tracking diberi nomor **M14** dan tidak mencampur jejak penghapusan.

> **Catatan MVP:** MVP = **154 fitur** dan memang besar, karena janji produk adalah *dua hal*: **"AI bisa memicu semua hal"** *dan* **"tracking diperlakukan sebagai kemampuan inti"**. Yang dihindari bukan jumlah fitur, melainkan **beban UI**: sebagian besar fitur MVP cukup punya kapabilitas engine + perintah AI; panel manual penuhnya boleh menyusul di v2. Fase rilis: **α** (AI Core + **Tracking Engine** + engine dasar + import/indeks folder), **β** (parity editing + AI understanding + export), **γ** (performa, aksesibilitas, GA). Detail di §9.2.

---

### 6.1 M12 — AI Core ★ INTI PRODUK

> Modul ini adalah **pusat produk**, bukan pelengkap. Semua modul lain adalah "otot" yang digerakkan modul ini.
> **Catatan v2.1:** seluruh perintah bertema tracking (Grup N, #226–#249) juga **diparse di sini** — M12 mengenali intent & parameternya, lalu **menjalankannya lewat M14 Tracking Engine** (§6.2). M12 tidak "memiliki" logika tracking; ia hanya **mengarahkan niat pengguna** ke mesin yang tepat.

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| **G-01** | **Prompt → EditPlan → Apply** (mesin utama: bahasa alami jadi timeline) | MVP | Must | S1,S4 | Lihat AC-1..AC-11 di §6.1.2 | #1–#14, #208 |
| G-02 | **Scene detection & auto-cut** | MVP | Must | S1: memotong cepat | Deteksi batas adegan ≥ 85% presisi pada konten uji; ≤ 0,25× durasi video; bisa menyisipkan marker atau langsung memotong | #190, #188, #186 |
| G-03 | Highlight extraction / auto montage | MVP | Must | S1: rekap 60 detik | Menghasilkan montage 30–90 s dari sumber ≥ 5 menit; ≥ 90% momen terpilih dinilai relevan oleh 5 reviewer | #3, #188, #189 |
| G-04 | **Auto-subtitle ASR** | MVP | Must | S1 | Lihat S-07 | #131, #141 |
| G-05 | Speaker diarization (label "Orang 1/2/3") | v2 | Should | S2: wawancara & podcast | ≥ 2 speaker terpisah akurat ≥ 80%; label dapat diganti nama & dipakai di gaya caption | #193 |
| G-06 | **Vision/OCR teks dalam video** | MVP | Must | S1 | Lihat S-11 | #183, #139 |
| G-07 | Auto metadata: judul, deskripsi, hashtag | MVP | Must | S1: hemat waktu posting | ≥ 3 varian judul + 10 hashtag relevan per video; ≤ 5 s; bahasa sesuai perintah | #191 |
| G-08 | Video Q&A / pencarian momen | MVP | Must | S1,S2: navigasi cepat | Jawaban menyertakan timestamp + jump-to; akurasi ≥ 80% pada set uji; ≤ 6 s p95 | #181, #182, #184, #194 |
| G-09 | Smart B-roll / stock suggestion | v2 | Could | S1: filler visual | ≥ 5 klip stok per topik; dari katalog berlisensi; insert langsung ke timeline | #196 |
| G-10 | AI thumbnail / cover generator | MVP | Should | S1: CTR lebih tinggi | ≥ 3 varian cover dari frame terpilih + teks; ≤ 10 s; ukuran sesuai platform | #192 |
| G-11 | Prompt-to-template | MVP | Should | S4,S2 | Lihat M-05 | #12 |
| G-12 | Content safety & moderation check | v2 | Could | S2: aman diposting | Memberi peringatan kategori (kekerasan, NSFW, merek) tanpa menghapus konten; ≤ 0,2× durasi | #195 |
| G-13 | AI translate & dubbing | v3 | Could | S2: jangkauan global | ≥ 6 bahasa; timing mengikuti segmen ASR; lip-sync kasar opsional | #198 |
| G-14 | **AI auto color grade** | MVP | Must | S1: tidak paham grading | ≥ 5 "look" (cinematic, warm, clean, moody, vintage) + pratinjau sebelum terapkan; ≤ 6 s p95 | #78, #59, #60 |
| G-15 | **AI auto reframe** (berbasis **TR-13**) | MVP | Must | S1: versi vertikal dari landscape | Deteksi subjek ≥ 90% frame; gerakan halus tanpa jitter; ≤ 0,3× durasi klip; dapat dikoreksi di tracking editor (TR-14) | #54, #52, #227, #239 |
| G-16 | **AI silence & filler-word removal** | MVP | Must | S1: memotong kebosanan | Deteksi jeda ≥ 0,4 s & kata pengisi; margin custom; hemat ≥ 15% durasi pada konten talking-head | #39, #40 |
| G-17 | AI script/naskah & ide konten | v2 | Could | S5: naskah promosi | Menghasilkan naskah 30–120 s dengan struktur hook-body-CTA | #197 |
| G-18 | AI caption styling otomatis | MVP | Should | S1 | ≥ 6 gaya; dipilih berdasar genre video + rasio; dapat diubah manual setelahnya | #134, #135 |
| G-19 | **Chat assistant multi-turn sadar proyek** | MVP | Must | S1,S2 | Asisten tahu isi timeline ("klip ke-3 terlalu gelap, terangkan"); ≥ 8 turn konteks; dapat membatalkan perintah sebelumnya | #214, #215, #216 |
| G-20 | AI effect/parameter suggestion dari mood | MVP | Must | S3,S4 | ≥ 20 deskripsi mood terpetakan ke parameter efek; pratinjau sebelum terapkan | #107, #108, #109 |
| **G-21** | **★ ONE-PROMPT FULL EDIT** — satu perintah → video selesai (trim + urut + warna + efek + teks + audio + export) | MVP | Must | S1,S4 | Dari folder/proyek berisi ≥ 10 media, satu perintah menghasilkan timeline jadi dengan ≥ 6 klip, warna, ≥ 1 efek/transisi, subtitle (jika ada ucapan), dan musik; ≤ 90 s untuk sumber 5 menit; dapat langsung diputar | #1–#11 |
| **G-22** | **★ Auto-Mode / Resep siap pakai** (vlog, promo produk, tutorial, quote, rekap acara, slideshow, cerita/Story) | MVP | Must | S1,S4,S5 | ≥ 8 resep bawaan; tiap resep menghasilkan struktur berbeda; resep dapat disimpan & dipakai ulang; hasil tetap dapat diedit manual penuh | #2, #3, #4, #5, #6, #7 |
| **G-23** | **EditPlan transparan & dapat diedit** (lihat langkah, toggle, ubah urutan, ubah durasi, hapus langkah) | MVP | Must | S2,S3 | 100% operasi AI ditampilkan sebagai daftar langkah berbahasa manusia; 100% dapat di-toggle/diubah sebelum Apply; perubahan rencana tidak merusak state proyek | #9, #216 |
| G-24 | **Input suara** (ngomong perintah, termasuk saat tangan sibuk) | MVP | Should | S1 | Bahasa ID & EN; akurasi transkripsi perintah ≥ 90%; indikator merekam jelas; hasil transkripsi dapat diedit sebelum dikirim | #225 |
| **G-25** | **Refinement iteratif** ("lebih cepat", "jangan terlalu gelap", "ganti musiknya", "versi lain") | MVP | Must | S1,S2 | ≥ 20 jenis revisi relatif dikenali; menerapkan delta pada hasil sebelumnya (bukan mengulang dari nol); 100% reversibel | #210, #211, #212, #213 |
| G-26 | Penjelasan AI (mengapa klip ini dipilih/dipotong) | v2 | Should | S2 | Setiap keputusan non-trivial punya alasan ≤ 1 kalimat; tersedia on-demand | #214, #215 |
| G-27 | **Batch apply ke banyak klip via prompt** ("semua klip: tambah glow lembut") | MVP | Should | S3,S5 | Berlaku ke ≥ 100 klip dalam satu perintah; konsisten; 1 entri undo | #217, #110 |
| G-28 | Prompt library & favorit (simpan prompt jadi tombol) | MVP | Should | S1,S5 | Simpan ≥ 50 prompt dengan judul; 1 tap untuk menjalankan; dapat diedit/hapus | #218 |
| **G-29** | **Riwayat prompt + undo per perintah AI** | MVP | Must | Semua | Riwayat ≥ 50 perintah; setiap perintah 1 entri undo; "kembalikan seperti semula" mengembalikan keadaan sebelum perintah terakhir | #208, #209, #222 |
| G-30 | Multi-bahasa prompt (ID/EN/campur) | MVP | Must | Semua | ≥ 95% perintah campur ("make it cinematic tapi tetap hangat") dipahami benar; dapat dipaksa ke satu bahasa | #220 |
| G-31 | AI project memory / preferensi gaya | v2 | Could | S1,S5 | Mengingat ≥ 5 preferensi (rasio, gaya musik, gaya caption) dan menerapkannya default; dapat di-reset | #219 |
| G-32 | Pratinjau rencana & storyboard sebelum render | MVP | Should | S1,S4 | Storyboard visual (≥ 1 thumbnail per klip) dari rencana; waktu pratinjau ≤ 15 s untuk rencana 20 klip | #9, #215 |
| G-33 | Mode degradasi & antrean saat AI tak tersedia (offline/limit) | MVP | Must | Semua | Perintah yang butuh cloud otomatis diantre dengan status jelas; ≥ 15 perintah lokal tetap jalan offline; tidak ada perintah yang hilang tanpa jejak | #221 |

**Backend/web (WAJIB):** proxy Gemini (key tidak di binary), antrian job async untuk input panjang, cache hasil ber-hash, observabilitas biaya. **Semua panggilan Gemini lewat backend.**

#### 6.1.1 Pustaka Perintah AI — **251 perintah wajib**

Perintah dikelompokkan berdasarkan intent. Kolom `Kelas`: **D** = destruktif/berisiko (wajib konfirmasi ringkasan), **N** = non-destruktif. Semua perintah harus diuji di eval set Stage 4.

**Grup A — One-Prompt & Auto-Mode (1–14)** · memicu G-21, G-22, G-32, G-11, M-01..M-05

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 1 | "bikin video 45 detik bergaya cinematic dari folder ini" | Full edit: pilih bahan, susun, grade, efek, export-siap | D | MVP |
| 2 | "buat vlog 60 detik dari semua foto dan video di folder liburan" | Resep vlog + auto-pick bahan | D | MVP |
| 3 | "bikin promo produk 30 detik, fokus ke sepatu" | Resep promo + filter bahan bersubjek sepatu | D | MVP |
| 4 | "buat video tutorial dari rekaman ini" | Resep tutorial + struktur langkah | D | MVP |
| 5 | "rekap acara pernikahan jadi 90 detik" | Resep rekap + highlight | D | MVP |
| 6 | "bikin slideshow lagu 30 detik" | Resep slideshow + musik | D | MVP |
| 7 | "buat video quote motivasi dari 1 foto" | Resep quote + teks + musik | N | MVP |
| 8 | "auto edit semuanya, aku percaya kamu" | Full auto tanpa preferensi tambahan | D | MVP |
| 9 | "tampilkan rencana edit dulu sebelum diterapkan" | Mode pratinjau rencana (G-23/G-32) | N | MVP |
| 10 | "bikin 3 versi berbeda dari bahan yang sama" | 3 varian EditPlan | N | MVP |
| 11 | "bikin versi 15 detik untuk TikTok dari video ini" | Re-cut + reframe + caption | D | MVP |
| 12 | "bikin template dari video ini supaya bisa dipakai lagi" | Simpan struktur sebagai template | N | MVP |
| 13 | "pakai template yang sedang tren untuk foto-foto ini" | Apply template katalog + auto-fill slot | N | MVP |
| 14 | "pakai template ini dan isi dengan media di folder liburan" | Apply template + auto-mapping aset | N | MVP |

**Grup B — Timeline & struktur (15–32)** · memicu M2

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 15 | "potong 5 detik pertama" | Trim in-point | D | MVP |
| 16 | "buang bagian akhir" | Trim out-point | D | MVP |
| 17 | "split di detik 12" | Split pada waktu | D | MVP |
| 18 | "hapus klip terakhir" | Delete klip | D | MVP |
| 19 | "duplikat klip ini" | Duplicate klip | N | MVP |
| 20 | "gabungkan klip 2 dan 3" | Gabung jadi satu klip / jadikan berurutan | D | v2 |
| 21 | "urutkan klip sesuai waktu pengambilan" | Reorder by metadata tanggal | D | MVP |
| 22 | "acak urutan klip" | Shuffle urutan | D | v2 |
| 23 | "pindahkan klip ini ke paling awal" | Reorder satu klip | N | MVP |
| 24 | "rapikan semua celah kosong" | Ripple delete + gap close | D | v2 |
| 25 | "masukkan video di folder liburan ke timeline" | Import + insert | N | MVP |
| 26 | "tambahkan semua foto tadi ke timeline" | Bulk insert media | N | MVP |
| 27 | "pisahkan suara dan videonya" | Detach audio | N | MVP |
| 28 | "kelompokkan klip ini jadi satu grup" | Group klip | N | v2 |
| 29 | "kunci klip supaya tidak bergeser" | Lock klip | N | v2 |
| 30 | "tampilkan storyboard semua klip" | Mode storyboard | N | MVP |
| 31 | "mundurkan klip ini 1 detik" | Geser posisi di timeline | N | v2 |
| 32 | "durasi klip ini jadikan 3 detik" | Set durasi klip | D | MVP |

**Grup C — Trim, speed, durasi (33–44)** · memicu M2 + G-16

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 33 | "percepat 2x" | Speed 2× | N | MVP |
| 34 | "slow motion 0.5x bagian ini" | Speed 0,5× + preserve pitch | N | MVP |
| 35 | "reverse videonya" | Reverse | N | MVP |
| 36 | "freeze di detik 8 selama 2 detik" | Freeze frame | N | MVP |
| 37 | "buat durasi total 45 detik" | Auto retime/trim ke durasi target | D | MVP |
| 38 | "potong jadi 15 detik untuk TikTok" | Auto cut ke 15 s + rasio | D | MVP |
| 39 | "buang semua bagian sepi" | Silence removal (G-16) | D | MVP |
| 40 | "buang kalimat pengisi seperti 'emm' dan 'apa ya'" | Filler-word removal | D | v2 |
| 41 | "bagian awal 1.5x, bagian akhir diperlambat" | Speed bertingkat | N | v2 |
| 42 | "buat speed ramp dramatis di 3 detik terakhir" | Speed curve | N | v3 |
| 43 | "buat gerakan lambat sinematik di momen ini" | Slow-mo + keyframe + music align | N | v2 |
| 44 | "pakai kecepatan asli saja" | Reset speed | N | MVP |

**Grup D — Transform & kanvas (45–58)** · memicu M3, P-01, P-07

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 45 | "ubah jadi 9:16" | Rasio kanvas + auto-fit | N | MVP |
| 46 | "ubah jadi 1:1" | Rasio kanvas + auto-fit | N | MVP |
| 47 | "crop jadi kotak di tengah" | Crop preset | N | MVP |
| 48 | "crop bagian atas saja" | Crop bebas | N | MVP |
| 49 | "putar videonya 90 derajat" | Rotate | N | MVP |
| 50 | "balik video secara horizontal" | Flip H | N | MVP |
| 51 | "flip vertikal" | Flip V | N | MVP |
| 52 | "zoom ke wajah orang" | Zoom + face target | N | MVP |
| 53 | "kecilkan video 50% dan taruh di kanan atas" | Scale + position | N | MVP |
| 54 | "buat versi vertikal dengan subjek selalu di tengah" | Auto reframe (G-15) | N | MVP |
| 55 | "perbaiki video yang miring" | Perspective/keystone | N | v3 |
| 56 | "stabilkan video yang goyang" | Stabilisasi | N | v3 |
| 57 | "isi ruang kosong dengan blur background" | Canvas fill blur | N | MVP |
| 58 | "isi ruang kosong dengan warna hitam" | Canvas fill warna | N | MVP |

**Grup E — Warna & filter (59–79)** · memicu M4

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 59 | "buat warna lebih hangat" | White balance hangat + brightness halus | N | MVP |
| 60 | "buat cinematic" | Look cinematic (LUT + kontras + vignette) | N | MVP |
| 61 | "kurangi saturasi 20%" | Saturasi −20 | N | MVP |
| 62 | "terangkan bagian ini" | Brightness/exposure | N | MVP |
| 63 | "tambahkan kontras" | Contrast | N | MVP |
| 64 | "bikin warna orange and teal" | Color balance HLS | N | MVP |
| 65 | "hilangkan warna kuning dari lampu" | White balance/tint + selective | N | MVP |
| 66 | "terapkan filter vintage" | Preset filter | N | MVP |
| 67 | "terapkan LUT film" | LUT + intensity | N | MVP |
| 68 | "samakan warna semua klip" | Copy grade ke semua klip | N | MVP |
| 69 | "tiru warna video referensi ini" | Vision color matching | N | MVP |
| 70 | "buat warna sesuai warna produk ini" | Sample color grading | N | MVP |
| 71 | "tambahkan vignette halus" | Vignette | N | MVP |
| 72 | "tajamkan videonya" | Sharpen | N | MVP |
| 73 | "atur warna lewat curves" | Curves | N | MVP |
| 74 | "naikkan kecerahan midtone saja" | Levels/curve midtone | N | MVP |
| 75 | "atur color balance ke sinis di shadow" | Color balance HLS | N | MVP |
| 76 | "tambahkan film grain" | Grain | N | v2 |
| 77 | "buat look pudar (faded)" | Faded look | N | v2 |
| 78 | "auto color grading untuk semua klip" | AI color grade (G-14) | N | MVP |
| 79 | "ambil warna dari gambar ini lalu terapkan" | Color transfer dari referensi | N | MVP |

**Grup F — Efek, animasi, transisi (80–115)** · memicu M5 (semua 17 shader)

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 80 | "tambah efek glow di 0-3 detik" | E-01 glow + rentang waktu | N | MVP |
| 81 | "kasih efek glow lembut di seluruh video" | E-01 di semua klip | N | MVP |
| 82 | "tambahkan chromatic aberration" | E-03 | N | MVP |
| 83 | "lens blur di background" | E-02 | N | MVP |
| 84 | "light sweep dari kiri" | E-04 | N | MVP |
| 85 | "tambahkan fractal noise halus" | E-05 | N | MVP |
| 86 | "turbulent displace di teks" | E-06 | N | MVP |
| 87 | "buat efek halftone komik" | E-07 | N | MVP |
| 88 | "tambahkan find edges" | E-08 | N | MVP |
| 89 | "kasih efek glitch di 3 detik terakhir" | E-09 twitch | N | MVP |
| 90 | "tambahkan audio spectrum di bawah" | E-10 visualizer | N | MVP |
| 91 | "four color gradient sebagai background" | E-11 | N | MVP |
| 92 | "radial wipe sebagai transisi" | E-12 | N | MVP |
| 93 | "tambahkan efek partikel sparkle" | E-13 particular | N | MVP |
| 94 | "tambahkan efek snow" | E-13 preset | N | MVP |
| 95 | "tambahkan efek dust/debu" | E-13 preset | N | MVP |
| 96 | "bikin transisi radial wipe antar klip" | E-12/E-17 pada semua sambungan | N | MVP |
| 97 | "tambahkan transisi fade antar klip" | E-17 dissolve | N | MVP |
| 98 | "transisi zoom dramatis di semua sambungan" | E-17 zoom | N | MVP |
| 99 | "zoom in halus di awal" | Keyframe scale + easing | N | MVP |
| 100 | "animasi masuk pop untuk klip ini" | E-20 in-animation | N | MVP |
| 101 | "animasi keluar slide" | E-20 out-animation | N | MVP |
| 102 | "efek ken burns pada semua foto" | E-21 motion preset | N | MVP |
| 103 | "tambahkan gerakan parallax" | E-21 | N | MVP |
| 104 | "shake handheld halus" | E-21 | N | MVP |
| 105 | "tambahkan motion blur" | E-23 | N | v2 |
| 106 | "efek reaktif ke beat musik" | E-24 | N | v2 |
| 107 | "kasih efek film jadul" | E-19 prompt→effect stack | N | MVP |
| 108 | "efek dreamy/soft" | E-19 | N | MVP |
| 109 | "efek VHS retro" | E-19 | N | MVP |
| 110 | "tambahkan glow ke semua klip" | Batch apply efek | N | MVP |
| 111 | "hilangkan efek dari klip ini" | Clear effects | N | MVP |
| 112 | "atur kekuatan glow jadi 50%" | Ubah parameter efek | N | MVP |
| 113 | "tampilkan semua efek aktif" | Daftar efek + state | N | MVP |
| 114 | "simpan kombinasi efek ini sebagai preset" | E-16 simpan preset | N | MVP |
| 115 | "bikin transisi khusus antar klip" | Susun transisi custom | N | v2 |

**Grup G — Compositing: overlay, blend, mask, chroma (116–130)** · memicu M6, D-01, D-02

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 116 | "pasang overlay video ini di kanan atas" | K-02 overlay + posisi | N | MVP |
| 117 | "kecilkan overlay 50%" | K-02 scale | N | MVP |
| 118 | "kasih border putih 20px" | K-02 border | N | MVP |
| 119 | "tambahkan bayangan di overlay" | K-02 shadow | N | MVP |
| 120 | "ubah blending overlay jadi screen" | K-01 blend mode | N | MVP |
| 121 | "ubah blending jadi multiply" | K-01 | N | MVP |
| 122 | "tumpuk video ini di atas video itu" | K-02 layering | N | MVP |
| 123 | "mask bagian kiri video ini" | K-03 linear mask | N | MVP |
| 124 | "tambahkan mask radial di tengah" | K-03 radial | N | MVP |
| 125 | "haluskan tepi mask" | K-03 feather | N | MVP |
| 126 | "pertahankan hanya bagian tengah video" | K-03/K-04 mask path | N | MVP |
| 127 | "hapus green screen" | K-05 chroma key | N | MVP |
| 128 | "koreksi sisa warna hijau di tepi" | K-06 spill suppression | N | v2 |
| 129 | "hapus background videonya" | D-01 cutout | D | MVP |
| 130 | "ganti background jadi putih polos" | D-02 replace | N | MVP |

**Grup H — Teks & caption (131–150)** · memicu M8, D-04, D-08

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 131 | "tambahkan subtitle otomatis bahasa Indonesia" | G-04 ASR | N | MVP |
| 132 | "buat judul 'Liburan 2026' 3 detik di awal" | S-01 + S-04 | N | MVP |
| 133 | "kecilkan font subtitle" | S-02 | N | MVP |
| 134 | "gaya caption seperti karaoke" | S-08 preset | N | MVP |
| 135 | "caption warna kuning dengan stroke hitam" | S-02 style | N | MVP |
| 136 | "tambahkan teks di tengah selama 2 detik" | S-01 + timing | N | MVP |
| 137 | "buat teks muncul satu per satu" | S-03 word-by-word | N | MVP |
| 138 | "teks mengikuti orang itu" | S-10 tracking text | N | v2 |
| 139 | "ambil teks di video dan jadikan caption" | G-06 OCR → S-01 | N | MVP |
| 140 | "terjemahkan subtitle ke Inggris" | S-14 | N | v3 |
| 141 | "perbaiki ejaan subtitle" | ASR cleanup | N | MVP |
| 142 | "pecah subtitle per kata" | Word timings | N | MVP |
| 143 | "sticker lucu di atas kepala" | D-04 face attach | N | MVP |
| 144 | "haluskan kulit wajah" | D-08 beauty | N | MVP |
| 145 | "buat teks neon" | S-15 | N | v2 |
| 146 | "teks kinetic/bergerak" | E-22 | N | v2 |
| 147 | "subtitle di tengah layar" | S-08 posisi | N | MVP |
| 148 | "ekspor subtitle sebagai SRT" | S-09 | N | v2 |
| 149 | "impor subtitle dari file" | S-09 | N | v2 |
| 150 | "ganti font semua text jadi lebih modern" | Batch S-02 | N | MVP |

**Grup I — Audio (151–168)** · memicu M9

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 151 | "naikkan volume klip ini 30%" | A-01 | N | MVP |
| 152 | "mute audio klip ini" | A-03 | N | MVP |
| 153 | "fade out 2 detik" | A-02 | N | MVP |
| 154 | "tambahkan musik yang ceria" | A-07 + mood | N | MVP |
| 155 | "tambahkan musik yang sedih" | A-07 + mood | N | MVP |
| 156 | "ganti musiknya lebih kalem" | A-05 replace | N | MVP |
| 157 | "turunkan musik saat aku bicara" | A-13 ducking | N | v2 |
| 158 | "hilangkan noise angin" | A-11 denoise | D | v2 |
| 159 | "buat suaranya lebih jernih" | A-12 preset voice | N | v2 |
| 160 | "samakan volume semua klip" | Normalisasi | N | MVP |
| 161 | "sinkronkan potongan ke beat" | A-10 beat sync | D | v2 |
| 162 | "tambahkan voiceover dari naskah ini" | A-08 rekam | N | v2 |
| 163 | "buat narasi bahasa Indonesia" | A-15 TTS | N | v2 |
| 164 | "ubah suara jadi lebih berat" | A-14 pitch | N | v2 |
| 165 | "pisahkan audio lalu bersihkan" | A-06 + A-11 | N | MVP |
| 166 | "potong musiknya pas 30 detik" | Trim audio + fade | N | MVP |
| 167 | "cari musik dengan tempo cepat" | A-07 filter tempo | N | MVP |
| 168 | "hilangkan audio dari klip ini" | A-03/A-06 | D | MVP |

**Grup J — Export (169–180)** · memicu M10

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 169 | "ekspor 1080p 60fps" | Set resolusi + fps | N | MVP |
| 170 | "ekspor buat TikTok" | Preset TikTok | N | MVP |
| 171 | "ekspor buat Instagram Reels" | Preset Reels | N | MVP |
| 172 | "ekspor kualitas tertinggi" | Bitrate max | N | MVP |
| 173 | "kompres supaya ukurannya kecil" | Bitrate rendah + estimasi | N | MVP |
| 174 | "ekspor hanya bagian 10-25 detik" | Export range | N | v2 |
| 175 | "ekspor format MOV" | Ganti container | N | MVP |
| 176 | "ekspor GIF 5 detik" | GIF | N | v3 |
| 177 | "ekspor audio saja" | Audio-only | N | v3 |
| 178 | "pilih pengaturan terbaik otomatis" | R-18 AI preset | N | MVP |
| 179 | "simpan lalu kirim ke TikTok" | Export + share intent | N | MVP |
| 180 | "ekspor versi 4K" | Resolusi 4K (gratis) | N | MVP |

**Grup K — Pencarian & pemahaman AI (181–198)** · memicu G-02..G-09, G-12, G-13, S-14

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 181 | "cari momen saat ada kucing" | Semantic moment search | N | MVP |
| 182 | "cari saat aku menyebut harga" | Search dalam transkrip | N | MVP |
| 183 | "temukan semua bagian yang ada teks" | OCR scan | N | MVP |
| 184 | "temukan adegan di pantai" | Scene/label search | N | MVP |
| 185 | "cari klip yang paling bagus" | Quality scoring | N | MVP |
| 186 | "buang semua klip tanpa orang" | Object/person filter | D | MVP |
| 187 | "buang klip yang blur" | Quality filter | D | MVP |
| 188 | "buat montage 30 detik dari video ini" | Highlight montage (G-03) | N | MVP |
| 189 | "ambil highlight saja" | Highlight extraction | N | MVP |
| 190 | "deteksi adegan dan tandai batasnya" | Scene detect + marker | N | MVP |
| 191 | "buat deskripsi dan hashtag TikTok" | G-07 | N | MVP |
| 192 | "buatkan cover yang menarik" | G-10 | N | MVP |
| 193 | "siapa saja yang bicara di video ini" | G-05 diarization | N | v2 |
| 194 | "ringkas isi video ini" | Video summarization | N | MVP |
| 195 | "cek apakah video ini aman diposting" | G-12 moderation | N | v2 |
| 196 | "tambahkan b-roll tentang kopi" | G-09 stock | N | v2 |
| 197 | "buat naskah video 60 detik tentang kopi" | G-17 script | N | v2 |
| 198 | "terjemahkan video ini ke bahasa Inggris" | G-13 dubbing/translate | N | v3 |

**Grup L — Folder, batch import & indeks (199–207)** · memicu M1 P-10..P-14, D-11

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 199 | "impor semua dari folder DCIM/Camera" | Batch import | N | MVP |
| 200 | "scan folder ini dan indeks semuanya" | AI indexing aset | N | MVP |
| 201 | "kelompokkan semua video per acara" | Auto-group | N | MVP |
| 202 | "pilih bahan terbaik untuk video promo ini" | Auto-pick bahan | N | MVP |
| 203 | "cari klip yang ada sepatu di folder ini" | Semantic search dalam folder | N | MVP |
| 204 | "urutkan folder berdasarkan tanggal" | Auto-sort | N | MVP |
| 205 | "perbarui indeks folder ini" | Re-index | N | MVP |
| 206 | "hapus aset yang tidak terpakai" | Bersihkan aset | D | MVP |
| 207 | "impor otomatis dari folder yang dipantau" | Watched folder | N | v2 |

**Grup M — Kontrol sesi, rencana & refinement (208–225)** · memicu G-19, G-23, G-24, G-25, G-29, G-30, G-31, G-33, P-05, P-06

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 208 | "kembalikan seperti semula" | Undo perintah AI terakhir | N | MVP |
| 209 | "batalkan perintah terakhir" | Undo | N | MVP |
| 210 | "jangan terlalu gelap" | Refinement relatif | N | MVP |
| 211 | "lebih cepat" | Refinement tempo | N | MVP |
| 212 | "lebih pendek 10 detik" | Refinement durasi | N | MVP |
| 213 | "versi lain dari efek ini" | Variasi parameter | N | MVP |
| 214 | "kenapa klip ini dipilih" | Penjelasan keputusan | N | MVP |
| 215 | "jelaskan rencana editnya" | Ringkasan EditPlan | N | MVP |
| 216 | "ubah rencana, jangan pakai klip ke-3" | Edit EditPlan sebelum apply | N | MVP |
| 217 | "terapkan ke semua klip" | Batch apply | N | MVP |
| 218 | "simpan prompt ini jadi tombol" | Simpan ke prompt library | N | MVP |
| 219 | "pakai gaya seperti video sebelumnya" | Terapkan preferensi tersimpan | N | v2 |
| 220 | "pakai bahasa Inggris untuk perintah" | Paksa bahasa | N | MVP |
| 221 | "antre saja kalau sedang offline" | Antre perintah | N | MVP |
| 222 | "tampilkan riwayat perintah" | Riwayat prompt + undo | N | MVP |
| 223 | "buatkan 3 opsi gaya untuk video ini" | 3 varian look | N | MVP |
| 224 | "putar videonya dari awal" | Kontrol player | N | MVP |
| 225 | "mode input suara" | Aktifkan input suara (G-24) | N | MVP |

**Grup N — Tracking, stabilisasi & attach (226–249)** · memicu **M14 (TR-01..TR-15)**, X-06, X-08, S-10, D-05, D-12

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 226 | "lacak wajah dan tempelkan text di atasnya" | Face tracking + binding teks | N | MVP |
| 227 | "lacak orangnya dan jaga dia selalu di tengah" | Motion tracking + kamera virtual | N | MVP |
| 228 | "stabilkan video ini" | Stabilisasi berbasis tracking | N | MVP |
| 229 | "stabilkan hanya bagian yang goyang" | Stabilisasi rentang terpilih | N | MVP |
| 230 | "tempelkan sticker ke tangan yang bergerak" | Hand tracking + binding sticker | N | MVP |
| 231 | "tempelkan sticker di kepala yang mengikuti gerakan" | Face tracking + binding sticker | N | MVP |
| 232 | "lacak titik ini dan tempelkan efek" | Point tracking + binding efek | N | MVP |
| 233 | "lacak area ini dan blur terus-menerus" | Area tracking + binding mask/blur | N | MVP |
| 234 | "buat background blur tapi subjek tetap fokus" | Motion tracking + mask dinamis + lens blur | N | MVP |
| 235 | "hapus background dan tetap stabil saat subjek bergerak" | Cutout dinamis berbasis tracking | D | MVP |
| 236 | "biarkan mask ini mengikuti orangnya" | Binding mask ke target | N | MVP |
| 237 | "lacak produk ini dan beri label harga" | Area tracking + binding teks | N | MVP |
| 238 | "lacak beberapa orang sekaligus dan beri nama" | Multi-object tracking + label | N | MVP |
| 239 | "zoom ke wajah yang sedang bicara" | Face tracking + kamera virtual | N | MVP |
| 240 | "ikuti bola di lapangan" | Motion tracking objek cepat | N | MVP |
| 241 | "buat glow di tangan yang bergerak" | Hand tracking + efek E-01 | N | MVP |
| 242 | "tempelkan partikel ke subjek bergerak" | Motion tracking + efek E-13 | N | MVP |
| 243 | "perbaiki tracking di detik 12" | Tracking editor (koreksi manual) | N | MVP |
| 244 | "haluskan gerakan tracking-nya" | Tracking editor (smoothing) | N | MVP |
| 245 | "lacak ulang dari awal" | Re-analisis tracking (invalidate cache) | D | MVP |
| 246 | "mulai efek saat aku memberi gestur thumbs up" | Gesture recognition → trigger | N | MVP |
| 247 | "lacak subjek yang masuk frame dan ikuti dia" | Motion/multi-object tracking otomatis | N | MVP |
| 248 | "blur wajah orang yang mengikuti gerakan" | Face detection + blur dinamis (D-12) | N | MVP |
| 249 | "tempelkan efek di telapak tangan" | Hand landmark → attach (D-05) | N | MVP |

**Grup O — Operasional export & teknis (250–251)**

| # | Perintah | Aksi | Kelas | Stage |
|---|---|---|---|---|
| 250 | "ekspor di belakang layar" | Export background (R-07) | N | MVP |
| 251 | "batalkan ekspor yang sedang jalan" | Cancel export (R-08) | D | MVP |

**Total: 251 perintah** (kelas D: 31 · kelas N: 220).

**Distribusi per tahap:** MVP 210 · v2 34 · v3 7.

**Distribusi per grup:** A 14 · B 18 · C 12 · D 14 · E 21 · F 36 · G 15 · H 20 · I 18 · J 12 · K 18 · L 9 · M 18 · **N 24 (tracking)** · O 2.

#### 6.1.2 Acceptance criteria mesin AI (G-01)

- [ ] **AC-1 Akurasi intent**: ≥ 88% pada eval set 300 perintah (Indonesia sehari-hari + campur Inggris), diukur sebelum GA.
- [ ] **AC-2 Ambiguitas**: bila confidence < ambang, tampilkan 2–4 opsi aksi atau **1 pertanyaan klarifikasi** — tidak pernah menebak diam-diam.
- [ ] **AC-3 Konfirmasi destruktif**: 100% operasi kelas D menampilkan ringkasan perubahan + tombol Apply/Batal.
- [ ] **AC-4 Reversibilitas**: 100% hasil AI dapat di-undo dalam 1 langkah; tidak ada operasi AI yang mengunci timeline.
- [ ] **AC-5 Referensi konteks**: perintah "ini/itu/terakhir/bagian ini" resolve ke seleksi/playhead dengan benar ≥ 95%.
- [ ] **AC-6 Latensi**: parse ≤ 4 s p95 (teks ≤ 200 karakter); apply ≤ 500 ms setelah konfirmasi (kecuali job berat yang punya progres sendiri).
- [ ] **AC-7 Offline**: ≥ 15 perintah lokal (trim, split, speed, volume, mute, fade, transisi, putar, undo) bekerja tanpa internet; sisanya diantre dengan status jelas.
- [ ] **AC-8 Output terstruktur**: 100% respons berupa `EditPlan` tervalidasi skema; respons tidak valid → retry ≤ 2× lalu fallback ke opsi manual. **AI tidak pernah menulis langsung ke timeline.**
- [ ] **AC-9 Cakupan**: **100% fitur editing MVP** memiliki ≥ 1 perintah AI yang memicunya (dibuktikan oleh §8).
- [ ] **AC-10 Satu prompt cukup**: dari folder ≥ 10 media, satu perintah menghasilkan video siap-export tanpa interaksi tambahan (jalur G-21) pada ≥ 80% percobaan uji.
- [ ] **AC-11 Tanpa kebocoran biaya**: setiap respons di-cache ber-hash; input identik tidak memanggil ulang model; rata-rata token per perintah dalam batas anggaran di §12.
- [ ] **AC-12 Tracking inti (v2.1)**: 100% fitur `TR-01..TR-15` lulus AC drift/akurasi masing-masing pada **100 klip uji**; ≥ 5 objek terlacak bersamaan ≥ 24 fps @720p pada kelas menengah; **re-link setelah oklusi ≤ 500 ms**; **koreksi manual (`TR-14`) selalu dapat memperbaiki tracking yang gagal**; data tracking dapat dipakai ulang (cache) tanpa menghitung ulang.

### 6.2 M14 — Tracking Engine ★ INTI PRODUK (sejajar dengan AI Core)

> **Dinaikkan menjadi kemampuan inti pada v2.1** — hasil GATE 1 ulang: *"utamakan fitur tracking-nya juga"*.
> **Pembagian peran yang tegas (agar tidak tumpang tindih):**
> - `M7 D-*` = **model on-device (MediaPipe)** — deteksi per frame/jendela (landmark, bbox, label).
> - **`M14 TR-*` = lapisan Tracking Engine** — mengubah deteksi menjadi **data tracking persisten lintas waktu** (koordinat stabil, anti-drift, re-link saat subjek keluar-masuk frame), **membinding** data itu ke layer (teks/sticker/efek/mask/cutout/kamera virtual), memberi **kontrol & koreksi manual**, serta **caching**.
>
> **Semua fitur `TR-01`..`TR-15` adalah MVP + Must.** Tracking dipakai oleh M8 (text/sticker), M5 (efek yang menempel), M6 (mask & cutout dinamis), M3 (reframe & stabilisasi), dan dijangkau perintah AI dari M12. Detail matriks ada di **§7 Tracking Capability Matrix**.

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| **TR-01** | **Object tracking manual — titik** (single point tracking) | MVP | Must | S1,S3 | Pilih 1 titik → tracking ≥ 30 fps @720p; drift ≤ 2% lebar frame pada 30 s; titik dapat digeser/di-reset kapan saja | #232 |
| **TR-02** | **Object tracking manual — area/region** (kotak, bebas, poligon) | MVP | Must | S1,S3 | Pilih area → feature/template matching; skala & rotasi area mengikuti objek; drift ≤ 3%; area dapat di-edit per segmen | #233,#237 |
| **TR-03** | **Motion tracking otomatis** (auto-detect subjek utama tanpa memilih) | MVP | Must | S1,S4 | Subjek utama terdeteksi otomatis ≥ 85% pada 100 klip uji; 60 s video selesai ≤ 20 s; subjek dapat diganti dengan satu aksi | #227,#240,#247 |
| **TR-04** | **Face tracking persisten** (landmark lintas waktu + re-link) | MVP | Must | S1,S3 | ≥ 1 wajah; re-link setelah wajah keluar-masuk frame ≤ 500 ms; drift ≤ 2%; mendukung ≥ 5 wajah dengan label terpisah | #226,#231,#239 |
| **TR-05** | **Hand tracking persisten** | MVP | Must | S3 | 21 titik/tangan, 2 tangan bersamaan; kehilangan tracking ≤ 3 frame lalu pulih; latency ≤ 1 frame | #230,#241 |
| **TR-06** | **Pose / body tracking persisten** (skeleton) | MVP | Must | S1,S3 | 33 titik; stabil saat gerakan cepat; ≥ 2 orang dengan skeleton & label terpisah | #227,#247 |
| **TR-07** | **Gesture recognition → trigger aksi/efek** | MVP | Must | S3,S4 | ≥ 8 gestur (thumbs up, peace, point, wave, open palm, fist, dll.); trigger ≤ 300 ms; debounce sekali per gestur | #246 |
| **TR-08** | **Multi-object tracking** (≥ 5 objek sekaligus, label per objek) | MVP | Must | S2,S3 | ≥ 5 objek terlacak bersamaan ≥ 24 fps @720p; tiap objek punya label & warna; dapat di-enable/disable per objek | #238,#247 |
| **TR-09** | **Tracking binding** — tempelkan text/sticker/efek/overlay ke target | MVP | Must | S1,S3 | ≥ 6 jenis layer dapat di-bind (teks, sticker, efek, overlay, partikel, visualizer); offset & skala relatif; ikut saat target bergerak, mengecil, atau berputar | #226,#230,#231,#241,#242 |
| **TR-10** | **Tracking untuk masking dinamis** (mask mengikuti subjek) | MVP | Must | S2,S3 | Mask linear/radial/shape dapat di-link ke target; tepi mengikuti ≤ 2 frame; feather tetap; dapat digabung dengan K-03 | #233,#236 |
| **TR-11** | **Tracking untuk background removal / cutout dinamis** | MVP | Must | S1 | Cutout (D-01) stabil saat subjek bergerak; temporal coherence ≥ 3 frame; tidak ada flicker berkedip pada uji 30 s | #234,#235 |
| **TR-12** | **Stabilisasi berbasis tracking** (analisis gerak → kompensasi) | MVP | Must | S1,S3 | Getaran berkurang terukur ≥ 60% pada set uji; crop kompensasi ≤ 15%; tanpa jello effect; waktu export naik ≤ 30% | #228,#229 |
| **TR-13** | **Kamera virtual / auto-reframe berbasis tracking** | MVP | Must | S1,S3 | Subjek tetap dalam bingkai ≥ 90% frame; gerakan kamera halus tanpa jitter; ≥ 4 mode (follow, center, wide→tight, jalur manual) | #227,#239 |
| **TR-14** | **Tracking editor & kontrol data** (koreksi manual, offset, smoothing, keyframe track, trim track) | MVP | Must | S2,S3 | Data tracking tampil sebagai track di timeline; koreksi manual per frame; smoothing 3 tingkat; offset x/y/scale/rotation; track dapat di-trim | #243,#244 |
| **TR-15** | **Tracking cache & re-analisis** (reuse, invalidasi, lacak ulang) | MVP | Must | Semua | Data tracking tersimpan di proyek; membuka kembali tidak menghitung ulang; invalidasi otomatis saat klip dipotong/di-speed/di-reverse; lacak ulang = 1 aksi | #245 |

**Konsumen tracking (siapa memakai data tracking):**

| Konsumen | Modul | Yang dikonsumsi | Contoh |
|---|---|---|---|
| Text & sticker menempel | M8 (S-10, S-13) | transform per frame | "tempelkan sticker ke tangan yang bergerak" |
| Efek menempel | M5 (E-01, E-13, E-21) | transform + landmark | "buat glow di tangan yang bergerak" |
| Mask dinamis | M6 (K-03, K-04) | quad/path | "biarkan mask ini mengikuti orangnya" |
| Cutout dinamis | M7 (D-01, D-02) | matte + temporal | "hapus background dan tetap stabil saat subjek bergerak" |
| Reframe & stabilisasi | M3 (X-06, X-08) | gerak kamera terkompensasi | "stabilkan video ini", "jaga dia selalu di tengah" |
| Zoom otomatis | M3 (X-06) | landmark wajah/orang | "zoom ke wajah yang sedang bicara" |

**Backend/web:** tidak ada untuk tracking realtime (murni on-device). Untuk klip panjang, analisis tracking dijadwalkan sebagai **`TrackingSession` lokal** (§11.5) dengan progres & dapat dibatalkan — **bukan** job backend. Model MediaPipe diunduh dari CDN.

**Catatan teknis (bahan stage 2 & 5):**
- Satu **Tracking Engine tunggal** melayani semua konsumen (solver di atas MediaPipe + optical flow untuk mengisi celah antar deteksi) — bukan implementasi terpisah per fitur.
- Output tracking = **transform per frame** (translate/scale/rotate/quad) yang disimpan sebagai `TrackingKeyframe`; konsumen (teks/efek/mask/cutout) hanya membaca transform ini → satu sumber kebenaran.
- Strategi performa: `TR-01`/`TR-02` pada klip panjang diproses sebagai **batch offline** (hemat CPU); `TR-03`..`TR-07` untuk **preview realtime** pada resolusi turun.
- Semua tutup wajah/objek/pose mengikuti **guard etika**: tidak ada pengenalan identitas orang, tidak ada penyimpanan biometrik (lihat §13).

---

### 6.3 M1 — Project, Media & Folder (workspace, batch import, AI index, undo, player)

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| P-01 | Buat proyek baru + pilih aspect ratio (16:9, 9:16, 1:1, 4:5, 21:9, custom) | MVP | Must | S1,S4 | Proyek dibuat < 1,5 s; 6 preset + custom; rasio tersimpan di `Project`; canvas menyesuaikan < 1 frame; dapat dibuat implisit dari perintah AI | #45,#46 |
| P-02 | Import media dari file / kamera / drag-and-drop | MVP | Must | S1 | Video/audio/gambar terdeteksi otomatis; multi-select ≥ 20 file tanpa freeze UI; akses folder via dialog native (open/save); bisa dipicu lewat perintah | #25,#199 |
| P-03 | Manajemen proyek: list, rename, duplikat, hapus, thumbnail | MVP | Must | S2 | List 100 proyek < 1 s (lazy); thumbnail dari frame pertama; hapus punya konfirmasi + undo 5 s | *(non-editing)* |
| P-04 | Autosave + crash recovery | MVP | Must | S1 | Autosave ≤ 30 s idle atau ≤ 3 s setelah perubahan; pemulihan setelah force-kill ≥ 99%; ≥ 3 checkpoint otomatis | *(internal)* |
| P-05 | Undo / redo multi-level | MVP | Must | Semua | ≥ 50 langkah; < 150 ms; operasi AI = 1 entri; tersimpan saat app background | #208,#209 |
| P-06 | Preview player (play/pause/scrub/fullscreen/loop) | MVP | Must | Semua | Playback 1080p ≥ 30 fps di laptop target; scrub < 100 ms; 3 mode kualitas; multi-window | #224 |
| P-07 | Pengaturan canvas: background fill (warna, blur, gambar, mirror) | MVP | Should | S1 | 4 mode fill; blur dihasilkan tanpa worker > 200 ms; konsisten di export | #57,#58 |
| P-08 | Pengaturan proyek (fps proyek, warna canvas, unit default) | v2 | Should | S2 | 6 opsi fps; peringatan bila klip beda fps; tidak merusak timeline | *(non-editing)* |
| P-09 | Onboarding, izin runtime, panduan interaktif | MVP | Must | S4 | Onboarding ≤ 3 layar dengan skip; **onboarding mengajarkan mode prompt sebagai jalan utama**; izin diminta kontekstual | *(non-editing)* |
| **P-10** | **★ IMPORT BATCH DARI FOLDER** — pilih/scan satu folder → impor semua media (video/gambar/audio) | MVP | Must | S1,S5 | Jika sumber < 100 file: selesai < 20 s. Untuk 1.000 file: impor bertahap + progres, selesai < 4 menit. Metadata (durasi, resolusi, tanggal) akurat ≥ 99%. Duplikat terdeteksi & diabaikan. Gagal per-file tidak menggagalkan batch | #199 |
| **P-11** | **★ Auto-group & auto-sort aset** (per tanggal/acara, per tipe, per orientasi, per subjek) | MVP | Must | S1,S5 | ≥ 4 mode pengelompokan; grup otomatis terbentuk dalam ≤ 30 s untuk 500 aset; pengguna dapat mengganti nama grup; urutan dapat diubah | #201,#204 |
| **P-12** | **★ AI indexing aset** (durasi, resolusi, scene, subjek, label objek, kualitas, teks di layar, transkrip) | MVP | Must | S1,S5 | ≥ 8 jenis insight per aset; untuk 500 aset video selesai ≤ 15 menit di background (dengan CPU tidak overload > 10%); indeks tersimpan & tidak dihitung ulang setelah restart; insight dapat dilihat per aset | #200,#205 |
| **P-13** | **★ Auto-pick bahan relevan sesuai prompt** (retrieval dari indeks) | MVP | Must | S1,S5 | Untuk prompt bertema, ≥ 70% aset terpilih dinilai relevan oleh 5 reviewer (top-20); aset berkualitas buruk (blur/gelap) disingkirkan otomatis; pilihan dapat dilihat & diganti manual | #202,#203 |
| **P-14** | Manajemen indeks & re-index (perbarui, bersihkan, hapus aset, batas cache) | MVP | Should | S5 | Re-index inkremental (hanya aset baru/berubah); cache indeks ≤ 500 MB dengan auto-evict; penghapusan aset membersihkan insight terkait | #205,#206 |

**Fitur lebih cocok di backend/web:** penyimpanan indeks lintas-device & cache embedding, katalog contoh, analisis folder besar (upload daftar aset + insight).

### 6.4 M2 — Timeline & Editing Dasar

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| T-01 | Timeline multi-track (video, overlay, text, audio, audio-extra) | MVP | Must | S2 | ≥ 6 track; ≥ 200 klip tanpa lag > 2 fps drop; track bisa mute/solo/hide; state tersimpan | #15,#26,#30 |
| T-02 | Trim (handle in/out, angka manual) | MVP | Must | S1 | Presisi 1 frame; input timecode akurat; tidak ada frame hitam artefak | #15,#32 |
| T-03 | Split / cut di playhead | MVP | Must | S1 | Split < 50 ms; 2 klip identik total durasi (< 1 frame); atribut diwarisi | #17 |
| T-04 | Delete / ripple delete | MVP | Must | S1 | Gap tertutup otomatis pada ripple; undo tersedia; audio linked ikut terhapus | #18,#38 |
| T-05 | Duplicate clip | MVP | Must | S3 | Menyimpan seluruh properti + keyframe; ditempatkan di sebelah asal | #19 |
| T-06 | Reorder / drag & drop klip | MVP | Must | S1 | Auto-scroll saat drag; snapping ke tepi klip; 60 fps UI saat drag | #21,#23 |
| T-07 | Snapping/magnet, ripple trim, auto-gap close | v2 | Should | S2 | Threshold bisa diatur (off/low/high); mode ripple trim; gap < 100 ms ditutup satu aksi | #24 |
| T-08 | Zoom timeline + thumbnail/storyboard strip | MVP | Must | Semua | 4 tingkat zoom; thumbnail di-cache; strip 100 klip < 1,2 s di background; mode storyboard via perintah | #30 |
| T-09 | Add ke timeline dari panel media (tap/tap-hold/drag) | MVP | Must | S1 | 3 cara masukkan; insert di playhead default; diselipkan tanpa menimpa | #25,#26 |
| T-10 | Layer ordering (bring forward / send backward / to front / to back) | v2 | Should | S3 | 4 aksi pada track overlay; tercermin di preview < 1 frame | #122 |
| T-11 | Group klip & link/unlink audio-video | v2 | Should | S2 | Group bergerak sebagai satu unit; unlink memisahkan audio sample-exact | #28 |
| T-12 | Multi-select & bulk operation | v2 | Should | S2 | Select ≥ 50 klip; bulk delete < 200 ms; bulk paste atribut ke N klip | #217 |
| T-13 | Detach audio dari video | v2 | Should | S2 | Audio jadi klip mandiri; drift < 10 ms setelah 5 menit; re-attach tersedia | #27 |
| **T-14** | **Speed variable 0,25×–4× (preserve pitch)** | MVP | Must | S1,S3 | Slider + 7 preset; pitch preservation on/off; audio tidak pecah; durasi timeline akurat < 1 frame | #33,#34,#44 |
| T-15 | Speed ramp / curve | v3 | Could | S3 | ≥ 4 preset ramp; interpolasi mulus; audio ikut melengkung | #42 |
| T-16 | Reverse video (+ reverse audio opsional) | MVP | Must | S3 | Durasi tidak berubah; tidak ada frame korup; < 2× durasi klip untuk 1080p | #35 |
| T-17 | Freeze frame (durasi dapat diatur) | MVP | Must | S1 | Frame tunggal berkualitas penuh; default 2 s, rentang 0,1–30 s | #36 |
| **T-18** | **Sistem keyframe** (posisi, skala, rotasi, opacity, volume, warna, parameter effect) | MVP | Must | S2,S3 | ≥ 12 properti animatable; timeline keyframe dapat digeser; playback mengikuti kurva; AI dapat membuat keyframe dari deskripsi gerakan | #99,#52 |
| T-19 | Easing / interpolasi keyframe (linear, ease, bezier, hold, bounce) | MVP | Should | S3 | ≥ 6 jenis; perubahan < 1 frame; konsisten di export; AI memilih easing dari kata "halus/dramatis" | #99 |
| T-20 | Copy / paste / delete selected keyframes (parity `a61.smali`) | v2 | Should | S3 | Copy lintas klip; paste ke properti berbeda; label "1 keyframe" saat satu terpilih | #217 |
| T-21 | Storyboard / grid mode | v3 | Could | S2 | Mode grid + drag reorder; ≤ 300 klip tetap responsif | #30 |

**Backend/web:** tidak ada. M2 murni on-device (offline).

### 6.5 M3 — Transform & Geometry

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| X-01 | Crop (preset rasio + bebas + kunci rasio) | MVP | Must | S1 | 8 preset + bebas; snapping; non-destruktif; presisi 1 px pada 1080p | #47,#48 |
| X-02 | Rotate (90° ×4 + fine ±45°) | MVP | Must | S1 | Rotasi 90° instan; fine slider; auto-orientasi dari metadata | #49 |
| X-03 | Flip horizontal / vertikal | MVP | Must | S1 | Kedua arah toggle; ikut ke mask/overlay anak; persist setelah reload | #50,#51 |
| X-04 | Scale & position (pinch-drag, numerik, reset) | MVP | Must | S1 | ≥ 0,05×–10×; guide center/safe-area; koordinat kanvas (bukan piksel layar) | #53,#52 |
| X-05 | Aspect lock / fit-fill-stretch + auto-fit saat ganti rasio | MVP | Should | S2 | 3 mode; auto-fit tanpa distorsi saat rasio proyek berubah | #57 |
| **X-06** | **Auto reframe (AI)** — deteksi subjek → re-frame 9:16/1:1/16:9 (berbasis **TR-13**) | MVP | Must | S1 | Deteksi wajah/orang ≥ 90% frame; gerakan halus tanpa jitter; ≤ 0,3× durasi klip; dapat diedit manual di TR-14 | #54,#227,#239 |
| X-07 | Perspective / keystone correction | v3 | Could | S3 | 4-point warp; grid referensi; tanpa artefak tearing | #55 |
| **X-08** | **Video stabilization berbasis tracking** (analisis gerak → kompensasi, **TR-12**) | **MVP** | **Must** | S1,S3 | Getaran berkurang ≥ 60% pada set uji; crop kompensasi ≤ 15%; tanpa jello effect; waktu export naik ≤ 30%; kekuatan dapat diatur 3 tingkat | #228,#229 |

**Integrasi tracking ↔ transform (v2.1):** `X-06` (auto reframe) dan `X-08` (stabilisasi) **wajib** dikerjakan sebagai **konsumen Tracking Engine `TR-12`/`TR-13`**, bukan algoritma terpisah — sehingga data gerak yang sudah dihitung tracking dapat dipakai ulang (hemat CPU & konsisten). `X-04` (scale/position) juga harus dapat di-bind ke target tracking bila diinginkan.

### 6.6 M4 — Color & Filter (parity color grading Keyflow)

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| C-01 | Adjust dasar: brightness, contrast, saturation | MVP | Must | S1 | Slider −100..+100; realtime ≥ 55 fps preview 720p; nilai 0 = identitas (tidak mengubah piksel) | #61,#62,#63 |
| C-02 | Hue | MVP | Should | S3 | Rentang −180..+180; tidak ada banding pada 8-bit export | #61 |
| C-03 | Sharpen | MVP | Must | S2 | Radius + amount; preview realtime; tanpa overshoot halus | #72 |
| C-04 | Vignette (amount, radius, softness) | MVP | Should | S1 | 3 parameter; tidak menggelapkan track teks di atasnya | #71 |
| C-05 | Curves (RGB + per-kanal) | MVP | Should | S2 | ≥ 8 control point; pilih kanal; reset; dapat disimpan sebagai preset; AI bisa membuat kurva dari kata ("kontras film") | #73 |
| C-06 | Levels (input black/white/gamma, output) | MVP | Should | S2 | 5 parameter; histogram referensi tampil | #74 |
| C-07 | Color balance HLS (highlights/midtones/shadows) | MVP | Should | S2 | 3 rentang × hue/sat/lum; parity nama Keyflow `color_balance_hls` | #64,#75 |
| C-08 | White balance: temperature & tint | MVP | Should | S1 | 2000–10000K + tint; auto WB; AI memetakan "hangat/dingin" ke nilai | #59,#65 |
| C-09 | Filter preset / LUT (.cube import + built-in) | MVP | Must | S1 | ≥ 20 preset berkategori; import `.cube` ≤ 33³ & ≤ 5 MB; preview ≤ 300 ms; parity `sample_color` Keyflow | #66,#67 |
| C-10 | LUT intensity + blend dengan original | MVP | Should | S2 | Slider 0–100%; 100% = LUT murni; AI dapat menyetel intensitas | #67,#112 |
| C-11 | Copy / paste atribut warna antar klip | MVP | Should | S2 | Copy semua parameter; paste ke N klip sekaligus | #68 |
| C-12 | **AI auto color grade** | MVP | Must | S1 | ≥ 5 look (cinematic, warm, clean, moody, vintage) + pratinjau; ≤ 6 s p95 | #78,#59,#60 |
| C-13 | Sample color / color picker grading | MVP | Should | S3 | Ambil warna dari frame → parameter adjustment; parity `sample_*.jpg` Keyflow; AI dapat memakai warna produk sebagai acuan | #70,#79 |
| C-14 | Selective color (HSL qualifier) | v2 | Could | S3 | 3 kanal kualifikasi + mask; preview realtime dengan mask overlay | #65 |
| C-15 | Film grain / faded look / halation | v2 | Could | S3 | 3 look; grain bervariasi per frame (bukan statis) | #76,#77 |

### 6.7 M5 — Effects (GLSL Shader) — parity 17 effect Keyflow + animasi

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| E-01 | **Glow** | MVP | Must | S1,S3 | Threshold/intensity/radius; tidak menurunkan preview 720p < 30 fps; dapat dibatasi rentang waktu | #80,#81,#112 |
| E-02 | **Lens blur** (iris/aperture, bokeh) | MVP | Must | S3 | 5 bentuk aperture; parameter bisa di-keyframe; closed-loop di 1080p export | #83 |
| E-03 | **Chromatic aberration** | MVP | Must | S3 | Arah + amount; tanpa artefak tepi (clamp) | #82 |
| E-04 | **Light sweep** | MVP | Must | S3 | Sudut, warna, kecepatan, posisi; loop mulus | #84 |
| E-05 | **Fractal noise** | MVP | Must | S3 | 3 tipe noise; seed stabil saat re-render; dapat dianimasikan | #85 |
| E-06 | **Turbulent displace** | MVP | Must | S3 | Amount/scale/evolve; stabil di export; dapat diterapkan ke teks | #86 |
| E-07 | **Halftone** | MVP | Must | S3 | Ukuran dot, sudut, mode; tajam pada 1080p | #87 |
| E-08 | **Find edges** | MVP | Must | S3 | Ketebalan + sensitivitas; mode outline only / overlay | #88 |
| E-09 | **Twitch / glitch digital** | MVP | Must | S3 | Frekuensi, RGB split, block displacement; seed dapat dikunci | #89 |
| E-10 | **Audio spectrum** (visualizer) | MVP | Must | S1 | ≥ 5 gaya; sinkron audio ≤ 50 ms; dapat jadi track overlay | #90 |
| E-11 | **Four color gradient** | MVP | Must | S3 | 4 warna + sudut + blend; keyframe warna didukung | #91 |
| E-12 | **Radial wipe** | MVP | Must | S3 | Center, radius, softness, arah; dapat dipakai sebagai transisi | #92,#96 |
| E-13 | **Particular** (particle: sparkle, snow, dust, bokeh, confetti) | MVP | Must | S3 | ≥ 6 preset partikel; ≥ 500 partikel pada 30 fps preview; dapat di-keyframe | #93,#94,#95 |
| E-14 | Blur dasar (box/gaussian/motion) | MVP | Must | S1 | 3 tipe; motion blur dengan sudut; dapat dikombinasikan dengan mask | #83 |
| E-15 | Effect layering & parameter per-efek | MVP | Must | S3 | ≥ 5 efek bersamaan per klip; urutan dapat diatur; tiap parameter dapat di-keyframe; AI dapat menumpuk efek dari satu perintah | #110,#113 |
| E-16 | Effect presets / packs (simpan & pakai ulang) | MVP | Should | S2,S3 | Simpan kombinasi → 1 tap apply; ≥ 30 preset bawaan; AI dapat menyimpan hasilnya sebagai preset | #114 |
| E-17 | **Transisi** (≥ 20 jenis: dissolve, zoom, slide, spin, glitch, radial wipe, warp, whip pan, zoom blur, dll.) | MVP | Must | S1 | 20 transisi; durasi 0,1–3 s; preview realtime; tidak memotong audio; AI dapat menerapkan ke semua sambungan | #96,#97,#98 |
| E-18 | Custom shader import (GLSL) / advanced mode | v2 | Could | S3 | Validasi shader sebelum jalan; sandbox uniform; gagal → fallback tanpa crash | *(manual)* |
| E-19 | **AI prompt-to-effect**: deskripsi gaya → parameter shader otomatis | MVP | Must | S4 | ≥ 50 prompt terpetakan ("film jadul", "dreamy", "VHS", "neon", "noir"); pratinjau sebelum terapkan | #107,#108,#109 |
| **E-20** | **★ Preset animasi masuk & keluar klip** (fade, pop, slide, spin, zoom, wipe, bounce, mask reveal) | MVP | Must | S1,S3 | ≥ 24 preset (12 in + 12 out); durasi dapat diatur; berlaku ke video, gambar, teks, dan overlay; preview realtime | #100,#101 |
| **E-21** | **★ Preset motion** (Ken Burns, parallax, swing, shake, handheld, orbit, dolly) | MVP | Must | S1,S3 | ≥ 10 preset motion; otomatis menghasilkan keyframe yang terlihat & dapat diedit; khusus foto → Ken Burns default | #102,#103,#104 |
| E-22 | Kinetic typography / kinetic text | v2 | Should | S1,S3 | ≥ 8 preset kinetic (word pop, highlight sweep, counter, typewriter cascade); sinkron dengan word-timing caption | #146 |
| E-23 | Motion blur & camera shake sinematik | v2 | Should | S3 | 2 arah (arah gerak / acak); intensitas dapat di-keyframe | #105 |
| E-24 | Efek reaktif audio (parameter efek ditenagai amplitudo/beat) | v2 | Could | S1,S3 | ≥ 6 parameter yang dapat ditenagai audio (scale, glow, radius, warna); korelasi terlihat jelas pada uji visual | #106 |
| E-25 | Generasi look dari referensi gambar/video (AI effect stack) | v2 | Could | S3 | Ambil referensi → AI menyusun stack efek + grade; ≥ 70% hasil dinilai "mirip" oleh 5 reviewer | #69,#79 |

**Catatan teknis (bahan stage 2):** seluruh E-01..E-13 adalah *fragment shader* dalam satu render graph GLES 3.0. Semua shader wajib punya varian low-end (half-res + skip pass) agar laptop kelas bawah tetap ≥ 24 fps preview.

**Integrasi tracking ↔ efek (v2.1, wajib):** efek yang bersifat **spasial** harus dapat di-bind ke target tracking (**TR-09**) sehingga menempel pada subjek yang bergerak — bukan tetap di posisi layar. Efek yang **wajib** mendukung binding: `E-01` glow, `E-02` lens blur, `E-03` chromatic aberration, `E-08` find edges, `E-09` twitch/glitch, `E-13` particular, `E-20` animasi masuk/keluar, `E-21` preset motion, dan `E-16` preset yang memuatnya. Parameter yang dipengaruhi: **posisi, skala, rotasi, dan titik emitter** (untuk partikel). Perintah AI yang mencontohkannya: `#233` (area + blur), `#241` (glow di tangan), `#242` (partikel mengikuti subjek), `#234` (background blur, subjek tetap fokus).

### 6.8 M6 — Compositing (Blend, Overlay/PIP, Mask, Chroma Key)

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| K-01 | Blend mode antar track/klip | MVP | Should | S3 | ≥ 12 mode (normal, screen, multiply, overlay, add, subtract, soft/hard light, difference, lighten, darken, dst-in, dst-out); konsisten preview↔export; GPU-only | #120,#121 |
| K-02 | Overlay / Picture-in-Picture (resize, posisi, sudut, border, shadow, rounded corner) | MVP | Must | S1,S2 | Drag & pinch; ≥ 8 border; shadow blur/offset; semua properti bisa di-keyframe; ≥ 3 overlay tanpa turun < 30 fps preview 720p | #116,#117,#118,#119,#122 |
| K-03 | Mask (linear, radial, shape/bebas, brush) | MVP | Should | S3 | 4 tipe; multiple mask per klip; feather + invert; preview realtime | #123,#124,#125 |
| K-04 | Mask lanjutan (keyframe mask path, opacity, blend mask, luma matte) | v2 | Should | S3 | Path dapat dianimasikan; luma matte dari video; tersimpan & reload akurat | #126 |
| K-05 | **Chroma key** (green screen) — parity `chroma_key` | MVP | Must | S2 | Key warna terpilih; tolerance, edge, feather, spill suppression, alpha threshold; hasil bersih 720p ≤ 2 s/klip; dapat dikombinasikan dengan D-01 | #127 |
| K-06 | Chroma key lanjutan (multi-key, key warna kulit, garbage matte) | v2 | Should | S3 | ≥ 3 key sekaligus; garbage matte polygon; spill lanjut | #128 |
| K-07 | Luma key / alpha-extract dari video | v3 | Could | S3 | Ambang & softness; mode invert | *(manual)* |
| K-08 | Track matte / alpha matte antar klip | v3 | Could | S3 | Klip di atas jadi matte klip di bawah; update realtime | #122 |

**Backend/web:** tidak ada. Semua GPU on-device.

**Integrasi tracking ↔ compositing (v2.1):** `K-03` dan `K-04` (mask) harus dapat **di-link ke target tracking (TR-10)** sehingga mask mengikuti subjek — baik sebagai quad transform (linear/radial) maupun path yang di-animasikan. `K-02` (overlay) harus dapat mengikuti target (TR-09). Perintah: `#236` "biarkan mask ini mengikuti orangnya", `#234` "buat background blur tapi subjek tetap fokus".

### 6.9 M7 — AI On-Device (MediaPipe) — **lapisan detektor**

> **Penting (v2.1):** modul ini adalah **mesin deteksi per frame**. **Lapisan tracking persisten (lintas waktu, binding, koreksi, cache) ada di §6.2 M14 `TR-01..TR-15`.** Setiap fitur `D-*` di bawah adalah *input* bagi Tracking Engine.

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| **D-01** | **Background removal / cutout** (MediaPipe Selfie + MultiClass Selfie Segmentation) | MVP | Must | S1 | IoU ≥ 0,85 pada 100 klip uji; 1080p ≤ 1,5× durasi klip; temporal smoothing ≥ 3 frame; **tidak memakai `magic_touch.tflite`** | #129 |
| D-02 | Background replace (warna, gambar, video, blur, transparan) | MVP | Must | S1 | ≥ 6 mode; blur background realtime di preview; konsisten di export; dinamis saat subjek bergerak (via TR-11) | #130,#57 |
| **D-03** | Interactive / smart select segmentation (brush objek → isolate) | **MVP** | **Must** | S3 | Paint positif/negatif; hasil ≤ 1 s per koreksi; dapat disimpan sebagai mask K-03; dapat di-link ke target tracking (TR-10) | #236,#232 |
| D-04 | Face landmark detection (468 titik) — detektor untuk TR-04 | MVP | Must | S1,S3 | 468 titik; ≥ 3 target (kepala, mata, mulut); ≥ 24 fps; drift < 5% area wajah sepanjang 30 s | #143 |
| D-05 | Hand landmark detection (21 titik) — detektor untuk TR-05 | MVP | Must | S3 | 21 titik/tangan; 2 tangan bersamaan; latency ≤ 1 frame | #249 |
| **D-06** | Pose landmark detection (33 titik) — detektor untuk TR-06 | **MVP** | **Must** | S3 | 33 titik; ≥ 24 fps @720p; tetap stabil saat orang keluar-masuk frame; ≥ 2 orang dengan skeleton terpisah | #227,#247 |
| **D-07** | Gesture recognition — detektor untuk TR-07 | **MVP** | **Must** | S3,S4 | ≥ 8 gesture; trigger ≤ 300 ms; debounce sekali per gestur | #246 |
| D-08 | **Beauty / face retouch** (smooth, blemish, brighten, slim, eye enlarge, teeth) | MVP | Must | S1 | Smooth ≤ 15 ms/frame; ≥ 6 sub-fitur; edge-aware (tidak merusak mata/rambut); default off | #144 |
| **D-09** | Object detection (label + bounding box) — detektor untuk TR-08 | **MVP** | **Must** | S3 | ≥ 80 kelas; ≥ 20 fps; kotak dapat dipakai sebagai mask/key/filter/target tracking | #186,#187 |
| D-10 | Image/media classification → auto-tag aset | v2 | Should | S2 | Auto-tag ≥ 60 kategori; akurasi ≥ 85%; tag dipakai di panel media & indeks | #200 |
| D-11 | **Image embedder → indeks & pencarian media semantik** | MVP | Must | S2,S5 | Index 1.000 aset ≤ 90 s di background; query "orang di pantai" mengembalikan ≥ 70% relevan di top-10; menjadi dasar P-12/P-13 | #200,#203 |
| **D-12** | Face detection → blur/auto-censor wajah (dinamis, mengikuti gerakan) | **MVP** | **Must** | S2 | Deteksi s.d. 10 wajah; blur **mengikuti wajah** selama bergerak; toggle per wajah; tanpa flicker | #248 |
| D-13 | Caching hasil deteksi/segmentasi per klip | MVP | Must | Semua | Deteksi tersimpan di proyek; reload tidak menghitung ulang; invalidasi benar setelah klip dipotong/di-speed/di-reverse | *(internal)* |

**Model yang dipakai eksplisit:** MediaPipe Selfie Segmentation, MultiClass Selfie Segmenter, Face Landmarker, Hand Landmarker, Pose Landmarker, Gesture Recognizer, Object Detector (EfficientDet-Lite), Image Classifier, Image Embedder, Interactive Segmenter. **Semua model open-source**, diunduh on-demand (tidak disertakan penuh di installer). **Mesin deteksi ini memberi input ke Tracking Engine `M14` (§6.2), yang mengubahnya menjadi data tracking persisten.**

**Backend/web:** indeks embedding lintas-device (opsional v2); model diunduh dari CDN.

### 6.10 M8 — Text & Caption

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| S-01 | Text overlay: tambah, edit, drag posisi, hapus, duplikat | MVP | Must | S1 | Tap-to-add; drag + snapping; ≤ 200 ms dari aksi ke teks tampil; multi-text per klip | #132,#136 |
| S-02 | Gaya teks: font, ukuran, warna, opacity, stroke, shadow, background, spacing, align, curve | MVP | Must | S1,S2 | ≥ 20 font bawaan; stroke & shadow dengan ketebalan/blur; background pill/box; AI memetakan deskripsi gaya ke setelan | #133,#135,#150 |
| S-03 | Animasi teks preset (fade, pop, slide, typewriter, karaoke, bounce, neon) | MVP | Must | S1 | ≥ 16 preset; durasi dapat diatur; preview realtime; dapat dipicu perintah | #137,#145 |
| S-04 | Timing teks di timeline | MVP | Must | S1 | Presisi 1 frame; otomatis mengikuti klip bila di-link; dapat di track terpisah | #136 |
| S-05 | Keyframe transform teks | v2 | Should | S3 | ≥ 6 properti; kurva mulus; sama seperti T-18 | #99 |
| S-06 | Editor caption/subtitle manual (per-baris, per-waktu) | MVP | Must | S1 | Tambah/edit/hapus; split & merge baris; tampil di timeline; ≤ 2 tap per baris untuk edit cepat | #141,#142,#149 |
| S-07 | **Auto-subtitle via Gemini (ASR)** | MVP | Must | S1 | Akurasi kata ≥ 92% pada audio jernih ID; ≤ 0,35× durasi audio; drift timestamp ≤ 300 ms; bahasa ID (MVP), ID+EN (v2) | #131 |
| S-08 | Styling caption & preset viral (word-by-word highlight, karaoke) | MVP | Should | S1 | ≥ 12 preset caption; highlight per kata via word-timing; gaya dapat disimpan sebagai preset brand | #134,#135,#147 |
| S-09 | Import/export subtitle SRT, VTT, ASS | v2 | Should | S2 | Import akurat ≤ 1 frame; export valid sesuai spec | #147,#148 |
| **S-10** | **Tracking text** (teks mengikuti objek/wajah/hand/pose) — konsumen **TR-09** | **MVP** | **Must** | S1,S3 | Pilih target (wajah/hand/objek/titik/pose) → teks mengikuti; offset & smoothing; drift ≤ 8% lebar frame; dapat dikoreksi manual di TR-14 | #226,#230,#231,#138 |
| S-11 | **OCR: deteksi teks di dalam video** | MVP | Must | S1 | Deteksi ≥ 90% teks jelas; hasil dapat dikonversi ke text overlay S-01 | #139,#183 |
| S-12 | Text-to-speech (TTS) / AI voiceover | v3 | Could | S5 | ≥ 6 suara (ID + EN); hasil jadi klip audio A-15 | #163 |
| S-13 | Library sticker/emoji/GIF | v2 | Could | S1 | ≥ 200 aset; pencarian; dirender sebagai overlay K-02 | #143 |
| S-14 | Auto-translate subtitle | v3 | Could | S2 | ≥ 8 bahasa; terjemahan dapat diedit; timing tidak hilang | #140 |
| S-15 | Efek teks lanjutan (neon glow, 3D extrude, particle text, mask text) | v2 | Could | S3 | ≥ 6 efek; dapat di-keyframe | #145 |

**Backend/web:** library sticker/emoji + katalog font (CDN + CMS); S-14 via Gemini proxy.

### 6.11 M9 — Audio

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| A-01 | Volume per klip (0–200%) | MVP | Must | S1 | Slider + input dB; 0 dB = asli; dapat di-set lewat perintah | #151 |
| A-02 | Fade in / fade out (durasi) | MVP | Must | S1 | 0,1–10 s; kurva linear/eksponensial; tanpa klik/pop | #153 |
| A-03 | Mute (per klip, per track) | MVP | Must | S1 | 2 level; ikon jelas; state tersimpan | #152,#168 |
| A-04 | Mix audio multi-track | MVP | Must | S1 | ≥ 3 track audio; tanpa clipping (soft limiter); master gain; normalisasi satu perintah | #160 |
| A-05 | Replace audio klip | MVP | Should | S1 | Pilih klip audio baru; auto-trim/fit; menjaga volume lama | #156 |
| A-06 | Remove / ekstrak audio | MVP | Should | S1 | Hapus audio saja; ekstrak ke track baru (A/V sync < 10 ms) | #165,#168 |
| A-07 | Music library (royalty-free, terkurasi, dengan mood & tempo) | MVP | Must | S1 | ≥ 150 track di katalog MVP; pencarian per mood/genre/tempo/durasi; preview; cache offline; dapat diminta lewat mood | #154,#155,#167 |
| A-08 | Voiceover recording | v2 | Should | S5 | Rekam saat preview jalan; countdown; waveform; sinkron otomatis; monitor headphone | #162 |
| A-09 | Audio spectrum / visualizer | MVP | Should | S1 | Lihat E-10 | #90 |
| A-10 | Beat detection & beat marker untuk auto-cut | v2 | Could | S1 | BPM ±2; marker di timeline; auto-cut ke beat tersedia | #161 |
| A-11 | Noise reduction / denoise | v2 | Could | S1 | Mengurangi noise ≥ 6 dB SNR tanpa artefak; on-device berbasis filter | #158 |
| A-12 | Audio EQ & kompresor/normalizer | v2 | Could | S2 | ≥ 3 preset (voice, music, bass boost); loudness ke −14 LUFS | #159 |
| A-13 | Auto-ducking | v2 | Could | S1 | Threshold & rasio; transisi ≤ 200 ms; tidak memotong awal kata | #157 |
| A-14 | Pitch / voice changer | v2 | Could | S3 | ≥ 5 preset; −12..+12 semitone tanpa mengubah durasi | #164 |
| A-15 | AI TTS / AI voiceover | v2 | Could | S5 | ≥ 4 bahasa, ≥ 8 suara; menghasilkan klip audio di timeline; ≤ 0,5× durasi teks | #163 |
| A-16 | **AI silence / dead-air removal** | MVP | Must | S1 | Deteksi jeda ≥ 0,4 s; margin custom ±; pratinjau sebelum apply; hemat ≥ 15% durasi pada talking-head | #39,#40 |

**Backend/web:** katalog musik (CDN + lisensi terpusat + CMS); penyediaan TTS via proxy AI.

### 6.12 M10 — Export & Render

> **Perubahan v2.0:** tidak ada watermark, tidak ada fitur terkunci, tidak ada batas langganan. Semua resolusi/fps/format tersedia gratis. ID `R-05` dan `R-06` (watermark) **dihapus** dan nomornya dibiarkan kosong.

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| R-01 | Resolusi export: 480p, 720p, 1080p, 1440p, 4K | MVP | Must | Semua | Semua resolusi gratis; mengikuti canvas; estimasi ukuran file tampil; 4K tersedia bila laptop mendukung (fallback dengan pesan jelas) | #169,#180 |
| R-02 | Bitrate: auto / manual | MVP | Must | S2 | Auto berdasar resolusi+fps; manual 1–50 Mbps; estimasi akurat ±10%; "kompres" via perintah | #173,#172 |
| R-03 | FPS: 24, 25, 30, 50, 60 | MVP | Must | S1 | Semua fps gratis; A/V sync drift < 40 ms pada output 60 s | #169 |
| R-04 | Format & codec: MP4 (H.264/H.265), MOV, MKV; audio AAC | MVP | Must | S2 | Semua codec gratis; H.265 opsional; kompatibel diputar di desktop & web; encode via FFmpeg | #175 |
| ~~R-05~~ | ~~Watermark versi Free~~ | — | — | — | **DIHAPUS (v2.0)** — tidak ada watermark sama sekali | — |
| ~~R-06~~ | ~~Hapus watermark via Pro~~ | — | — | — | **DIHAPUS (v2.0)** — tidak ada fitur berbayar | — |
| R-07 | Export di background (lanjut walau app diminimize) | MVP | Should | S1 | Foreground service + notifikasi progres; selamat dari app switch; resume setelah dibunuh OS ≤ 1× | #250 |
| R-08 | Progres export + estimasi waktu + cancel | MVP | Must | Semua | Progres akurat ±5%; estimasi waktu; cancel ≤ 2 s + bersihkan file parsial | #251 |
| R-09 | Simpan ke galeri (MediaStore) + share sheet | MVP | Must | Semua | Tersimpan di folder `Keylox`; share ke TikTok/IG tanpa transcode ulang; dapat dipicu perintah | #179 |
| R-10 | Export preset sosial (TikTok, IG Reels, YT Shorts, IG Feed, YT Long, Story) | MVP | Should | S1 | ≥ 6 preset (rasio+res+fps+bitrate terkunci); 1 tap; dapat dipilih lewat perintah | #170,#171 |
| R-11 | Export GIF / WebP animasi | v3 | Could | S1 | Durasi ≤ 10 s; ≥ 480p; kontrol fps | #176 |
| R-12 | Export audio saja (m4a/wav/mp3) | v3 | Could | S2 | Mix audio akhir dapat diekspor mandiri | #177 |
| R-13 | Hardware encoder (NVENC/QuickSync/VAAPI) default + fallback software (FFmpeg) | MVP | Should | Semua | HW untuk H.264/H.265 jika tersedia; fallback otomatis tanpa crash; ≥ 1,2× realtime 1080p30 di laptop target | *(internal)* |
| R-14 | Export range / marker | v2 | Could | S2 | Set in/out → hanya rentang diekspor; akurat 1 frame | #174 |
| R-15 | Export / import file proyek (`.keylox`) | v2 | Should | S2 | File berisi referensi media + edits + indeks; import memulihkan penuh; media hilang → dialog relink | *(manual)* |
| R-16 | Batch export (beberapa proyek) | v3 | Could | S5 | ≥ 5 job antre; berjalan berurutan; notifikasi saat selesai | *(manual)* |
| R-17 | Export alpha channel (HEVC alpha / ProRes 4444) | v3 | Could | S2 | Alpha benar saat diuji di editor eksternal | *(manual)* |
| **R-18** | **★ AI memilih setelan export optimal** (dari prompt & tujuan platform) | MVP | Must | S1 | Memilih res/fps/bitrate/format + rasio dari perintah ("buat untuk TikTok"); < 2 s; alasan pilihan ditampilkan singkat; selalu dapat ditimpa manual | #178 |

**Backend/web:** analytics export & share; batch render farm (v3, opsional).

### 6.13 M11 — Template

| ID | Fitur | Stage | MoSCoW | US | AC (terukur) | AI |
|---|---|---|---|---|---|---|
| M-01 | Template gallery (terkurasi, per kategori & trending) | MVP | Should | S4 | ≥ 40 template; kategori (vlog, promo, quote, slideshow, caption style, story); thumbnail bergerak; load ≤ 1 s (cache); dapat diminta lewat perintah | #13 |
| M-02 | Apply template: ganti slot media, auto-fit, preview | MVP | Should | S1,S4 | ≥ 1 slot media; auto-mapping aset dari galeri/folder berdasarkan rasio & isi; apply ≤ 3 s untuk 20 klip; hasil tetap dapat diedit manual penuh | #14 |
| M-03 | Simpan proyek sebagai template sendiri | v2 | Should | S2 | Menyimpan struktur + effect + text style + slot media; dapat di-share sebagai file | #12 |
| M-04 | Template trending / konten baru dari server | v2 | Could | S1 | Sync katalog tanpa update app; deep-link dari sosial | #13 |
| M-05 | **AI template generation from prompt** | MVP | Should | S4 | Menghasilkan struktur timeline + teks + musik dari satu deskripsi ≤ 25 s; ≥ 70% hasil dinilai "layak posting" oleh 10 pengguna uji | #12 |
| M-06 | Template caption/text style (brand kit ringan) | v2 | Could | S2 | Simpan font+warna+animasi+posisi; apply ke semua caption 1 aksi | *(manual)* |

**Backend/web:** katalog template, CMS admin, distribusi (M-04).

## 7. Tracking Capability Matrix

> **Section baru pada v2.1.** Ini adalah bukti dari keputusan GATE 1 ulang: **tracking adalah kemampuan INTI, sejajar prioritasnya dengan AI editing.** Semua baris di bawah berstatus **MVP + Must**.

### 7.1 Aturan & definisi

| Istilah | Definisi |
|---|---|
| **Tracking Engine** | Satu mesin tunggal (`M14`) yang mengubah deteksi per-frame (MediaPipe, `M7 D-*`) menjadi **data tracking persisten** (transform per frame), lalu membinding data itu ke konsumen (teks, efek, mask, cutout, kamera). |
| **Input** | Apa yang dipilih/dilacak: titik, area, wajah, tangan, pose, gestur, objek, atau otomatis (subjek utama). |
| **Output** | Bentuk data yang dihasilkan: `point`, `transform` (translate/scale/rotate), `quad`, `landmark`, `skeleton`, `label`, `matte`, `event` (gestur), atau `camera` (kamra virtual). |
| **Konsumen** | Fitur yang memakai data tracking: teks/sticker, efek, mask, cutout/background, stabilisasi, reframe. |
| **Perintah AI** | Nomor perintah kanonik (§6.1.1) yang memicu tracking ini. **Semua fitur tracking wajib punya minimal satu perintah AI.** |
| **Status** | ✔ = MVP + Must, punya perintah AI, punya AC terukur. |

**Target:** **15/15 fitur tracking (100%) adalah MVP + Must**, dan **15/15 punya perintah AI** (perintah #226–#249).

### 7.2 Matriks

| ID | Tipe tracking | Input | Output | Dipakai untuk | Perintah AI | Status |
|---|---|---|---|---|---|---|
| **TR-01** | Object tracking manual — **titik** | 1 titik dipilih user | `point` + `transform` per frame | tempel efek/sticker 1 titik, pin label | #232 | ✔ MVP/Must |
| **TR-02** | Object tracking manual — **area** | kotak / bebas / poligon | `quad` + `transform` | tempel label harga, blur area, mask area | #233, #237 | ✔ MVP/Must |
| **TR-03** | **Motion tracking otomatis** | video (tanpa pilih) | `transform` + subjek utama | kamera virtual, magnetik blur, montage pintar | #227, #240, #247 | ✔ MVP/Must |
| **TR-04** | **Face tracking** | video + wajah | `landmark` (468) + `transform` | teks di atas wajah, sticker kepala, zoom wajah | #226, #231, #239 | ✔ MVP/Must |
| **TR-05** | **Hand tracking** | video + tangan | `landmark` (21/tangan) | sticker di tangan, glow di tangan, gesture UI | #230, #241 | ✔ MVP/Must |
| **TR-06** | **Pose / body tracking** | video + orang | `skeleton` (33 titik) | efek mengikuti badan, olahraga/dance analytics, sensor gerak | #227, #247 | ✔ MVP/Must |
| **TR-07** | **Gesture recognition** | video + gestur tangan | `event` (nama gestur) | trigger efek/transisi aksi otomatis | #246 | ✔ MVP/Must |
| **TR-08** | **Multi-object tracking** | video + ≥ 5 objek | `quad[]` + `label[]` | tracking banyak orang/objek, label nama, sensor masing-masing | #238, #247 | ✔ MVP/Must |
| **TR-09** | **Tracking binding** (attach layer) | target tracking + layer | binding map | text/sticker/efek/overlay/partikel menempel pada subjek | #226, #230, #231, #241, #242 | ✔ MVP/Must |
| **TR-10** | **Mask dinamis** | mask + target tracking | `quad/path` per frame | mask mengikuti subjek, selective blur, selective color | #233, #236 | ✔ MVP/Must |
| **TR-11** | **Cutout dinamis** | matte segmentasi + tracking | `matte` + `transform` | hapus/ganti background stabil saat subjek bergerak | #234, #235 | ✔ MVP/Must |
| **TR-12** | **Stabilisasi** | video (analisis gerak) | `camera` (kompensasi) | video goyang jadi stabil | #228, #229 | ✔ MVP/Must |
| **TR-13** | **Kamera virtual / auto-reframe** | subjek tracking | `camera` (crop+pan) | subjek selalu di tengah, reframe 9:16 dari 16:9 | #227, #239 | ✔ MVP/Must |
| **TR-14** | **Tracking editor** | data tracking | koreksi/keyframe/offset/smoothing | perbaiki drift, haluskan, trim track, koreksi manual | #243, #244 | ✔ MVP/Must |
| **TR-15** | **Tracking cache & re-analisis** | proyek | cache hit/miss | tidak menghitung ulang, lacak ulang saat klip berubah | #245 | ✔ MVP/Must |

### 7.3 Detektor sumber (M7) yang memberi input ke tracking

| Detektor | Model on-device | Menyuplai | Stage |
|---|---|---|---|
| Face landmark | MediaPipe Face Landmarker | TR-04 | MVP/Must |
| Hand landmark | MediaPipe Hand Landmarker | TR-05 | MVP/Must |
| Pose landmark | MediaPipe Pose Landmarker | TR-06 | MVP/Must |
| Gesture recognizer | MediaPipe Gesture Recognizer | TR-07 | MVP/Must |
| Object detector | MediaPipe Object Detector (EfficientDet-Lite) | TR-02, TR-08 | MVP/Must |
| Selfie / MultiClass Segmenter | MediaPipe Selfie & MultiClass Selfie Segmentation | TR-11 (`D-01`) | MVP/Must |
| Interactive segmenter | MediaPipe Interactive Segmenter | TR-10 (`D-03`) | MVP/Must |
| Face detector (bbox) | MediaPipe Face Detector | TR-04, `D-12` (blur) | MVP/Must |
| Optical-flow / feature matcher | (internal, non-MediaPipe) | TR-01, TR-02 gap-filling | MVP/Must |

### 7.4 Rekap cakupan tracking

| Kelompok | Fitur | MVP + Must | Punya perintah AI | Persentase |
|---|---|---|---|---|
| M14 Tracking Engine (`TR-01..TR-15`) | 15 | 15 | 15 | 100% |
| Fitur non-modul yang menyediakan tracking (`D-03..D-07, D-09, D-12, D-13`) | 8 | 8 | 8 | 100% |
| Fitur non-modul yang **mengonsumsi** tracking (`X-06, X-08, S-10`) | 3 | 3 | 3 | 100% |
| **TOTAL terkait tracking** | **26** | **26** | **26** | **100%** |

**Catatan jujur:** dari 26 fitur terkait tracking, **25 punya perintah AI kanonik bernomor**, dan 1 (`D-13`) bersifat internal (mekanisme cache, memang tidak perlu perintah). Lima fitur tracking yang sebelumnya bergantung pada perintah turunan (`†`) — `D-03`, `D-05`, `D-06`, `D-07`, `D-12` — kini punya perintah kanonik bernomor, sehingga **utang kamus prompt untuk fitur tracking lunas sepenuhnya.**

### 7.5 Etika, privasi & batas tracking (wajib)

| Aturan | Isi |
|---|---|
| Tanpa identifikasi orang | Tracking melacak **posisi & landmark**, **bukan identitas**. Tidak ada pengenalan wajah (face recognition) dan tidak ada pencocokan identitas. |
| Tanpa biometrik tersimpan | Landmark/titik wajah **tidak** disimpan sebagai template biometrik; hanya koordinat sementara untuk keperluan render. |
| On-device | Seluruh tracking berjalan **on-device**; frame tidak dikirim ke server untuk tujuan tracking. |
| Consent | Fitur yang mengirim frame ke Gemini (mis. vision color-matching) tetap tunduk pada consent per-sesi (§13). |
| Blur/pelindung | `D-12` (blur wajah) disediakan justru untuk melindungi privasi orang di dalam video — pengguna dapat menyensor wajah dengan satu perintah. |
| Batas perangkat | Jumlah objek terlacak bersamaan menyesuaikan tier laptop (target ≥ 5 di kelas menengah; lihat Q-13). Bila anggaran komputasi tidak cukup, sistem menurunkan resolusi preview lebih dulu — bukan mematikan tracking. |
| Selalu dapat diperbaiki | Tidak ada klaim "tracking sempurna". Karena itu `TR-14` (tracking editor) **wajib** ada: pengguna selalu dapat mengoreksi, meng-offset, menghaluskan, atau memotong track secara manual. |

---

## 8. AI Action Coverage Matrix

> **Section baru pada v2.0.** Ini adalah bukti dari Prinsip PR-2: *semua fitur bisa dikontrol AI.*

### 8.1 Aturan & definisi cakupan

| Istilah | Definisi |
|---|---|
| **Fitur editing** | Fitur yang mengubah atau menghasilkan isi video/audio/teks pada timeline. **Semua fitur editing wajib punya perintah AI.** |
| **Fitur non-editing / internal** | Fitur administratif atau mesin yang tidak mengubah isi (onboarding, daftar proyek, autosave, cache, pemilihan encoder). Dikecualikan dari kewajiban ini, tetapi **wajib terdaftar** (tidak boleh disembunyikan). |
| **Perintah kanonik** | Perintah bernomor di §6.1.1 (251 perintah). |
| **`†` Perintah turunan** | Variasi dari pola kanonik dengan parameter berbeda (mis. #93 "partikel sparkle" → `†` "partikel bara api"). Skema intent-nya identik, sehingga biaya implementasi = penambahan entri kamus prompt, bukan fitur baru. **Dihitung sebagai tercakup.** |
| **Status** | ✔ = punya perintah AI aktif · N/A = dikecualikan (non-editing/internal) · Belum = belum tercakup (harus 0 untuk MVP) |

**Target:** **100% fitur editing MVP** memiliki minimal satu perintah AI. Pada dokumen ini: **149/149 (100%)**.

### 8.2 Matriks

**M12 — AI Core** (modul ini secara definisi adalah AI; semua barisnya tercakup)

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| G-01 | Prompt → EditPlan → Apply | #1–#14, #208 | MVP | ✔ |
| G-02 | Scene detection & auto-cut | #190, #188, #186 | MVP | ✔ |
| G-03 | Highlight / montage | #3, #188, #189 | MVP | ✔ |
| G-04 | Auto-subtitle ASR | #131, #141 | MVP | ✔ |
| G-05 | Speaker diarization | #193 | v2 | ✔ |
| G-06 | OCR teks dalam video | #183, #139 | MVP | ✔ |
| G-07 | Auto metadata | #191 | MVP | ✔ |
| G-08 | Video Q&A / cari momen | #181, #182, #184, #194 | MVP | ✔ |
| G-09 | Smart B-roll | #196 | v2 | ✔ |
| G-10 | AI thumbnail/cover | #192 | MVP | ✔ |
| G-11 | Prompt-to-template | #12 | MVP | ✔ |
| G-12 | Moderation check | #195 | v2 | ✔ |
| G-13 | Translate & dubbing | #198 | v3 | ✔ |
| G-14 | AI auto color grade | #78, #59, #60 | MVP | ✔ |
| G-15 | AI auto reframe | #54, #52 | MVP | ✔ |
| G-16 | Silence & filler removal | #39, #40 | MVP | ✔ |
| G-17 | AI script/naskah | #197 | v2 | ✔ |
| G-18 | AI caption styling | #134, #135 | MVP | ✔ |
| G-19 | Chat assistant multi-turn | #214, #215, #216 | MVP | ✔ |
| G-20 | AI effect suggestion dari mood | #107, #108, #109 | MVP | ✔ |
| G-21 | One-prompt full edit | #1–#11 | MVP | ✔ |
| G-22 | Auto-Mode / resep | #2, #3, #4, #5, #6, #7 | MVP | ✔ |
| G-23 | EditPlan transparan & editable | #9, #216 | MVP | ✔ |
| G-24 | Input suara | #225 | MVP | ✔ |
| G-25 | Refinement iteratif | #210, #211, #212, #213 | MVP | ✔ |
| G-26 | Penjelasan AI | #214, #215 | v2 | ✔ |
| G-27 | Batch apply via prompt | #217, #110 | MVP | ✔ |
| G-28 | Prompt library & favorit | #218 | MVP | ✔ |
| G-29 | Riwayat prompt + undo per perintah | #208, #209, #222 | MVP | ✔ |
| G-30 | Multi-bahasa prompt (ID/EN) | #220 | MVP | ✔ |
| G-31 | AI project memory | #219 | v2 | ✔ |
| G-32 | Pratinjau rencana & storyboard | #9, #215 | MVP | ✔ |
| G-33 | Mode degradasi & antrean | #221 | MVP | ✔ |

**M14 — Tracking Engine** (modul inti v2.1; semua baris MVP + Must dan punya perintah AI)

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| TR-01 | Object tracking manual — titik | #232 | MVP | ✔ |
| TR-02 | Object tracking manual — area | #233, #237 | MVP | ✔ |
| TR-03 | Motion tracking otomatis | #227, #240, #247 | MVP | ✔ |
| TR-04 | Face tracking | #226, #231, #239 | MVP | ✔ |
| TR-05 | Hand tracking | #230, #241 | MVP | ✔ |
| TR-06 | Pose / body tracking | #227, #247 | MVP | ✔ |
| TR-07 | Gesture recognition → trigger | #246 | MVP | ✔ |
| TR-08 | Multi-object tracking | #238, #247 | MVP | ✔ |
| TR-09 | Tracking binding (text/sticker/efek/overlay) | #226, #230, #231, #241, #242 | MVP | ✔ |
| TR-10 | Mask dinamis | #233, #236 | MVP | ✔ |
| TR-11 | Cutout / background removal dinamis | #234, #235 | MVP | ✔ |
| TR-12 | Stabilisasi berbasis tracking | #228, #229 | MVP | ✔ |
| TR-13 | Kamera virtual / auto-reframe | #227, #239 | MVP | ✔ |
| TR-14 | Tracking editor (koreksi, smoothing, offset) | #243, #244 | MVP | ✔ |
| TR-15 | Tracking cache & re-analisis | #245 | MVP | ✔ |

**M1 — Project, Media & Folder**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| P-01 | Buat proyek + rasio | #45, #46 (buat proyek implisit) | MVP | ✔ |
| P-02 | Import media galeri/kamera/file | #25, #199 | MVP | ✔ |
| P-03 | Manajemen proyek (list/rename/hapus) | — | MVP | **N/A** (non-editing) |
| P-04 | Autosave + crash recovery | — | MVP | **N/A** (internal) |
| P-05 | Undo / redo | #208, #209 | MVP | ✔ |
| P-06 | Preview player | #224 | MVP | ✔ |
| P-07 | Canvas background fill | #57, #58 | MVP | ✔ |
| P-08 | Pengaturan proyek teknis | — | v2 | **N/A** (non-editing) |
| P-09 | Onboarding & izin | — | MVP | **N/A** (non-editing) |
| P-10 | Import batch dari folder | #199, #207† | MVP | ✔ |
| P-11 | Auto-group & auto-sort | #201, #204 | MVP | ✔ |
| P-12 | AI indexing aset | #200, #205 | MVP | ✔ |
| P-13 | Auto-pick bahan relevan | #202, #203 | MVP | ✔ |
| P-14 | Manajemen indeks & re-index | #205, #206 | MVP | ✔ |

**M2 — Timeline & Editing Dasar**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| T-01 | Timeline multi-track | #15, #26, #30 | MVP | ✔ |
| T-02 | Trim | #15, #32 | MVP | ✔ |
| T-03 | Split / cut | #17 | MVP | ✔ |
| T-04 | Delete / ripple delete | #18, #38 | MVP | ✔ |
| T-05 | Duplicate clip | #19 | MVP | ✔ |
| T-06 | Reorder / drag & drop | #21, #23 | MVP | ✔ |
| T-07 | Snapping / ripple trim / gap close | #24 | v2 | ✔ |
| T-08 | Zoom timeline + storyboard strip | #30, † "perbesar timeline" | MVP | ✔ |
| T-09 | Add ke timeline dari panel media | #25, #26 | MVP | ✔ |
| T-10 | Layer ordering | #122, † "taruh overlay ini di depan" | v2 | ✔ |
| T-11 | Group klip & link/unlink A/V | #28 | v2 | ✔ |
| T-12 | Multi-select & bulk operation | #217 | v2 | ✔ |
| T-13 | Detach audio | #27 | v2 | ✔ |
| T-14 | Speed variable 0,25–4× | #33, #34, #44 | MVP | ✔ |
| T-15 | Speed ramp / curve | #42, #41 | v3 | ✔ |
| T-16 | Reverse | #35 | MVP | ✔ |
| T-17 | Freeze frame | #36 | MVP | ✔ |
| T-18 | Sistem keyframe | #99, #52, #102 | MVP | ✔ |
| T-19 | Easing / interpolasi keyframe | #99, † "buat gerakannya halus/dramatis" | MVP | ✔ |
| T-20 | Copy/paste/delete keyframe | #217, † "salin keyframe ini ke klip lain" | v2 | ✔ |
| T-21 | Storyboard / grid mode | #30 | v3 | ✔ |

**M3 — Transform & Geometry**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| X-01 | Crop | #47, #48 | MVP | ✔ |
| X-02 | Rotate | #49 | MVP | ✔ |
| X-03 | Flip H/V | #50, #51 | MVP | ✔ |
| X-04 | Scale & position | #52, #53 | MVP | ✔ |
| X-05 | Aspect lock / fit-fill | #57 | MVP | ✔ |
| X-06 | Auto reframe (AI) | #54, #227, #239 | MVP | ✔ |
| X-07 | Perspective / keystone | #55 | v3 | ✔ |
| X-08 | Stabilization berbasis tracking | #228, #229 | MVP | ✔ |

**M4 — Color & Filter**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| C-01 | Brightness/Contrast/Saturation | #61, #62, #63 | MVP | ✔ |
| C-02 | Hue | #61, † "geser hue ke biru" | MVP | ✔ |
| C-03 | Sharpen | #72 | MVP | ✔ |
| C-04 | Vignette | #71 | MVP | ✔ |
| C-05 | Curves | #73, #74 | MVP | ✔ |
| C-06 | Levels | #74 | MVP | ✔ |
| C-07 | Color balance HLS | #64, #75 | MVP | ✔ |
| C-08 | White balance (temp/tint) | #59, #65 | MVP | ✔ |
| C-09 | Filter preset / LUT | #66, #67 | MVP | ✔ |
| C-10 | LUT intensity | #67, #112 | MVP | ✔ |
| C-11 | Copy/paste atribut warna | #68 | MVP | ✔ |
| C-12 | AI auto color grade | #78, #59, #60 | MVP | ✔ |
| C-13 | Sample color / picker grading | #70, #79 | MVP | ✔ |
| C-14 | Selective color | #65 | v2 | ✔ |
| C-15 | Film grain / faded / halation | #76, #77 | v2 | ✔ |

**M5 — Effects (Shader), Animasi & Transisi**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| E-01 | Glow | #80, #81, #112 | MVP | ✔ |
| E-02 | Lens blur | #83 | MVP | ✔ |
| E-03 | Chromatic aberration | #82 | MVP | ✔ |
| E-04 | Light sweep | #84 | MVP | ✔ |
| E-05 | Fractal noise | #85 | MVP | ✔ |
| E-06 | Turbulent displace | #86 | MVP | ✔ |
| E-07 | Halftone | #87 | MVP | ✔ |
| E-08 | Find edges | #88 | MVP | ✔ |
| E-09 | Twitch / glitch | #89 | MVP | ✔ |
| E-10 | Audio spectrum | #90 | MVP | ✔ |
| E-11 | Four color gradient | #91 | MVP | ✔ |
| E-12 | Radial wipe | #92, #96 | MVP | ✔ |
| E-13 | Particular (partikel) | #93, #94, #95, † "partikel bara api" | MVP | ✔ |
| E-14 | Blur dasar | #83, † "blur bagian ini" | MVP | ✔ |
| E-15 | Effect layering & parameter | #110, #113, † "tumpuk glow lalu glitch" | MVP | ✔ |
| E-16 | Effect presets / packs | #114 | MVP | ✔ |
| E-17 | Transisi (≥ 20) | #96, #97, #98, #115 | MVP | ✔ |
| E-18 | Custom shader import (GLSL) | — | v2 | **N/A** (manual teknis; tidak ada padanan bahasa alami yang aman) |
| E-19 | AI prompt-to-effect | #107, #108, #109 | MVP | ✔ |
| E-20 | Animasi masuk & keluar klip | #100, #101 | MVP | ✔ |
| E-21 | Preset motion (Ken Burns, parallax, shake) | #102, #103, #104 | MVP | ✔ |
| E-22 | Kinetic typography | #146 | v2 | ✔ |
| E-23 | Motion blur & camera shake | #105 | v2 | ✔ |
| E-24 | Efek reaktif audio | #106 | v2 | ✔ |
| E-25 | Look dari referensi (AI effect stack) | #69, #79 | v2 | ✔ |

**M6 — Compositing**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| K-01 | Blend mode | #120, #121 | MVP | ✔ |
| K-02 | Overlay / PIP | #116, #117, #118, #119, #122 | MVP | ✔ |
| K-03 | Mask | #123, #124, #125, #126 | MVP | ✔ |
| K-04 | Mask lanjutan (path, luma matte) | #126, † "animasikan mask ini mengikuti orang" | v2 | ✔ |
| K-05 | Chroma key | #127 | MVP | ✔ |
| K-06 | Chroma key lanjutan | #128 | v2 | ✔ |
| K-07 | Luma key / alpha extract | † "ambil bagian terang saja" | v3 | ✔ |
| K-08 | Track matte | #122 | v3 | ✔ |

**M7 — AI On-Device (MediaPipe)**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| D-01 | Background removal / cutout | #129 | MVP | ✔ |
| D-02 | Background replace | #130, #57 | MVP | ✔ |
| D-03 | Interactive / smart select (detektor untuk TR-10) | #236, #232 | MVP | ✔ |
| D-04 | Face landmark → sticker/effect wajah (detektor untuk TR-04) | #143 | MVP | ✔ |
| D-05 | Hand landmark → effect di tangan (detektor untuk TR-05) | #249 | MVP | ✔ |
| D-06 | Pose landmark (detektor untuk TR-06) | #227, #247 | MVP | ✔ |
| D-07 | Gesture recognition (detektor untuk TR-07) | #246 | MVP | ✔ |
| D-08 | Beauty / face retouch | #144 | MVP | ✔ |
| D-09 | Object detection (detektor untuk TR-08) | #186, #187 | MVP | ✔ |
| D-10 | Klasifikasi → auto-tag | #200 | v2 | ✔ |
| D-11 | Embedder → indeks & pencarian semantik | #200, #203 | MVP | ✔ |
| D-12 | Face blur / auto-censor dinamis | #248 | MVP | ✔ |
| D-13 | Caching hasil deteksi/tracking | — | MVP | **N/A** (internal) |

**M8 — Text & Caption**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| S-01 | Text overlay | #132, #136 | MVP | ✔ |
| S-02 | Gaya teks | #133, #135, #150 | MVP | ✔ |
| S-03 | Animasi teks preset | #137, #145 | MVP | ✔ |
| S-04 | Timing teks | #136 | MVP | ✔ |
| S-05 | Keyframe transform teks | #99 | v2 | ✔ |
| S-06 | Editor caption manual | #141, #142, #149 | MVP | ✔ |
| S-07 | Auto-subtitle ASR | #131 | MVP | ✔ |
| S-08 | Styling caption & preset viral | #134, #135, #147 | MVP | ✔ |
| S-09 | Import/export SRT/VTT/ASS | #147, #148 | v2 | ✔ |
| S-10 | Tracking text (konsumen TR-09) | #226, #230, #231, #138 | MVP | ✔ |
| S-11 | OCR teks dalam video | #139, #183 | MVP | ✔ |
| S-12 | TTS / AI voiceover | #163 | v3 | ✔ |
| S-13 | Library sticker/emoji/GIF | #143, † "tambahkan sticker panah" | v2 | ✔ |
| S-14 | Auto-translate subtitle | #140 | v3 | ✔ |
| S-15 | Efek teks lanjutan | #145 | v2 | ✔ |

**M9 — Audio**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| A-01 | Volume per klip | #151 | MVP | ✔ |
| A-02 | Fade in/out | #153 | MVP | ✔ |
| A-03 | Mute | #152, #168 | MVP | ✔ |
| A-04 | Mix multi-track | #160 | MVP | ✔ |
| A-05 | Replace audio | #156 | MVP | ✔ |
| A-06 | Remove/ekstrak audio | #165, #168 | MVP | ✔ |
| A-07 | Music library | #154, #155, #167 | MVP | ✔ |
| A-08 | Voiceover recording | #162 | v2 | ✔ |
| A-09 | Audio spectrum | #90 | MVP | ✔ |
| A-10 | Beat detection & marker | #161 | v2 | ✔ |
| A-11 | Noise reduction | #158 | v2 | ✔ |
| A-12 | EQ & kompresor | #159 | v2 | ✔ |
| A-13 | Auto-ducking | #157 | v2 | ✔ |
| A-14 | Pitch / voice changer | #164 | v2 | ✔ |
| A-15 | AI TTS / AI voiceover | #163 | v2 | ✔ |
| A-16 | Silence / dead-air removal | #39, #40 | MVP | ✔ |

**M10 — Export & Render**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| R-01 | Resolusi export | #169, #180 | MVP | ✔ |
| R-02 | Bitrate auto/manual | #172, #173 | MVP | ✔ |
| R-03 | FPS | #169 | MVP | ✔ |
| R-04 | Format & codec | #175 | MVP | ✔ |
| R-07 | Export di background | #250 | MVP | ✔ |
| R-08 | Progres + cancel | #251 (tampilkan progres) | MVP | ✔ |
| R-09 | Simpan ke galeri + share | #179 | MVP | ✔ |
| R-10 | Export preset sosial | #170, #171 | MVP | ✔ |
| R-11 | Export GIF/WebP | #176 | v3 | ✔ |
| R-12 | Export audio saja | #177 | v3 | ✔ |
| R-13 | Hardware encoder + fallback | — | MVP | **N/A** (internal) |
| R-14 | Export range / marker | #174 | v2 | ✔ |
| R-15 | Export/import file proyek | † "simpan proyek jadi file" | v2 | ✔ |
| R-16 | Batch export | † "ekspor semua proyek" | v3 | ✔ |
| R-17 | Export alpha channel | † "ekspor dengan latar transparan" | v3 | ✔ |
| R-18 | AI memilih setelan export optimal | #178 | MVP | ✔ |

**M11 — Template**

| ID | Fitur | Perintah AI pemicu | Stage | Status |
|---|---|---|---|---|
| M-01 | Template gallery | #13 | MVP | ✔ |
| M-02 | Apply template | #14 | MVP | ✔ |
| M-03 | Simpan sebagai template | #12 | v2 | ✔ |
| M-04 | Template trending dari server | #13 | v2 | ✔ |
| M-05 | AI template generation from prompt | #12 | MVP | ✔ |
| M-06 | Template caption/text style | † "simpan gaya caption ini jadi preset" | v2 | ✔ |

### 8.3 Rekap cakupan

| Modul | Fitur | Editing (wajib AI) | Non-editing/internal (N/A) | Tercakup | Persentase |
|---|---|---|---|---|---|
| M12 AI Core | 33 | 33 | 0 | 33 | 100% |
| **M14 Tracking Engine** | **15** | **15** | **0** | **15** | **100%** |
| M1 Project/Media/Folder | 14 | 10 | 4 (P-03, P-04, P-08, P-09) | 10 | 100% |
| M2 Timeline | 21 | 21 | 0 | 21 | 100% |
| M3 Transform | 8 | 8 | 0 | 8 | 100% |
| M4 Color | 15 | 15 | 0 | 15 | 100% |
| M5 Effects | 25 | 24 | 1 (E-18) | 24 | 100% |
| M6 Compositing | 8 | 8 | 0 | 8 | 100% |
| M7 On-device AI | 13 | 12 | 1 (D-13) | 12 | 100% |
| M8 Text & Caption | 15 | 15 | 0 | 15 | 100% |
| M9 Audio | 16 | 16 | 0 | 16 | 100% |
| M10 Export | 16 | 15 | 1 (R-13) | 15 | 100% |
| M11 Template | 6 | 6 | 0 | 6 | 100% |
| **TOTAL** | **205** | **198** | **7** | **198** | **100%** |

**Verifikasi terhadap target:** dari **154 fitur MVP**, **149 adalah fitur editing** dan **149/149 (100%)** memiliki minimal satu perintah AI pemicu. **5 fitur MVP dikecualikan** dan terdaftar terbuka: `P-03` (manajemen proyek), `P-04` (autosave), `P-09` (onboarding), `D-13` (cache deteksi/tracking), `R-13` (pemilihan encoder) — semuanya **tidak mengubah isi video**, sehingga tidak bermakna untuk dipicu lewat bahasa alami. Dua pengecualian lain (`P-08` pengaturan teknis proyek, `E-18` impor GLSL manual) berada di luar MVP.

**Catatan jujur tentang `†` (utang kamus prompt):** pada v2.1 utang ini **menyusut dari 23 menjadi 16 fitur** karena seluruh fitur tracking **dan** operasional export kini punya perintah kanonik bernomor. **Utang yang sudah dilunasi:** `D-03` → `#236`/`#232`, `D-05` → `#249`, `D-06` → `#227`/`#247`, `D-07` → `#246`, `D-12` → `#248`, `R-07` → `#250`, `R-08` → `#251`. Setelah pelunasan ini **tidak ada lagi fitur MVP yang bergantung HANYA pada perintah turunan** — seluruh **149 fitur editing MVP punya minimal satu perintah kanonik bernomor.** Sisa 16 fitur dengan `†` semuanya **sudah punya perintah kanonik** (atau berada di v2/v3) dan `†` hanya berfungsi sebagai variasi parameter. Stage 4 tetap wajib memasukkan semua `†` ke kamus intent + eval set.

## 9. Roadmap & Milestone

### 9.1 Rekap jumlah fitur

| Modul | Jumlah | MVP | v2 | v3 | Perintah AI |
|---|---|---|---|---|---|
| M12 AI Core | 33 | 26 | 6 | 1 | 1–14, 107–110, 181–198, 208–225 |
| **M14 Tracking Engine** | **15** | **15** | **0** | **0** | **226–249** |
| M1 Project, Media & Folder | 14 | 13 | 1 | 0 | 25–26, 45–46, 57–58, 199–207, 224 |
| M2 Timeline & Editing | 21 | 13 | 6 | 2 | 15–44 |
| M3 Transform | 8 | 7 | 0 | 1 | 45–58 |
| M4 Color & Filter | 15 | 13 | 2 | 0 | 59–79 |
| M5 Effects, Animasi & Transisi | 25 | 20 | 5 | 0 | 80–115 |
| M6 Compositing | 8 | 4 | 2 | 2 | 116–130 |
| M7 On-device AI | 13 | 12 | 1 | 0 | 129–130, 143–144, 186–187, 200–203, 246–249 |
| M8 Text & Caption | 15 | 9 | 4 | 2 | 131–150 |
| M9 Audio | 16 | 9 | 7 | 0 | 151–168 |
| M10 Export & Render | 16 | 10 | 2 | 4 | 169–180, 250–251 |
| M11 Template | 6 | 3 | 3 | 0 | 12–14 |
| ~~M13 Monetisasi~~ | ~~10~~ | — | — | — | **DIHAPUS (v2.0)** |
| **TOTAL** | **205** | **154** | **39** | **12** | **251 perintah** |

**MVP: 154 fitur** · **v2: 39 fitur** · **v3: 12 fitur** · **Total 205 fitur**.
**Perintah AI: 251** (210 aktif di MVP · 34 di v2 · 7 di v3). **Cakupan AI: 149/149 fitur editing MVP (100%) · Tracking: 15/15 MVP+Must (100%).**

### 9.2 Milestone MVP (AI-First + Tracking-first)

| Fase | Durasi | Isi utama | Gate |
|---|---|---|---|
| **α — AI Core + Tracking Engine + Engine dasar** | Mgg 1–7 | **AI Core: G-01, G-19, G-21, G-23, G-25, G-29, G-30, G-33** + **Tracking Engine M14 penuh (TR-01..TR-15)** termasuk detektor D-03..D-07, D-09, D-12, D-13 + X-06, X-08, S-10 + backend proxy Gemini + M1 (P-01..P-07, P-09), **P-10..P-14 (batch import folder + AI index)**, M2 dasar (T-01..T-06, T-08, T-09, T-14, T-17, T-18), M3, M10 dasar (R-09, R-13) | **Satu prompt menghasilkan video jadi** dari folder berisi ≥ 10 media; rencana edit terlihat & dapat diubah; **tracking bekerja end-to-end** (lacak wajah/tangan/objek → tempel teks/efek → stabilkan) | 
| **β — Parity Editing + AI Understanding** | Mgg 8–14 | M4 penuh (MVP), M5 MVP (17 shader + E-19/E-20/E-21 + binding tracking), M6 MVP (blend/overlay/mask/chroma **dengan mask dinamis**), M7 lanjutan (cutout dinamis, beauty, embedding), M8 MVP (ASR, caption style, OCR, tracking text lanjutan), M9 MVP, M10 penuh (R-01..R-04, R-07, R-08, R-10, R-18, R-250/251), M11 (M-01, M-02, M-05), AI understanding (G-02..G-04, G-06..G-08, G-10, G-11, G-14..G-16, G-18, G-20) | Semua 251 perintah lulus eval; tracking drift ≤ target pada 100 klip uji; cutout & subtitle bekerja pada konten nyata; 20 efek + 20 transisi |
| **γ — Performa, Aksesibilitas & GA** | Mgg 15–19 | Optimasi (laptop low-end, CPU, memori, **tracking batch offline**), aksesibilitas, lokalisasi, dokumentasi, privasi/consent AI, hardening + store listing | Crash-free ≥ 99,5%; export 1080p ≥ 1,2× realtime; 149/149 cakupan AI & 15/15 tracking terverifikasi |

> **Catatan jadwal:** karena tracking dinaikkan ke MVP+Must, fase α bertambah 1 minggu (6 → 7) dan total MVP 18 → **19 minggu**. Ini konsekuensi jujur dari keputusan "utamakan tracking" — bukan penambahan gratis.

### 9.3 Definition of Done (berlaku semua fitur)

1. Acceptance criteria di §6 lulus dengan bukti (test otomatis atau rekaman uji).
2. **Fitur editing disertai minimal 1 perintah AI terverifikasi** (§8) — bila belum, fitur belum selesai.
3. **Fitur tracking disertai uji drift/akurasi pada 100 klip** dan bukti bahwa data tracking dapat di-reuse (cache) — bila belum, fitur tracking belum selesai.
4. Berjalan offline **kecuali** fitur yang ditandai butuh server (dan yang bersangkutan punya mode antre, G-33).
5. Memiliki jalur undo/redo dan tidak merusak proyek yang sudah ada.
6. Diuji di 3 kelas laptop: low-end (8 GB RAM), mid (16 GB), high (32 GB+).
7. Help center tersedia untuk fitur Must.
8. Telemetry adopsi terpasang (tanpa PII).

---

## 10. Out of Scope (Eksplisit)

| # | Tidak dikerjakan | Alasan | Revisit |
|---|---|---|---|
| O-01 | **Monetisasi apa pun**: iklan (AdMob), langganan, IAP, paywall, watermark, kredit berbayar, fitur terkunci | **Keputusan produk v2.0: produk gratis penuh.** Nilai tambah tidak ditahan di balik pembayaran | Hanya jika ada keputusan bisnis baru di luar pipeline ini |
| O-02 | Versi mobile (Android/iOS) | Fokus desktop (Electron) di horizon ini; resource terbatas | Setelah desktop stabil (v3+) |
| O-03 | Editor web (browser) | Bukan segmen inti; kompetitor kuat | Tidak direncanakan |
| O-04 | Kolaborasi realtime multi-user / komentar ber-timestamp | Kompleksitas backend besar; tidak ada sinyal permintaan | v3+ sebagai eksperimen |
| O-05 | Multi-cam editor (sinkronisasi 2+ kamera) | Niche untuk persona utama | Tidak direncanakan |
| O-06 | 3D editing, VR/AR authoring, sphere/360° video | Bukan core; engine berbeda | Tidak direncanakan |
| O-07 | Live streaming & RTMP broadcast | Bukan editor | Tidak direncanakan |
| O-08 | Motion graphics kelas After Effects (expression, rigging, 3D layer) | Di luar kapasitas mobile & tim | Tidak direncanakan |
| O-09 | **Generative video penuh** (text-to-video menghasilkan klip utuh) | Biaya & kualitas belum dapat dijamin; bukan lagi editor | v3 hanya untuk aset pendukung (G-09, E-25) |
| O-10 | Render farm cloud berbayar | Tidak ada model bisnis & biaya infra | Tidak direncanakan |
| O-11 | Menggunakan/mereduplikasi model proprietary `magic_touch.tflite` | Legal & etika | **Permanen tidak** |
| O-12 | Marketplace jual-beli template/LUT antar pengguna | Butuh moderasi & pembayaran | Tidak direncanakan (tanpa monetisasi) |
| O-13 | DRM-protected media (Netflix/Spotify) sebagai sumber | Legal & teknis (Widevine) | **Permanen tidak** |
| O-14 | Cloud storage media tidak terbatas / backup video mentah | Biaya storage | Tidak direncanakan |
| O-15 | Dukungan UI bahasa selain Indonesia & Inggris | Fokus pasar | v2+ sesuai data lokasi |
| O-16 | Desktop-class color management (ACES, 10-bit HDR workflow) | Dijadwalkan v2 (GPU desktop menunjang) | v2+ |
| O-17 | Editing file > 30 menit 4K sebagai satu klip tanpa proxy | Batas hardware | v3 dengan proxy workflow |
| O-18 | Fitur sosial internal (feed, follow, komentar) | Kami editor, bukan jejaring sosial | Tidak direncanakan |
| O-19 | Auto-posting terjadwal langsung ke platform | Butuh API partner & kebijakan platform | v3 opsional (share intent tetap ada) |
| O-20 | Dubbing lip-sync tingkat studio | Kualitas belum memadai | v3 eksperimental (G-13) |
| O-21 | Mode "full auto tanpa pratinjau sama sekali" | Bertentangan dengan PR-3 (manusia memutuskan) | Tidak direncanakan — pratinjau rencana tetap ada |
| **O-22** | **Pengenalan identitas orang** (face recognition, pencocokan identitas, penyimpanan template biometrik) dari hasil tracking | **Etika & legal** — tracking Keylox melacak **posisi/landmark**, bukan identitas | **Permanen tidak.** Fitur privasi yang disediakan justru sebaliknya: `D-12` blur wajah mengikuti gerakan |
| **O-23** | Tracking lanjutan kelas produksi: **deformable/mesh tracking**, **planar/3D track**, **track multi-shot** (satu objek lintas potongan), **rotoscoping otomatis penuh** | Kompleksitas solver & biaya komputasi mobile; bukan pembeda inti di MVP | **v2** (occlusion berat & tracking multi-shot) — lihat §3 aturan penjadwalan |

---

## 11. Entitas Inti (bahan STAGE 6 — Database)

**Perubahan v2.0:** entitas monetisasi **dihapus** (`Subscription`, `AdSession`, `WatermarkConfig`), seluruh atribut `is_premium`/`pro_status` dihapus, dan entitas baru ditambahkan untuk AI-first + batch folder (`MediaIndex`/`AssetInsight`, `PromptTemplate`, `EditRecipe`, `AIUsageRecord`).

### 11.1 Entitas profil (minimum, tanpa monetisasi)

| Entitas | Atribut kunci | Relasi | Catatan |
|---|---|---|---|
| **User** | `user_id`, `display_name`, `locale`, `is_guest`, `created_at`, `last_active_at`, `ai_consent_granted_at`, `ai_daily_requests`, `ai_daily_reset_at` | 1—N Project, 1—N AIUsageRecord, 1—N PromptTemplate | **Guest mode adalah default**; akun sepenuhnya opsional. Field `ai_daily_*` ada untuk **perlindungan penyalahgunaan & kontrol biaya**, bukan untuk paywall — batas berlaku sama untuk semua pengguna |
| **AIUsageRecord** | `usage_id`, `user_id?`, `job_type`, `input_tokens`, `output_tokens`, `latency_ms`, `cache_hit`, `created_at` | N—1 User | Murni operasional (biaya & performa). Tanpa nilai uang, tanpa entitlement |

### 11.2 Entitas proyek & timeline

| Entitas | Atribut kunci | Relasi | Catatan |
|---|---|---|---|
| **Project** | `project_id`, `name`, `aspect_ratio`, `width`, `height`, `fps`, `canvas_color`, `canvas_fill_mode`, `duration_ms`, `cover_uri`, `created_at`, `updated_at`, `last_opened_at`, `schema_version`, `is_template_instance`, `template_id?`, `ai_style_profile_json?` | 1—N Track, 1—N MediaAsset, 1—N TextOverlay, 1—N ExportJob, 1—N AIConversation | Root aggregate |
| **Track** | `track_id`, `project_id`, `type` (video/overlay/text/audio/audio_extra), `index`, `is_muted`, `is_hidden`, `is_locked`, `volume`, `blend_mode?` | N—1 Project, 1—N Clip/AudioClip/TextOverlay | ≥ 6 track |
| **Clip** | `clip_id`, `track_id`, `media_asset_id`, `index`, `src_in_ms`, `src_out_ms`, `timeline_start_ms`, `duration_ms`, `speed`, `preserve_pitch`, `is_reversed`, `is_freeze`, `is_detached_audio`, `linked_clip_id?`, `group_id?` | N—1 Track, N—1 MediaAsset, 1—1 ClipTransform, 1—1 ColorGrade, 1—N EffectInstance, 1—N Keyframe, 1—1 ChromaKeySettings, N—N MaskInstance, 1—1 BlendSettings, 1—1 TransitionBinding? | Non-destruktif: hanya menunjuk rentang sumber |
| **ClipTransform** | `transform_id`, `clip_id`, `pos_x`, `pos_y`, `scale_x`, `scale_y`, `rotation`, `flip_h`, `flip_v`, `crop_x`, `crop_y`, `crop_w`, `crop_h`, `aspect_mode`, `opacity` | 1—1 Clip | Nilai normal (0–1) relatif kanvas |
| **ColorGrade** | `grade_id`, `clip_id`, `brightness`, `contrast`, `saturation`, `hue`, `sharpen_amount`, `sharpen_radius`, `vignette_amount`, `vignette_radius`, `vignette_softness`, `temperature`, `tint`, `curves_json`, `levels_json`, `color_balance_json`, `selective_color_json?`, `lut_id?`, `lut_intensity`, `look_preset` | 1—1 Clip, N—1 LutAsset | `*_json` untuk tool kompleks |
| **EffectInstance** | `effect_id`, `clip_id`, `effect_type` (glow/lens_blur/chromatic_aberration/light_sweep/fractal_noise/turbulent_displace/halftone/find_edges/twitch/audio_spectrum/four_color_gradient/radial_wipe/particular/blur/motion_blur/audio_reactive/…), `order_index`, `is_enabled`, `params_json`, `shader_version`, `time_range_start_ms?`, `time_range_end_ms?` | N—1 Clip | `params_json` = uniform shader; satu klip bisa N efek |
| **TransitionBinding** | `transition_id`, `project_id`, `clip_a_id`, `clip_b_id`, `transition_type`, `duration_ms`, `params_json` | N—1 Project | E-17; transisi juga bisa berasal dari efek |
| **LutAsset** | `lut_id`, `name`, `source` (built_in/imported/catalog), `file_uri`, `size`, `category`, `checksum` | 1—N ColorGrade | `.cube`; validasi 33³ |
| **Keyframe** | `keyframe_id`, `owner_type` (clip/effect/text/mask/audio), `owner_id`, `property`, `time_ms`, `value`, `value_type`, `interpolation`, `bezier_*` | N—1 Clip/EffectInstance/TextOverlay/MaskInstance | Mendukung copy/paste keyframe (T-20) |
| **MaskInstance** | `mask_id`, `clip_id`, `mask_type` (linear/radial/shape/brush/luma), `path_json`, `feather`, `invert`, `opacity`, `blend_mode`, `is_animated` | N—1 Clip | Path bisa ber-keyframe |
| **ChromaKeySettings** | `key_id`, `clip_id`, `key_color`, `tolerance`, `edge_thinness`, `feather`, `spill_suppression`, `alpha_threshold`, `is_enabled`, `extra_keys_json?`, `garbage_matte_json?` | 1—1 Clip | — |
| **BlendSettings** | `blend_id`, `clip_id`, `blend_mode`, `is_overlay`, `border_width`, `border_color`, `corner_radius`, `shadow_blur`, `shadow_offset_x`, `shadow_offset_y`, `shadow_opacity` | 1—1 Clip | Untuk K-01/K-02 |

### 11.3 Entitas media, folder & indeks (perluasan v2.0)

| Entitas | Atribut kunci | Relasi | Catatan |
|---|---|---|---|
| **MediaAsset** | `asset_id`, `project_id?`, `uri`, `type` (video/audio/image), `display_name`, `duration_ms`, `width`, `height`, `fps`, `rotation`, `codec`, `bitrate`, `size_bytes`, `has_audio`, `date_taken`, `folder_id?`, `quality_score?`, `is_missing`, `checksum`, `index_status` | N—1 Project, N—1 MediaFolder, 1—1 AssetInsight | Referensi, bukan salinan. `checksum` untuk deteksi duplikat saat batch import (P-10) |
| **MediaFolder** | `folder_id`, `project_id?`, `uri`, `display_name`, `source` (saf/scanned/watched), `media_count`, `last_scan_at`, `is_watched`, `auto_group_mode` | 1—N MediaAsset | Sumber import batch (P-10) & watched folder (perintah #207) |
| **MediaGroup** | `group_id`, `project_id`, `name`, `group_type` (event/date/type/orientation/subject/custom), `cover_asset_id?`, `asset_count`, `sort_index` | N—N MediaAsset | Hasil auto-group (P-11) |
| **AssetInsight** *(= MediaIndex)* | `insight_id`, `asset_id`, `duration_ms`, `width`, `height`, `scenes_json` (batas adegan + thumbnail), `subjects_json` (orang/hewan/objek + bbox), `labels_json` (≥ 60 kategori), `ocr_text`, `transcript_ref?`, `quality_score`, `brightness_score`, `blur_score`, `has_speech`, `language`, `embedding_ref`, `model_version`, `indexed_at`, `index_status` | 1—1 MediaAsset, N—1 EmbeddingVector | **Inti P-12/P-13/D-10/D-11**: bahan untuk auto-pick, pencarian momen, buang klip blur, filter "tanpa orang" |
| **EmbeddingVector** | `vector_id`, `asset_id`, `model`, `vector_blob`, `dim`, `created_at` | N—1 MediaAsset | Vector store lokal (SQLite/vector index) + opsional sinkron backend |
| **IndexJob** | `job_id`, `folder_id?`, `project_id?`, `scope` (single/batch/folder), `status` (queued/running/succeeded/failed/cancelled), `progress`, `asset_total`, `asset_done`, `started_at`, `finished_at`, `error_code` | N—1 MediaFolder | Indeks 500 aset selesai ≤ 15 menit di background (P-12) |

### 11.4 Entitas teks, audio & media lain

| Entitas | Atribut kunci | Relasi | Catatan |
|---|---|---|---|
| **TextOverlay** | `text_overlay_id`, `project_id`, `track_id`, `clip_id?`, `content`, `style_id`, `start_ms`, `end_ms`, `pos_x`, `pos_y`, `rotation`, `scale`, `opacity`, `animation_in`, `animation_out`, `animation_loop`, `animation_params_json`, `tracking_target_id?`, `z_index` | N—1 Project, N—1 Track, N—1 TextStyle | `tracking_target_id` untuk tracking text S-10 |
| **TextStyle** | `style_id`, `font_family`, `font_uri?`, `font_size`, `color`, `opacity`, `stroke_width`, `stroke_color`, `shadow_*`, `bg_color`, `bg_padding`, `bg_corner_radius`, `line_spacing`, `letter_spacing`, `align`, `curve_radius`, `is_brand_kit` | 1—N TextOverlay, 1—N CaptionSegment | Dapat disimpan sebagai preset gaya (M-06) |
| **CaptionTrack** | `caption_track_id`, `project_id`, `language`, `source` (manual/ai_asr), `style_id`, `is_translated_from?` | 1—N CaptionSegment | — |
| **CaptionSegment** | `segment_id`, `caption_track_id`, `start_ms`, `end_ms`, `text`, `speaker_label?`, `word_timings_json?`, `confidence`, `is_edited` | N—1 CaptionTrack | `word_timings_json` untuk karaoke/highlight (S-08) |
| **AudioClip** | `audio_clip_id`, `track_id`, `media_asset_id`, `src_in_ms`, `src_out_ms`, `timeline_start_ms`, `volume`, `fade_in_ms`, `fade_out_ms`, `is_muted`, `pitch_semitones`, `is_voiceover`, `ducking_json?` | N—1 Track, N—1 MediaAsset | — |
| **AudioEffect** | `audio_effect_id`, `audio_clip_id`, `effect_type` (denoise/eq/compressor/ducking/normalize), `params_json`, `is_enabled` | N—1 AudioClip | v2 |
| **MusicAsset** | `music_id`, `title`, `artist`, `duration_ms`, `genre`, `mood`, `tempo_bpm`, `license_type`, `preview_uri`, `full_uri` | 1—N AudioClip | Katalog dari server/CDN (A-07). Tanpa bentuk monetisasi |
| **Voiceover** | `voiceover_id`, `audio_clip_id`, `recorded_at`, `mic_source`, `script_text?` | 1—1 AudioClip | A-08 |

### 11.5 Entitas AI, template & export

| Entitas | Atribut kunci | Relasi | Catatan |
|---|---|---|---|
| **AIConversation** | `conversation_id`, `project_id?`, `user_id?`, `title`, `created_at`, `model`, `turn_count`, `tokens_used`, `tokens_saved_by_cache` | 1—N AIMessage | G-19 chat assistant |
| **AIMessage** | `message_id`, `conversation_id`, `role` (user/assistant/system), `content_type` (text/command/plan/result), `content`, `created_at`, `confidence`, `latency_ms`, `cache_hit` | N—1 AIConversation | — |
| **AICommand** | `command_id`, `project_id`, `user_id?`, `raw_text`, `input_mode` (text/voice), `language`, `intent`, `command_ref` (#1–#251), `classified_ops_json`, `status` (parsed/needs_clarification/applied/rejected/queued/failed), `confidence`, `operation_class` (D/N), `created_at` | 1—1 EditPlan, N—1 Project | **Memetakan setiap perintah ke nomor kanonik** untuk mengukur cakupan §8 |
| **EditPlan** | `plan_id`, `command_id`, `ops_json` (array operasi timeline), `plan_version`, `is_destructive`, `requires_confirm`, `is_user_modified`, `applied_at`, `undo_group_id`, `diff_summary` | 1—1 AICommand | **Wajib tervalidasi skema** sebelum apply (AC-8) |
| **EditRecipe** | `recipe_id`, `name`, `description`, `mode` (vlog/promo/tutorial/quote/recap/slideshow/story/custom), `category`, `plan_template_json`, `required_asset_count`, `is_builtin`, `is_user_saved` | 1—N Project | Auto-Mode G-22; dipakai perintah #2–#7 |
| **PromptTemplate** | `prompt_id`, `title`, `prompt_text`, `category`, `command_ref?`, `is_favorite`, `usage_count`, `created_at` | N—1 User, N—1 Project | Prompt library G-28 (perintah #218) |
| **AIJob** | `job_id`, `project_id?`, `user_id?`, `job_type` (scene_detect/asr/highlight/ocr/metadata/thumbnail/reframe/translate/tts/montage/search/index_asset/vision_color/script), `status`, `progress`, `input_ref`, `result_ref`, `started_at`, `finished_at`, `error_code`, `queued_reason` (offline/limit) | N—1 Project | Pekerjaan berat = async (G-33) |
| **AIResultCache** | `cache_id`, `content_hash`, `job_type`, `result_blob_ref`, `created_at`, `expires_at` | — | Mencegah biaya berulang (AC-11) |
| **TrackingTarget** | `target_id`, `project_id`, `clip_id`, `target_type` (manual_point/manual_area/motion/face/hand/pose/gesture/multi_object), `subject_label?`, `source` (mediapipe/optical_flow/hybrid), `tracking_mode` (realtime/batch), `track_start_ms`, `track_end_ms`, `is_cached`, `frame_count`, `avg_confidence`, `is_user_corrected`, `is_enabled` | N—1 Clip, 1—N TrackingKeyframe, 1—N TrackingBinding | **Inti M14** — satu target = satu objek/subjek terlacak. `TR-01..TR-08` |
| **TrackingKeyframe** | `tk_id`, `target_id`, `frame_index`, `time_ms`, `data_json` (point/transform/quad/landmark/skeleton/matte_ref), `confidence`, `is_manual` (koreksi user), `is_keyframe` (user menandai), `smoothing_applied` | N—1 TrackingTarget | **Transform per frame** — satu sumber kebenaran konsumen. Cache `D-13`, editor `TR-14` |
| **TrackingBinding** | `binding_id`, `project_id`, `target_id`, `consumer_type` (text/sticker/effect/mask/cutout/camera/overlay/particle), `consumer_id`, `offset_x`, `offset_y`, `scale_rel`, `rotation_rel`, `attach_anchor` (center/head/hand_l/hand_r/top/point), `smoothing_level`, `is_enabled`, `start_ms`, `end_ms` | N—1 TrackingTarget, N—1 (polimorfik consumer) | **Baru v2.1** — inilah yang membuat teks/efek/mask "menempel" pada subjek. `TR-09`, `TR-10`, `TR-13` |
| **TrackingSession** | `session_id`, `project_id`, `clip_id`, `mode` (realtime_preview/offline_batch/re_analyze), `status` (queued/analyzing/done/failed/cancelled), `progress`, `targets_json`, `started_at`, `finished_at`, `duration_ms`, `invalidated_by_edit?` | N—1 Clip | **Baru v2.1** — job tracking lokal (bukan `AIJob` cloud); invalidasi otomatis saat klip diubah. `TR-15`, perintah #245 |
| **Template** | `template_id`, `name`, `category`, `thumbnail_uri`, `duration_ms`, `slot_count`, `definition_json`, `source` (built_in/catalog/user), `is_ai_generated`, `version`, `created_at` | 1—N TemplateSlot, 1—N Project | M-01..M-06 |
| **TemplateSlot** | `slot_id`, `template_id`, `slot_type` (media/text/audio), `index`, `aspect_ratio`, `duration_ms`, `default_text`, `default_style_id` | N—1 Template | Placeholder saat apply |
| **ExportJob** | `job_id`, `project_id`, `user_id?`, `preset_id?`, `settings_source` (manual/ai), `resolution`, `width`, `height`, `fps`, `bitrate_mode`, `bitrate_kbps`, `codec`, `container`, `status`, `progress`, `output_uri`, `file_size_bytes`, `error_code`, `started_at`, `finished_at`, `duration_ms`, `render_time_ms` | N—1 Project, N—1 ExportPreset | **Tanpa `has_watermark`** — tidak ada watermark |
| **ExportPreset** | `preset_id`, `name` (TikTok/IG Reels/YT Shorts/Story/…), `resolution`, `aspect_ratio`, `fps`, `bitrate_kbps`, `codec`, `is_builtin` | 1—N ExportJob | R-10 |
| **UndoRecord** | `undo_id`, `project_id`, `group_id`, `action_type`, `payload_json`, `inverse_payload_json`, `is_ai_generated`, `ai_command_id?`, `created_at`, `sequence` | N—1 Project | Mendukung P-05 & AC-4 |
| **ProjectSnapshot** | `snapshot_id`, `project_id`, `version`, `state_blob_ref`, `created_at`, `trigger` (autosave/manual/pre_ai) | N—1 Project | Autosave & crash recovery |
| **ThumbnailRender** | `render_id`, `project_id`, `time_ms`, `uri`, `created_at`, `is_ai_cover` | N—1 Project | Cover proyek & AI thumbnail (G-10) |
| **ShareRecord** | `share_id`, `project_id`, `export_job_id`, `target_app`, `created_at` | N—1 ExportJob | Analitik R-09 |
| **AuditLog** | `log_id`, `user_id?`, `entity_type`, `entity_id`, `action`, `metadata_json`, `created_at` | N—1 User | Diagnostik |

**Entitas yang DIHAPUS pada v2.0:** `Subscription`, `AdSession`, `WatermarkConfig`, `CreditLedger` (diganti `AIUsageRecord` tanpa nilai uang), seluruh kolom `is_premium` / `pro_status` / `entitlement`.

### 11.6 Aturan integritas domain (wajib dipatuhi stage 6)

1. **Non-destruktif**: `Clip` hanya menunjuk rentang `MediaAsset`; file sumber tidak pernah dipotong.
2. **Cascade**: hapus `Project` → cascade ke `Track` → `Clip` → `EffectInstance`/`Keyframe`/`MaskInstance`/`ChromaKeySettings`/`BlendSettings`. Hapus `Clip` → hapus anak + `TrackingTarget` → `TrackingKeyframe`/`TrackingBinding`/`TrackingSession` terkait.
3. **Keyframe polymorphism**: `owner_type` + `owner_id` agar T-20 (copy lintas properti) mungkin.
4. **AI tidak pernah bypass domain**: `EditPlan` harus diterjemahkan ke operasi domain normal; tidak ada jalur tulis khusus AI.
5. **Indeks terpisah dari media**: `AssetInsight`/`EmbeddingVector` dapat dihapus & dibangun ulang tanpa menyentuh `MediaAsset` maupun `Clip`. Menghapus aset wajib menghapus insight & embedding-nya.
6. **Setiap perintah AI harus punya `command_ref`** yang menunjuk nomor perintah §6.1.1 → memungkinkan audit cakupan 100% secara otomatis.
7. **Riwayat AI = undo**: satu `AICommand` = satu group `UndoRecord` (`is_ai_generated = true`).
8. **Tanpa entitas monetisasi**: skema tidak boleh memiliki tabel/langganan/entitlement apa pun.
9. **Schema versioning**: `Project.schema_version` naik setiap perubahan skema; migrasi maju wajib untuk setiap versi.
10. **Satu sumber kebenaran tracking**: konsumen (teks/efek/mask/cutout/kamera) **tidak boleh** menyimpan data gerak sendiri — semuanya **membaca** `TrackingKeyframe` milik target melalui `TrackingBinding`. Dubplikasi data tracking dilarang.
11. **Invalidasi tracking**: bila `Clip` dipotong, di-speed, di-reverse, atau media-nya diganti, semua `TrackingTarget` + `TrackingKeyframe` anaknya **wajib ditandai invalid** dan dilacak ulang (`TR-15`). `TrackingBinding` tetap hidup (menunjuk target), tetapi menampilkan status "perlu lacak ulang".

---

## 12. Non-Functional Requirements

| Kategori | Requirement | Target terukur |
|---|---|---|
| **Platform** | Desktop cross-platform | Windows 10/11 (primary); macOS 12+ & Linux (Ubuntu 22.04+) secondary; Electron 30+ |
| **Performa - UI** | Timeline & interaksi | >= 55 fps saat scroll/scrub timeline 20 klip; respons tap/klik <= 100 ms; jank < 1% frame; multi-window tanpa drop frame |
| **Performa - Preview** | Playback | 1080p60 stabil di mid-tier laptop; 4K30 di high-tier; mode performa otomatis saat beban tinggi |
| **Performa - Export** | Kecepatan render | 1080p30 <= 1.2x realtime (HW-accelerated FFmpeg); 4K <= 4x realtime; render berjalan di background (worker thread) tanpa memblokir UI |
| **Performa - AI on-device** | Deteksi & segmentasi | Face/hand/pose >= 24 fps @720p; segmentasi >= 15 fps preview; cutout per-klip <= 1.5x durasi |
| **Performa - Tracking (M14)** | Akurasi & kecepatan tracking | Single-point/area >= 30 fps @720p; face/hand/pose tracking >= 24 fps @720p; multi-object >= 5 objek >= 24 fps @720p; drift <= 2% lebar frame (face/point) & <= 3% (area) pada 30 s; analisis batch 60 s video <= 20 s (mid-tier); re-link setelah oklusi <= 500 ms; re-use cache = 0 ms tambahan saat membuka proyek |
| **Performa - Batch import & indeks** | Folder besar | Import 1.000 file < 4 menit (bertahap, dapat dibatalkan); indeks 500 aset video <= 15 menit di background; tidak memblokir UI; drag-and-drop folder langsung |
| **Performa - AI cloud** | Latensi | Parse perintah <= 4 s p95; ASR <= 0.35x durasi; scene detect <= 0.25x durasi; one-prompt full edit <= 90 s untuk sumber 5 menit; timeout 60 s + retry 2x |
| **Efisiensi biaya AI** | Tanpa kontrol paywall, biaya harus dijaga teknis | >= 60% permintaan berulang dilayani cache; rata-rata 1 perintah <= anggaran token yang ditetapkan Stage 7; alert biaya harian; rate limit per pengguna sebagai perlindungan penyalahgunaan (bukan paywall) |
| **Performa - Startup** | Cold/warm start | <= 3 s cold; <= 1.5 s warm di laptop target |
| **Ukuran** | Installer | Base installer <= 150 MB; model MediaPipe on-demand (<= 30 MB terunduh); tanpa model proprietary |
| **Memori** | Peak RAM | <= 2 GB saat edit 1080p; <= 4 GB saat export 4K; manajemen memori eksplisit untuk video 4K (chunked processing, release buffer); tidak OOM pada laptop 8 GB |
| **Render background** | Worker thread | Render/export berjalan di background worker (Electron main process / worker thread); UI tetap responsif; progress bar di taskbar Windows; notifikasi OS saat selesai |
| **Multi-core FFmpeg** | Paralelisme | FFmpeg memakai multi-core (-threads auto); encode 1080p30 >= 1.2x realtime; 4K encode >= 0.5x realtime di laptop 8-core |
| **Penyimpanan** | Disk | Cache (indeks + hasil AI + thumbnail) <= 2 GB dengan auto-evict; file sementara dibersihkan setelah export; estimasi ruang sebelum export & indeks |
| **Offline** | Ketersediaan | 100% editing inti (trim, filter, color, effect, tracking, export) berfungsi tanpa internet via FFmpeg lokal; >= 15 perintah AI lokal berfungsi offline; perintah cloud (Gemini) diantre (bukan hilang) dengan status jelas |
| **Keandalan** | Crash-free | >= 99.5% session crash-free di GA; >= 99.8% di v2; recovery proyek >= 99% |
| **Reliabilitas export** | Tingkat keberhasilan | >= 98% export berhasil tanpa intervensi; file parsial selalu dibersihkan; kode error dapat ditindaklanjuti |
| **Kompatibilitas** | Perangkat | Windows 10/11 x64 (primary); macOS 12+ (Apple Silicon & Intel); Linux x64; RAM minimum 8 GB; GPU dedicated opsional (NVENC/QuickSync) untuk akselerasi encode |
| **Aksesibilitas** | A11y | Shortcut keyboard lengkap; target klik >= 24 px; kontras >= 4.5:1; alur prompt & export dapat dipakai dengan screen reader; input suara tersedia sebagai alternatif mengetik |
| **Lokalisasi** | Bahasa | UI ID + EN di MVP; ASR ID di MVP, ID+EN di v2; prompt menerima ID/EN/campur |
| **Observabilitas** | Telemetri | Event adopsi per fitur, funnel "prompt -> apply -> export", pemetaan perintah ke command_ref; tanpa PII; opt-out tersedia |
| **Distribusi** | Packaging | .exe via electron-builder: NSIS installer + portable; auto-update opsional (electron-updater); code signing untuk Windows/macOS |
| **Keamanan** | Kunci API | Tidak ada API key Gemini di binary; semua lewat backend proxy dengan auth + rate limit |

## 12.1 Spesifikasi hardware (referensi)

| Tahap | CPU | RAM | Penyimpanan | GPU | Catatan |
|---|---|---|---|---|---|
| **Development** | Intel Core i5 / AMD Ryzen 5 (gen terbaru) | 16 GB | NVMe SSD | Dedicated opsional | Mesin dev; menjalankan Electron + FFmpeg + tooling |
| **Runtime (minimum)** | Intel Core i5 / AMD Ryzen 5 | 8 GB | SSD | Opsional (NVENC/QuickSync/VAAPI) | Laptop kelas menengah; preview 1080p60 |
| **Runtime (recommended)** | Intel Core i7 / AMD Ryzen 7 | 16 GB | NVMe SSD | Dedicated (NVIDIA/AMD) | Preview 4K, render cepat |
| **ComfyUI (AI generatif, v3)** | - | - | - | NVIDIA GPU VRAM >= 8 GB | Dijalankan di Google Colab / mesin terpisah, bukan di app desktop |

## 12.2 Mobile future (appendix)

Spesifikasi perangkat mobile (Tier 1/2/3) dan batasan thermal/CPU mobile dipindahkan ke sini sebagai referensi untuk kemungkinan port mobile di masa depan. **Tidak berlaku untuk rilis desktop ini.**

| Tier | Contoh | RAM | Catatan |
|---|---|---|---|
| Tier 1 (high-end) | Flagship Android 8 GB+ | 8 GB+ | Referensi saja |
| Tier 2 (mid) | Kelas menengah 6 GB | 6 GB | Referensi saja |
| Tier 3 (low-end) | 3-4 GB RAM | 3-4 GB | Referensi saja |

Batasan thermal/CPU mobile (export menaikkan suhu <= 8 C, indeks berhenti saat CPU > 90%) **tidak berlaku** di desktop; yang berlaku adalah manajemen termal OS & fan laptop.



## 12.3 UX Desktop (wajib)

Aplikasi berjalan di layar besar (laptop/desktop) dengan pola interaksi desktop, bukan mobile:

| Aspek | Requirement |
|---|---|
| **Layar besar** | Layout multi-panel (media browser, preview, timeline, inspector) yang dapat di-resize; mendukung monitor eksternal & resolusi tinggi (1080p/1440p/4K) |
| **Multi-window** | Dapat membuka beberapa proyek di window terpisah; preview fullscreen di monitor kedua |
| **Drag-and-drop** | Import file/folder via drag-and-drop dari Explorer/Finder ke app; reorder klip di timeline via drag; drop overlay/asset |
| **Keyboard shortcuts** | Shortcut lengkap (trim, split, play/pause, undo/redo, zoom timeline, export) dengan kustomisasi; command palette (Ctrl/Cmd+K) |
| **Timeline horizontal lebar** | Timeline horizontal dengan zoom lebar; thumbnail strip; multi-track dengan tinggi track yang dapat diubah |
| **Native file system** | Dialog buka/simpan native (Open/Save); akses folder proyek; path absolut; recent files |
| **Menu bar** | Menu bar standar (File, Edit, View, Track, Export, Help) dengan shortcut; konteks menu klik kanan |
| **Progress bar di taskbar** | Progress export/render ditampilkan di taskbar Windows / dock macOS (progress bar overlay) |
| **Notifikasi OS** | Notifikasi sistem saat export/render selesai, error, atau job AI panjang selesai (meski app diminimize) |
| **Multi-monitor & HiDPI** | Dukungan DPI scaling; layout adaptif untuk layar kecil laptop |


---

## 13. Privasi & Kepatuhan Data

Prinsip: **on-device first, cloud hanya dengan persetujuan.**

| Aspek | Kebijakan |
|---|---|
| Media pengguna | Tetap di laptop untuk seluruh editing & fitur on-device. Tidak diunggah kecuali fitur AI cloud dipakai |
| Persetujuan AI cloud | Persetujuan eksplisit **per sesi/proyek** sebelum media dikirim; penjelasan jelas apa yang dikirim (frame/audio/teks) & berapa lama disimpan; dapat dicabut |
| Data dikirim ke Gemini | Frame terpilih, potongan audio untuk ASR, atau prompt teks — seminimal mungkin; bukan file video utuh bila tidak perlu |
| Indeks aset (P-12) | **Dibuat & disimpan lokal secara default.** Upload indeks/embedding ke server hanya untuk fungsi sinkronisasi lintas-device, dan itu pun opt-in |
| **Tracking (M14)** | **100% on-device.** Frame tidak pernah dikirim ke server untuk keperluan tracking. Data tracking (titik/landmark/transform) disimpan **di dalam proyek secara lokal** |
| **Tanpa identitas & biometrik** | Tracking melacak **posisi/landmark**, bukan identitas. **Tidak ada face recognition**, tidak ada pencocokan identitas, dan landmark wajah **tidak** disimpan sebagai template biometrik |
| **Perlindungan orang dalam video** | `D-12` (blur wajah mengikuti gerakan) tersedia di MVP agar pengguna dapat menyensor wajah orang lain dengan satu perintah — fitur privasi, bukan monetisasi |
| Retensi di server | Hasil analisis disimpan maksimal 30 hari untuk cache; audio tidak disimpan setelah subtitle dihasilkan; indeks dapat dihapus kapan saja |
| Pelatihan model | Data pengguna **tidak** digunakan untuk melatih model |
| Akun & PII | Guest mode penuh untuk semua fitur; email hanya bila pengguna memilih login |
| Anak-anak | Tidak menargetkan < 13 tahun |
| Tanpa pelacakan iklan | Tidak ada SDK iklan, tidak ada penargetan iklan, tidak ada penjualan data |
| Hak pengguna | Ekspor & hapus seluruh data proyek + indeks lokal satu aksi; permintaan hapus data server bila ada akun |
| Regulasi | UU PDP Indonesia + GDPR untuk pengguna Eropa; Data Safety Microsoft Store / distribusi langsung akurat; rationale izin jelas saat runtime |
| Izin OS | Kamera, mikrofon, notifikasi, akses folder diminta kontekstual; tidak menyimpan lokasi; metadata GPS dibuang saat export kecuali diminta |

---

## 14. Risiko Utama, Asumsi & Pertanyaan Terbuka

> ID risiko/asumsi bukan kontrak (hanya ID fitur yang stabil). Nomor di bawah sudah disesuaikan dengan penghapusan monetisasi.

### 14.1 Risiko

| # | Risiko | Prob. | Dampak | Mitigasi | Owner |
|---|---|---|---|---|---|
| RSK-01 | **Native FFmpeg (binary) kompatibilitas & distribusi** — pipeline export bergantung padanya; variasi versi per OS | Tinggi | Tinggi | Bundle FFmpeg statis per platform (Windows/macOS/Linux) via electron-builder; spike teknis Minggu 1; fallback ke WebCodecs bila tersedia | Eng Lead |
| RSK-02 | **Biaya AI tanpa pendapatan** — produk gratis penuh, tetapi setiap prompt & indeks menambah biaya Gemini | **Sangat Tinggi** | **Sangat Tinggi** | Cache ber-hash (target ≥ 60% hit), batas harian per pengguna (perlindungan penyalahgunaan), model murah sebagai default, model mahal hanya untuk job yang benar-benar butuh, indeks & analisis ringan di on-device, monitoring biaya harian + alert, keputusan anggaran bulanan eksplisit dari sponsor | PM + Eng + Sponsor |
| RSK-03 | Penyalahgunaan gratis (bot/script memanggil AI tanpa batas) | Tinggi | Tinggi | Rate limit per pengguna, integritas perangkat (OS-level), deteksi pola anomali, antrean prioritas untuk pengguna nyata | Eng + Security |
| RSK-04 | Akurasi ASR Indonesia pada audio berisik/dialek rendah | Sedang | Sedang | Target ≥ 92% hanya untuk audio jernih & dinyatakan eksplisit; koreksi cepat per segmen; denoise sebelum ASR; uji pada 100 klip nyata | QA + PM |
| RSK-05 | Performa MediaPipe di laptop low-end (frame drop) | Tinggi | Sedang | Mode low-end (resolusi turun, interval inferensi), model Lite, on-demand download, proses batch offline untuk cutout panjang | Eng Lead |
| RSK-06 | Indeks folder besar (ribuan aset) memakan waktu/baterai/penyimpanan | Sedang | Sedang | Indeks inkremental, prioritas aset yang dipakai, berhenti otomatis saat thermal/CPU tinggi, batas cache 800 MB, insight opsional per jenis | Eng Lead |
| RSK-07 | Parity shader sulit di GLES 3.0 + variasi GPU Android | Sedang | Sedang | Render graph tunggal + golden-image test lintas 12 device; varian shader low-end; fallback CPU hanya untuk blur | Eng Lead |
| RSK-08 | Sinkronisasi A/V drift pada proyek panjang/dekat perubahan speed | Sedang | Sedang | Uji drift otomatis di CI (target < 40 ms/60 s); klip ber-speed diproses sebagai satu unit waktu | QA |
| RSK-09 | **Kualitas hasil AI "terasa AI"** (auto-cut salah, caption ngawur, warna aneh) sehingga produk terasa seperti gimmick | Sedang | Tinggi | Wajib pratinjau + konfirmasi untuk operasi destruktif (AC-3); selalu bisa diedit manual; confidence rendah → tanya; one-prompt mode punya pratinjau rencana (G-32) | PM |
| RSK-10 | Ketergantungan pada satu penyedia AI (Gemini) — outage/limit/perubahan harga | Sedang | Tinggi | Abstraksi lapisan AI (bukan panggilan langsung ke SDK), cache agresif, mode degradasi (G-33), jalur on-device sebagai fallback sebagian, rencana penyedia kedua | Eng Lead |
| RSK-11 | Scope creep — "Keyflow punya X, kita harus juga" | Tinggi | Tinggi | Dokumen ini jadi kontrak stage; perubahan hanya lewat CR tertulis (§14.4); setiap tambahan harus mengorbankan sesuatu | PM |
| RSK-12 | Detail Keyflow yang diinfer salah (logic obfuscated) | Sedang | Sedang | Validasi lewat uji manual aplikasi Keyflow + riset store; prioritas nilai pengguna, bukan byte-parity | PM |
| RSK-13 | Legal: lisensi model MediaPipe, musik katalog, font, LUT | Sedang | Tinggi | Audit lisensi tiap model (MediaPipe Apache 2.0), lisensi musik jelas, font open-source (OFL) saja, LUT buatan sendiri/berlisensi | Legal + PM |
| RSK-14 | Lisensi kodec komersial (H.264/H.265) di pipeline | Sedang | Sedang | Gunakan MediaCodec platform untuk codec berlisensi; hindari distribusi encoder FFmpeg berlisensi; konsultasi legal | Legal + Eng |
| RSK-15 | Distribusi desktop ditolak (code signing / notarization / SmartScreen) | Rendah | Tinggi | Code signing Windows & macOS; notarization macOS; audit pra-rilis installer (NSIS); dokumentasi instalasi | PM + Eng |
| RSK-16 | AI-first membuat pengguna **pro** merasa kehilangan kontrol | Sedang | Sedang | PR-4: semua jalur manual tetap ada; timeline manual satu tap dari layar prompt; pengaturan lanjutan tidak disembunyikan | Design + PM |
| **RSK-17** | **Tracking drift / loss of lock** — subjek berhenti dilacak, keluar frame, teroklusi, atau bergerak terlalu cepat sehingga teks/efek "lepas" dari subjek | **Tinggi** | **Tinggi** | Solver tracking + optical-flow gap filling; re-link otomatis ≤ 500 ms; **tracking editor `TR-14` untuk koreksi manual per frame**; indikator confidence; uji drift otomatis pada 100 klip uji sebagai gate rilis | Eng Lead + PM |
| **RSK-18** | **Tracking berat → thermal & CPU tinggi** (pelacakan + 17 shader + preview sekaligus) | Tinggi | Sedang | Mode batch offline untuk klip panjang; resolusi preview diturunkan saat tracking aktif; degradasi bertahap; reuse cache (tidak menghitung ulang); batas thread | Eng Lead |
| **RSK-19** | **Tracking multi-objek di laptop low-end** (>= 5 objek + skeleton) melebihi anggaran komputasi | Sedang | Sedang | Batas objek adaptif per tier; skeleton hanya untuk objek terpilih; interval inferensi; fallback ke tracking titik/area | Eng Lead |
| **RSK-20** | Ekspektasi etika: pengguna mengira tracking = pengenalan identitas | Rendah | Tinggi | Komunikasi eksplisit "tracking posisi, bukan identitas"; tanpa face recognition; `D-12` blur wajah ditonjolkan sebagai kontrol privasi | PM + Legal |

### 14.2 Asumsi

| # | Asumsi | Dampak bila salah |
|---|---|---|
| ASM-01 | Daftar fitur Keyflow di `research/keyflow_features.md` cukup akurat sebagai baseline parity | Bisa ada fitur tersembunyi; dampak rendah karena kita menambah AI, bukan hanya mengejar parity |
| ASM-02 | **Ada sponsor/anggaran yang menutup biaya AI tanpa pendapatan** (diperlakukan sebagai biaya akuisisi & riset) | Bila tidak, seluruh strategi AI-first harus diubah drastis — **ini asumsi paling kritis di dokumen ini** |
| ASM-03 | Permintaan editing via bahasa alami nyata, bukan gimmick — wajib divalidasi wawancara ≥ 10 pengguna di Phase Discovery | Bila salah, AI tetap bernilai pada pemahaman isi (ASR/scene detect), tapi penekanan one-prompt harus diturunkan |
| ASM-04 | Laptop target minimal 8 GB RAM, Windows 10+/macOS 12+/Linux (x64); GPU dedicated opsional | Bila pasar butuh low-end lebih rendah, perlu mode drastis berkurang |
| ASM-05 | Pengguna punya internet setidaknya terputus-putus | Bila tidak, fitur understanding harus dijadwalkan + ASR on-device (tidak ada di MVP) |
| ASM-06 | Biaya per perintah & per menit video cukup rendah untuk dibiayai anggaran | Bila tidak, kurangi cakupan cloud (pindahkan lebih banyak ke on-device) |
| ASM-07 | MediaPipe Selfie/MultiClass Segmentation cukup baik untuk cutout produk & orang (bukan hanya selfie) | Bila tidak, D-01 terbatas pada manusia dan butuh model tambahan (mis. varian SAM mobile) di v2 |
| ASM-08 | Tim mampu memelihara satu render graph GLES tunggal untuk semua shader | Bila tidak, beberapa efek ditunda ke v2/v3 |
| ASM-09 | Pengguna bersedia membiarkan media dikirim ke cloud untuk fitur understanding (dengan consent) | Bila tidak, fitur understanding harus dibatasi kuat atau dipindah on-device |
| ASM-10 | Tidak dibutuhkan iOS dalam 18 bulan pertama | Bila dibutuhkan, arsitektur domain (§11) tetap dipakai; UI ditulis ulang |
| **ASM-11** | **Tracking adalah kebutuhan nyata pengguna** (teks/efek/mask menempel pada subjek bergerak), bukan hanya keinginan internal | Bila salah, `M14` tetap berguna untuk stabilisasi & auto-reframe, tetapi prioritas MVP-nya bisa diturunkan (bukan dihapus) |
| **ASM-12** | MediaPipe (landmarker/detector) + optical-flow cukup sebagai fondasi tracking tanpa model proprietary tambahan | Bila tidak, perlu model tambahan open-source (mis. varian SAM mobile) — menambah ukuran unduhan & waktu integrasi |

### 14.3 Pertanyaan terbuka (harus terjawab sebelum dev dimulai)

| # | Pertanyaan | Owner | Deadline |
|---|---|---|---|
| Q-01 | Apakah Media3 Transformer cukup untuk semua kebutuhan export (blend, mask, shader, audio mix), atau wajib FFmpeg custom? | Eng Lead | Akhir Minggu 1 (spike) |
| Q-02 | **Berapa anggaran biaya AI per bulan, dan berapa batas per pengguna yang masih dapat dibiayai?** (menggantikan pertanyaan harga Pro pada v1.0) | PM + Sponsor | Sebelum α |
| Q-03 | Apakah indeks aset boleh/dapat dibuat on-device sepenuhnya (praktis & cepat), atau perlu bantuan cloud? | Eng Lead | Minggu 4 |
| Q-04 | Apakah pengguna bersedia mengunggah audio ke server untuk ASR, atau butuh ASR on-device? | PM + Eng | Setelah wawancara 10 pengguna |
| Q-05 | Auto-cut & scene detect: on-device (cepat, offline, akurasi sedang) atau cloud (akurat, butuh jaringan)? | Eng Lead | Minggu 4 |
| Q-06 | Berapa durasi video maksimum yang didukung (butuh proxy workflow)? | Eng Lead | Minggu 4 |
| Q-07 | Berapa batas jumlah aset per folder yang realistis (500? 5.000? 50.000?) dan bagaimana indeks menanganinya? | Eng Lead + PM | Minggu 4 |
| Q-08 | Sumber musik berlisensi: beli katalog, partner, atau kurasi royalty-free? | Legal + PM | Minggu 8 |
| Q-09 | Apakah backend sejak hari pertama, atau Firebase Functions cukup? | Eng Lead | Minggu 2 |
| Q-10 | Bagaimana kebijakan migrasi proyek & indeks antar versi skema? | Eng Lead | Stage 6 |
| Q-11 | Apakah perlu penyedia AI kedua sejak MVP (mitigasi RSK-10) atau cukup abstraksi lapisan? | Eng Lead | Minggu 6 |
| **Q-12** | **Arsitektur tracking**: apakah MediaPipe landmarker/detector + optical-flow cukup, atau perlu solver tracking khusus (mis. varian SAM mobile)? Ini menentukan RSK-17 & ASM-12 | Eng Lead | Akhir Minggu 1 (spike) |
| **Q-13** | Berapa **jumlah objek tracking maksimum per tier laptop** yang masih ≥ 24 fps @720p (target 5 objek multi-object)? | Eng Lead | Minggu 3 |
| **Q-14** | Apakah **one-prompt mode wajib menyertakan tracking** saat relevan (mis. "buat teks menempel pada orangnya") atau tracking hanya dipicu eksplisit? | PM + Design | Sebelum α |

### 14.4 Perubahan scope (change request policy)

Setiap penambahan scope setelah dokumen ini disetujui **wajib** melalui change request tertulis berisi: (1) fitur yang diminta + sumber, (2) dampak ke tanggal rilis, (3) fitur lain yang diturunkan/dihapus sebagai penyeimbang (tidak boleh ada penambahan tanpa pengurangan), (4) keputusan PM (Accept / Defer / Reject) + alasan. **Tidak ada scope yang diserap diam-diam.**

---

## 15. Lampiran

### 15.1 Ringkasan untuk GATE 1 (ulang)

**Keputusan yang diminta:**
1. **Setujui 154 fitur MVP** (§9.1) dan prinsip bahwa MVP memang besar karena AI harus bisa memicu semuanya **dan tracking harus ada sejak inti** — dengan konsekuensi **panel UI manual sebagian fitur menyusul di v2**.
2. **Setujui prinsip AI-First (PR-1..PR-6)**, khususnya **PR-3: AI menghasilkan EditPlan, bukan menulis langsung ke timeline** — fondasi pratinjau, undo, dan keamanan di seluruh pipeline.
3. **Setujui PR-7: tracking adalah kemampuan inti.** Modul **M14 Tracking Engine (`TR-01..TR-15`, 15 fitur, semuanya MVP + Must)**, **Tracking Capability Matrix (§7)**, dan kewajiban **integrasi tracking ↔ teks/sticker/efek/mask/cutout/kamera** masuk MVP. Konsekuensi jujur: **fase α bertambah 1 minggu** (total MVP 19 minggu).
4. **Setujui target cakupan 100%**: setiap fitur editing wajib punya perintah AI (§8) — **149/149 fitur editing MVP (100%)** memiliki perintah kanonik bernomor, **dan tidak ada lagi fitur MVP yang bergantung hanya pada perintah turunan.** Utang kamus prompt `†` menyusut **23 → 16 fitur** (7 fitur tracking & export kini punya perintah kanonik; sisanya non-MVP atau sudah punya perintah kanonik).
5. **Putuskan ASM-02 & Q-02**: tanpa monetisasi, **siapa yang membiayai biaya AI** dan berapa batasnya. Tanpa jawaban ini, seluruh rencana AI-first tidak dapat dieksekusi.
6. **Putuskan pertanyaan tracking (Q-12, Q-13, Q-14)**: arsitektur solver tracking (MediaPipe + optical flow vs tambahan model), batas jumlah objek per tier laptop, dan apakah one-prompt mode wajib menyertakan tracking saat relevan.
7. **Setujui larangan tegas:** tidak memakai `magic_touch.tflite`; tidak ada API key di binary; tidak ada upload media tanpa consent; **tracking 100% on-device tanpa pengenalan identitas/biometrik**; **tidak ada monetisasi dalam horizon ini**.

### 15.2 Matriks prioritisasi ringkas (tingkat MVP)

| Kelompok | Fitur MVP | Must | Should |
|---|---|---|---|
| AI Core (M12) | 26 | 19 | 7 |
| **Tracking Engine (M14)** | **15** | **15** | **0** |
| Editing engine (M2, M3, M4, M5, M6) | 57 | 43 | 14 |
| Media, folder & indeks (M1) | 13 | 11 | 2 |
| On-device AI / detektor (M7) | 12 | 12 | 0 |
| Text, Caption & Audio (M8, M9) | 18 | 14 | 4 |
| Export (M10) | 10 | 7 | 3 |
| Template (M11) | 3 | 0 | 3 |
| **Total MVP** | **154** | **121** | **33** |

> **Baca tabel ini dengan benar:** kelompok **Tracking Engine** (15 fitur) dan **On-device AI** (12 fitur, yang kini hampir seluruhnya adalah detektor sumber tracking) adalah **keputusan GATE 1 ulang**: tracking tidak "dititipkan" sebagai add-on, ia **blok pihak pertama yang harus selesai di fase α**.

### 15.3 Referensi

- `keylox/research/keyflow_features.md` — hasil reverse engineering paket aplikasi `com.angkin.keyflow` v1.3.2 (apktool 2.10.0).
- MediaPipe Tasks (cross-platform via @mediapipe/tasks) — ImageSegmenter, InteractiveSegmenter, FaceLandmarker, HandLandmarker, PoseLandmarker, GestureRecognizer, ObjectDetector, ImageClassifier, ImageEmbedder.
- Native FFmpeg + child_process — pipeline export/transcode desktop.
- Google Gemini API — `gemini-2.5-flash` (natural language, video understanding, vision/OCR, ASR, TTS).

### 15.4 Kontrak ke STAGE berikutnya

| Stage | Yang diharapkan dari dokumen ini | Acceptance untuk stage tersebut |
|---|---|---|
| Stage 2 — Arsitektur | §2 (prinsip AI-First + PR-7 tracking), §4 (modul), §6 (fitur + AC), §8 (cakupan), §12 (NFR) | Setiap modul **M1–M12 + M14** punya komponen & alur data; AI Orchestrator + EditPlan terdokumentasi; **Tracking Engine tunggal + alur data tracking (§4) terdokumentasi**; jalur offline/antrean jelas |
| Stage 3 — UX/UI | §1.3 (persona), §2.2 (perjalanan AI-first + tracking), §6 (US/AC), §9.2 (milestone) | **Layar utama adalah layar prompt**, bukan timeline; timeline = satu tap; alur pratinjau EditPlan & refinement dirancang; **layar "pilih target tracking" dan tracking editor (`TR-14`) dirancang** |
| Stage 4 — Prompt/LLM | **§6.1.1 (251 perintah)**, §6.1.2 (AC-1..AC-11), §8 (utang `†`) | System prompt + skema `EditPlan` + kamus intent untuk **semua 251 perintah** (termasuk **Grup N tracking & Grup O operasional**) + eval set 300 perintah; setiap `†` masuk kamus |
| Stage 5 — Render/Media | §6.2 (M14 tracking), §6.7 (M5 efek), §6.12 (M10 export), §12 (NFR), RSK-01/RSK-07/**RSK-17** | Render graph & pipeline export dengan target performa; **Tracking Engine (solver + optical flow) & binding ke konsumen**; keputusan Media3 vs FFmpeg (Q-01); spike arsitektur tracking (Q-12) |
| Stage 6 — Database | **§11 seluruhnya** | Skema memenuhi semua entitas + **11 aturan integritas §11.6**; **tanpa entitas monetisasi**; `TrackingTarget`/`TrackingKeyframe`/`TrackingBinding`/`TrackingSession` + aturan **satu sumber kebenaran tracking**; `AICommand.command_ref` (#1–#251) tersedia untuk audit cakupan |
| Stage 7 — Backend/API | §4 tabel backend, §6.1, §8, §13, RSK-02/RSK-03 | Endpoint proxy Gemini, antrean job, cache, rate limit & anggaran biaya; tanpa endpoint pembayaran; **tanpa endpoint tracking (tracking 100% on-device)** |
| Stage 8 — QA | §6 AC, §7 (matriks tracking), §8 matriks, §9.3 DoD, §12 NFR | Test case terpetakan 1:1 per ID fitur; **test khusus**: setiap perintah AI menghasilkan operasi yang diharapkan; **uji drift/akurasi tracking pada 100 klip + uji multi-objek per tier**; audit otomatis cakupan AI 100% |

---

**Status dokumen:** Draft **v2.2** — hasil REVISI Stage 1 (platform mobile → desktop Electron) — **menunggu persetujuan**.
Setelah disetujui, dokumen dibekukan sebagai **baseline** dan setiap perubahan mengikuti §14.4.
