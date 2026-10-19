# Keylox Backend Proxy

Backend proxy untuk Google Gemini API (Keylox desktop). Menyediakan endpoint AI, queue job async, cache ber-hash, rate limit per device, dan logging.

## Menjalankan

```bash
cd backend
cp .env.example .env
# isi GEMINI_API_KEY (opsional untuk dev: MOCK_AI=true)
npm install
npm run dev
```

Server default di `http://localhost:8787`.

## Environment Variables

- `PORT` (default 8787)
- `HOST` (default 0.0.0.0)
- `GEMINI_API_KEY` (wajib untuk AI nyata; jangan hardcode)
- `GEMINI_MODEL` (default gemini-2.5-flash)
- `GEMINI_MODEL_VERSION`
- `JWT_SECRET`
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `DAILY_QUOTA`
- `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`
- `REDIS_URL` (opsional, belum dipakai MVP)
- `MOCK_AI=true` untuk dev tanpa key

## Endpoint

Lihat `docs/superapp/api-contract.md` §3. Semua diawali `/v1`? Catatan: implementasi ini menggunakan path tanpa prefix `/v1` (mis. `/ai/parse-command`). Base URL dapat disesuaikan. Endpoint:
`/health`, `/auth/token`, `/ai/parse-command`, `/ai/chat`, `/ai/refine`, `/ai/jobs`, `/ai/jobs/:jobId`, `/ai/transcribe`, `/ai/scene-detect`, `/ai/highlight`, `/ai/ocr`, `/ai/metadata`, `/ai/thumbnail`, `/ai/vision-color`, `/ai/qa`, `/ai/script`, `/ai/translate`, `/ai/tts`, `/ai/moderation`, `/ai/usage`.

## Auth

Kirim header `X-Device-Id: <uuid>`. Opsional `Authorization: Bearer <jwt>` (ambil via `/auth/token`).

## Error Shape

`{code,message,details,retryable,httpStatus,timestamp,requestId}`.