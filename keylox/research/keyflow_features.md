# Keyflow — Fitur yang Di-ekstrak dari APK (bukti reverse engineering)

Sumber: `com.angkin.keyflow` v1.3.2 (xapk), decompile via apktool 2.10.0.
Catatan: app di-obfuscate (logic di `defpackage`), jadi fitur diambil dari string & asset yang terbaca.

## Bukti teknis
| Artefak | Isi |
|---|---|
| `assets/roto/magic_touch.tflite` (6.2MB) | Model segmentasi (background removal / smart select) |
| `assets/thumbnails/sample_*.jpg|png` | Sample untuk color/key (color grading) |
| MediaPipe (`com.google.mediapipe.tasks`) | FaceLandmarker, HandLandmarker, PoseLandmarker, ImageSegmenter, InteractiveSegmenter, GestureRecognizer, ImageClassifier, ObjectDetector, ImageEmbedder, TextClassifier/Embedder |
| `a63.smali` | Daftar effect: `chroma_key, particular, curves, levels, color_balance_hls, lens_blur, glow, turbulent_displace, chromatic_aberration, twitch, fractal_noise, light_sweep, audio_spectrum, four_color_gradient, halftone, find_edges, radial_wipe` |
| `a61.smali` | Keyframes: "Copy selected keyframes", "Delete selected keyframes", "Paste keyframes", "1 keyframe" |
| `am1.smali` | GLSL shader (fractal/noise/effect uniforms) — shader-based effects |
| strings | `Speed`, `Reverse`, `sharpen`, `vignette`, `Crop`, `Rotate`, `Mask`, `Blend`, `Overlay`, `Text`, `Audio`, `Caption`, `Tracking`, `Glow`, `Effect` |

## Daftar fitur (indikatif, akan difinalkan di spec)
### Timeline & edit dasar
- Multi-track timeline, trim, split, cut, delete, duplicate
- Speed (variable, 0.25–4x), reverse, freeze frame
- Keyframe animation (property animation: posisi, scale, rotasi, opacity, dsb.)

### Visual
- Crop, rotate, flip, scale/position
- Filter/adjust: brightness, contrast, saturation, hue, sharpen, vignette, curves, levels, color balance HLS
- LUT / color grading (sample_color)
- Effects (shader): glow, lens blur, chromatic aberration, light sweep, fractal noise, turbulent displace, halftone, find edges, twitch, audio spectrum, four color gradient, radial wipe, particular
- Chroma key (green screen)
- Blend mode & overlay layers (picture-in-picture)
- Mask

### AI / MediaPipe
- Background removal / cutout (magic_touch.tflite, ImageSegmenter, InteractiveSegmenter)
- Face/Hand/Pose tracking → sticker/effect attachment
- Gesture recognition
- Beauty / smooth / face retouch (fungsi MediaPipe face)
- Object detection, image classification, embedding

### Text & Caption
- Text overlay (font, size, color, posisi, animasi)
- Caption / subtitle
- Tracking text

### Audio
- Volume, fade in/out, mute
- Audio spectrum (visualizer)
- Replace/merge audio, music library
- (kemungkinan) voiceover / TTS / dubbing

### Export
- Resolution, bitrate, fps, format
- Watermark (AdMob terkait → versi free ada watermark)

### Lain
- Keyframe copy/paste
- Overlay/pip
- Template (kemungkinan)

## Batasan
- Logic inti obfuscated → detail UI/flow harus diinfer.
- Model `magic_touch.tflite` proprietary → Keylox harus pakai model sendiri (mis. MediaPipe selfie segmentation / SAM / U2Net open-source).
