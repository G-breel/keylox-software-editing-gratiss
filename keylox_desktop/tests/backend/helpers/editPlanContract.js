'use strict';

// Test-owned Zod schemas for the AI EditPlan contract.
// Source of truth: keylox/docs/superapp/api-contract.md §3.3.
//
// Lives under tests/ on purpose: it is the QA-side encoding of the contract and
// must not collide with the backend's own src/utils/validate.js (input schemas).
// `zod` is resolved from the backend's node_modules (the app's declared dep).

const path = require('node:path');

const BACKEND_DIR = path.join(__dirname, '..', '..', '..', 'backend');
const { z } = require(require.resolve('zod', { paths: [BACKEND_DIR] }));

// §3.3 "Daftar opType (kanonik)" — reproduced verbatim and grouped like the doc.
const OP_TYPES = [
  // Struktur
  'trim', 'split', 'delete', 'duplicate', 'reorder', 'gapClose', 'detachAudio', 'group', 'speed', 'reverse', 'freeze',
  // Transform
  'canvasRatio', 'crop', 'rotate', 'flip', 'scalePosition', 'reframe', 'stabilize',
  // Warna
  'colorAdjust', 'colorGrade', 'lutApply', 'whiteBalance', 'curves', 'levels', 'colorBalance', 'vignette', 'sharpen', 'autoColorGrade', 'visionColorMatch',
  // Efek
  'effectAdd', 'effectRemove', 'effectParam', 'effectStack', 'transitionSet', 'animationPreset', 'motionPreset',
  // Compositing
  'overlayAdd', 'blendMode', 'maskAdd', 'maskParam', 'chromaKey', 'cutout', 'backgroundReplace',
  // Tracking (M14)
  'trackingStart', 'trackingBind', 'trackingUnbind', 'trackingCorrect', 'trackingSmooth', 'trackingOffset', 'trackingTrim', 'trackingReanalyze', 'reframeFromTracking', 'stabilizeFromTracking',
  // Teks
  'textAdd', 'textStyle', 'textTiming', 'textAnimation', 'captionGenerate', 'captionStyle', 'ocrToCaption', 'trackingText',
  // Audio
  'audioVolume', 'audioFade', 'audioMute', 'audioReplace', 'audioMix', 'musicAdd', 'ducking', 'denoise', 'eq', 'voiceover', 'tts', 'silenceRemove',
  // Export
  'exportPreset', 'exportSettings',
  // Pemahaman
  'sceneDetect', 'highlight', 'momentSearch', 'autoCut', 'autoPick', 'autoGroup', 'indexAsset',
  // Kontrol
  'undo', 'redo', 'play', 'applyPlan', 'rejectPlan',
];

const OP_TARGET_TYPES = ['clip', 'track', 'project', 'asset', 'text', 'effect'];

const opTargetSchema = z.object({
  type: z.enum(OP_TARGET_TYPES),
  id: z.string().min(1),
});

const editPlanOpSchema = z.object({
  opId: z.string().min(1),
  opType: z.enum(OP_TYPES),
  target: opTargetSchema,
  params: z.record(z.any()),
  timeRange: z.object({ startMs: z.number(), endMs: z.number() }).nullable().optional(),
  order: z.number(),
});

const editPlanSchema = z.object({
  planId: z.string().min(1),
  commandId: z.string().min(1),
  planVersion: z.number().int().positive(),
  isDestructive: z.boolean(),
  requiresConfirm: z.boolean(),
  diffSummary: z.string().max(200), // contract: "<= 200 char"
  ops: z.array(editPlanOpSchema),
});

const aiParseResultSchema = z.object({
  commandId: z.string().min(1),
  intent: z.string(),
  commandRef: z.number().int().min(1).max(251).nullable(),
  operationClass: z.enum(['D', 'N']),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  options: z.array(z.object({ label: z.string(), plan: z.any() })).nullable(),
  editPlan: editPlanSchema,
  tokensUsed: z.object({ input: z.number(), output: z.number() }),
  cacheHit: z.boolean(),
  latencyMs: z.number(),
});

const envelopeSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().min(1),
  timestamp: z.string().min(1),
});

const errorShapeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  httpStatus: z.number(),
  timestamp: z.string().min(1),
});

module.exports = {
  OP_TYPES,
  OP_TARGET_TYPES,
  opTargetSchema,
  editPlanOpSchema,
  editPlanSchema,
  aiParseResultSchema,
  envelopeSchema,
  errorShapeSchema,
};
