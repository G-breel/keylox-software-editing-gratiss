'use strict';

const { z } = require('zod');
const { makeError, ErrorCodes } = require('../errors');

/**
 * Validasi input di trust boundary (RULE 8). Semua payload eksternal harus
 * lolos schema ketat sebelum mencapai business logic.
 * Bentuk respons error tetap sesuai api-contract §5 (ERR_VALIDATION_PAYLOAD).
 */

const MAX_TEXT = 4000;                 // batas teks perintah/chat
const MAX_BASE64 = 32 * 1024 * 1024;   // ~32 MB payload media inline

const shortString = (max) => z.string().min(1).max(max);
const opts = (schema) => schema.optional();
const base64String = z.string().min(1).max(MAX_BASE64);

const ParseCommandSchema = z.object({
  rawText: shortString(MAX_TEXT),
  language: opts(z.string().max(35)),
  inputMode: opts(z.string().max(20)),
  context: opts(z.record(z.string(), z.unknown())),
  mediaRefs: opts(z.array(z.string().max(1024)).max(50)),
}).strict();

const ChatSchema = z.object({
  message: shortString(MAX_TEXT),
  projectId: opts(z.string().max(128)),
  context: opts(z.record(z.string(), z.unknown())),
}).strict();

const RefineSchema = z.object({
  planId: shortString(128),
  feedback: shortString(MAX_TEXT),
  context: opts(z.record(z.string(), z.unknown())),
}).strict();

const JOB_TYPES = [
  'scene_detect', 'asr', 'transcribe', 'highlight', 'ocr', 'metadata', 'thumbnail', 'reframe', 'translate', 'tts',
  'montage', 'search', 'index_asset', 'vision_color', 'script', 'moderation',
];

const JobSchema = z.object({
  jobType: z.enum(JOB_TYPES),
  inputRef: shortString(512),
  params: opts(z.record(z.string(), z.unknown())),
  projectId: opts(z.string().max(128)),
}).strict();

const MediaUploadSchema = z.object({
  media: opts(z.array(z.object({
    data: base64String,
    mimeType: opts(z.string().max(100)),
  })).max(8)),
  referenceImageBase64: opts(base64String),
  referenceImageMime: opts(z.string().max(100)),
  audioBase64: opts(base64String),
  audioMime: opts(z.string().max(100)),
  language: opts(z.string().max(35)),
  wordTimings: opts(z.boolean()),
  threshold: opts(z.union([z.string().max(20), z.number()])),
  targetDurationSec: opts(z.number().nonnegative().max(36000)),
  durationTargetSec: opts(z.number().nonnegative().max(36000)),
  durationSec: opts(z.number().nonnegative().max(36000)),
  prompt: opts(z.string().max(MAX_TEXT)),
  question: opts(z.string().max(MAX_TEXT)),
  topic: opts(z.string().max(MAX_TEXT)),
  text: opts(z.string().max(MAX_TEXT)),
  voice: opts(z.string().max(100)),
  targetLanguage: opts(z.string().max(35)),
  audioRef: opts(z.string().max(1024)),
  referenceImageRef: opts(z.string().max(1024)),
  targetClipId: opts(z.string().max(128)),
}).passthrough(); // endpoint AI sederhana boleh punya field tambahan

/**
 * Validasi payload. Mengembalikan data tervalidasi, atau melempar error
 * 400 ERR_VALIDATION_PAYLOAD (ditangkap handler dan dikirim lewat `fail`).
 */
function parseOrThrow(schema, payload, requestId) {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const fieldErrors = result.error.issues
      .slice(0, 10)
      .map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw makeError(ErrorCodes.VALIDATION_PAYLOAD, 'Payload tidak valid.', {
      httpStatus: 400,
      retryable: false,
      requestId,
      details: { fieldErrors },
    });
  }
  return result.data;
}

module.exports = {
  MAX_TEXT,
  MAX_BASE64,
  JOB_TYPES,
  ParseCommandSchema,
  ChatSchema,
  RefineSchema,
  JobSchema,
  MediaUploadSchema,
  parseOrThrow,
};
