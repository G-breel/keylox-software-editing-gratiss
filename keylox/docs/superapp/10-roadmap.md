# 10 — Roadmap & Urutan Prioritas

> Dokumen keputusan produk/teknis. Mengikat urutan kerja setelah rework v1.2.
> Sumber: `00-spec.md`, `08-review.md` (GAP), `09-rework-v12.md`, arahan user 2026-10-19.

---

## ADR-06 — "Uji AI paling akhir"

**Status:** Diterima (user: *"uji ai terakhir aja setelah bisa dipakai normal"*).
**Tanggal:** 2026-10-19.

**Keputusan:**

1. **Prioritas utama = aplikasi bisa dipakai normal sebagai editor video.**
   AI **tetap dibangun**, tetapi **pengujian AI dengan API sungguhan dilakukan paling akhir**.
2. Selama fase ini, semua fitur AI diuji dengan **MOCK_AI=true** (tanpa jaringan, tanpa key).
3. **Rotasi API key tidak lagi menghambat** pengembangan (tetap disarankan untuk keamanan).
4. Rilis tidak boleh diblokir hanya karena "belum uji AI live".

**Alasan:** tanpa editor yang stabil (timeline, preview, export, simpan proyek), fitur AI tidak
punya tempat berpijak. Menguji AI lebih awal = menguji di atas fondasi yang masih berubah.

---

## Definisi "Bisa Dipakai Normal" (Definition of Usable / DoU)

Aplikasi dianggap **bisa dipakai normal** bila 8 hal ini bekerja tanpa AI:

| # | Kemampuan | Status | Kriteria lulus |
|---|---|---|---|
| U1 | Impor media | ✅ | Video/audio/gambar masuk, thumbnail muncul, durasi terbaca |
| U2 | Timeline | ✅ | Drag-move, trim handle, split, delete, multi-track, snap, zoom |
| U3 | Preview | ✅ | Play/pause/seek akurat; perubahan langsung terlihat |
| U4 | Teks & caption manual | 🟡 dasar | Tambah/ubah/geser teks; caption manual tanpa AI |
| U5 | Audio | ✅ | Volume, mute, fade in/out, waveform terlihat |
| U6 | Export | 🟡 dasar | MP4 H.264 keluar benar (durasi, resolusi, audio sync) — multi-clip module siap, belum di-wire |
| U7 | Undo/redo | ✅ | Andal, termasuk 1 perintah = 1 langkah undo |
| U8 | Proyek | ✅ | Simpan/buka `.keylox`, media ter-relink |

> Selama U1–U8 belum lulus, **jangan** mengejar fitur baru.

---

## Urutan prioritas (P0 → P4)

### P0 — Selesaikan fondasi yang sedang jalan
- Rework v1.2 (R1–R7): multi-provider, capability, usage, privasi, onboarding, undo grouping,
  `data-testid`. **Sudah ±60% saat dokumen ini ditulis.**
- Alasan diselesaikan (bukan ditinggalkan): sudah setengah jalan, dan tanpa itu app tetap
  terkunci ke Gemini + privasi belum tertutup.

### P1 — Editor usable (DoU U1–U8) — **fokus utama**
| Item | Kenapa penting |
|---|---|
| Timeline serius | Semua editing bergantung di sini |
| Preview akurat | Tanpa ini user tidak percaya hasilnya |
| Split/trim/drag/snap | Inti "editor video" |
| Export andal | Output = alasan app ada |
| Simpan/buka proyek | Kerja user tidak boleh hilang |
| Waveform audio | Standar minimal editor |

### P2 — Fitur manual yang terasa (tanpa AI)
- Teks/caption manual, transisi, filter dasar, color grading dasar, speed, crop/rotate.
- Asset pack: 3–5 efek (glow, chromatic aberration, light sweep) + impor LUT/font/musik user.

### P3 — Fitur AI (dibangun + diuji dengan mock)
- Prompt → EditPlan, auto-caption (ASR), scene detect, highlight, auto-reframe.
- **Semua tes memakai `MOCK_AI=true`.** Tidak ada panggilan API nyata di CI.

### P4 — Tracking + uji AI live (paling akhir)
- Tracking M14 (face/hand/pose/gesture, objek, stabilisasi) — MediaPipe on-device.
- **Uji AI live**: satu sesi uji manual dengan key user untuk semua provider yang didukung,
  termasuk kasus gagal (key salah, kuota habis, model tidak mendukung JSON/vision/audio).
- Baru setelah ini: rilis publik.

---

## Yang **tidak** boleh terjadi

- Menambah fitur baru saat U1–U8 masih merah.
- Mengejar "205 fitur" sebelum 8 kemampuan dasar stabil.
- Menguji AI live di tengah perubahan besar (hasilnya tidak bisa dipercaya).

---

## Milestone

| Milestone | Isi | Status |
|---|---|---|
| M0 | Fondasi + keamanan + build `.exe` | ✅ |
| M1 | Rework v1.2 (fondasi AI/provider/privasi) | 🟡 berjalan |
| M2 | **Editor usable (DoU U1–U8)** | ⬜ berikutnya |
| M3 | Fitur manual + asset pack | ⬜ |
| M4 | Fitur AI (mock) + tracking | ⬜ |
| M5 | **Uji AI live + rilis** | ⬜ paling akhir |
