# Keylox Starter Pack

Paket awal efek warna (LUT 3D) untuk Keylox. Lisensi **CC0 1.0** — bebas dipakai,
dimodifikasi, dan didistribusikan tanpa atribusi.

## Isi

- `luts/warm.cube` — hangat (vlog, sore)
- `luts/cool.cube` — dingin (malam, urban)
- `luts/cinematic.cube` — kontras tinggi, bayangan teal

## Format

File `.cube` standar (Adobe/Resolve). `LUT_3D_SIZE 5` (125 entri). Bisa diimpor ke
color grading (Inspector → Filter → LUT) atau dipakai sebagai preset.

## Cara menambahkan pack sendiri

1. Buat folder `assets/packs/<id>/` dengan `manifest.json` + file aset.
2. Isi `manifest.json` sesuai skema di `starter/manifest.json`.
3. Semua aset wajib **CC0 / buatan sendiri** (jangan aset berhak cipta).
4. Keylox membaca pack dari `assets/packs/` dan menampilkan di panel Effect.