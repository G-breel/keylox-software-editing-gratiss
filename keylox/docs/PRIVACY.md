# Privasi — Keylox Desktop (ADR-05)

Keylox dirancang privasi-by-design.

## Prinsip
- **Key milik Anda.** API key disimpan terenkripsi di perangkat (Electron safeStorage). Keylox server tidak pernah menerima key Anda.
- **Konten tidak ditulis ke disk backend.** Prompt/respons AI tidak disimpan.
- **Tracking on-device.** Deteksi wajah/objek berjalan lokal (MediaPipe), frame tidak dikirim ke mana pun.

## Mode privasi
- **local-only**: blokir semua panggilan cloud; hanya model lokal (Ollama/LM Studio) yang bisa dipakai.
- **standard**: izinkan cloud dengan konfirmasi.
- **cloud**: izinkan cloud tanpa konfirmasi berulang.

## Konfirmasi kirim konten
Sebelum mengirim konten (klip/gambar/audio) ke provider cloud, Anda diminta konfirmasi (sekali/sesi/selalu).

## Hapus & ekspor data
- Settings → Data: hapus cache/usage, atau ekspor preferensi + ringkasan usage ke JSON.
- API key tidak pernah ikut diekspor (hanya status/mask).