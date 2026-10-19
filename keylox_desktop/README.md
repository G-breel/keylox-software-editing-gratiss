# Keylox Desktop — AI Video Editor (.exe)

Desktop video editor (Electron) seperti CapCut, dengan AI control via Gemini.

## Fitur
- Media library (files + folder import)
- Preview player
- Basic: trim, speed, volume, mute
- Transform: rotate, flip, crop, scale, reverse
- Filter: brightness/contrast/saturation/hue/blur/sharpen, B&W, sepia, vivid, chroma key
- Text overlay (multi, timing, size, color, posisi)
- Audio: fade in/out, remove, mute
- AI command box (rule-based + Gemini natural language)
- Export MP4/WebM/MOV (native FFmpeg) dengan progress bar
- Settings: Gemini API key

## Setup & Run (dev)
```bash
cd keylox_desktop
npm install
npm start
```

## Build .exe
```bash
npm run icons     # generate assets/icon.ico + icon.png (sekali saja; ikut otomatis via prebuild)
npm run build     # secret-scan -> vite build (dist/renderer) -> electron-builder --win
```
Output: `release/Keylox-1.0.0-win-x64.exe` (NSIS installer) + `release/Keylox-1.0.0-win-x64-portable.exe`.

> Catatan Stage 9: keluaran installer dipisahkan ke `release/` agar **tidak bentrok**
> dengan bundle renderer Vite di `dist/renderer` (bundle renderer wajib ikut masuk
> ke dalam paket aplikasi; folder keluaran electron-builder tidak ikut dipaketkan).
> Smoke test paket tanpa installer: `npm run pack` (menghasilkan `release/win-unpacked/`).

## Struktur
- `main.js` — Electron main process, IPC (file system, FFmpeg probe/export/thumbnail)
- `preload.js` — contextBridge API
- `index.html` — UI + renderer logic (reuses web editor, native FFmpeg, Gemini AI)

## AI (Gemini)
1. Klik ⚙ Settings → masukkan Gemini API key (dari aistudio.google.com)
2. Di tab AI: ketik perintah natural language → klik "🤖 Tanya Gemini" → AI parse → apply otomatis
3. Atau ketik perintah rule-based (trim/speed/filter/dll.) → "Jalankan"

## Catatan
- FFmpeg binary dibundel via `@ffmpeg-installer/ffmpeg` (auto-download saat npm install)
- Native FFmpeg jauh lebih cepat dari ffmpeg.wasm (web version)
- Untuk fitur lanjutan (tracking, MediaPipe, keyframe, 17 shader effects), lihat project Android skeleton (`android_video_editor/`) dan spec pipeline (`keylox/docs/superapp/00-spec.md`)

## Roadmap
- [ ] Tracking (MediaPipe desktop bindings)
- [ ] 17 shader effects (WebGL/OpenGL)
- [ ] Keyframe animation
- [ ] Multi-clip timeline
- [ ] Subtitle/caption burn-in
- [ ] Template system
- [ ] Auto-cut / auto-subtitle (Gemini video understanding)