'use strict';

// Unit tests: Zod validation of the AI EditPlan contract (api-contract §3.3).
// Runner: `node --test "tests/backend/*.test.js"`  (no server needed)
//
// These lock the contract shape. AC-8 ("100% respons berupa EditPlan tervalidasi
// skema") is only meaningful if the schema is actually strict, so every
// documented constraint gets a negative case.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OP_TYPES,
  editPlanSchema,
  aiParseResultSchema,
} = require('./helpers/editPlanContract');

function validPlan(over = {}) {
  return {
    planId: 'plan-1',
    commandId: 'cmd-1',
    planVersion: 1,
    isDestructive: false,
    requiresConfirm: false,
    diffSummary: 'Trim 5 detik lalu tambah glow',
    ops: [
      {
        opId: 'op-1',
        opType: 'trim',
        target: { type: 'clip', id: 'clip-1' },
        params: { inMs: 0, outMs: 5000 },
        timeRange: { startMs: 0, endMs: 5000 },
        order: 1,
      },
    ],
    ...over,
  };
}

test('OP_TYPES has no duplicates and covers the tracking group (M14)', () => {
  assert.equal(new Set(OP_TYPES).size, OP_TYPES.length, 'opType enum must not contain duplicates');
  const tracking = [
    'trackingStart', 'trackingBind', 'trackingCorrect', 'trackingSmooth',
    'trackingOffset', 'trackingTrim', 'trackingReanalyze',
    'reframeFromTracking', 'stabilizeFromTracking',
  ];
  for (const opType of tracking) {
    assert.ok(OP_TYPES.includes(opType), `missing tracking opType: ${opType}`);
  }
});

test('OP_TYPES covers a representative op from every contract group', () => {
  const required = ['trim', 'crop', 'colorGrade', 'effectAdd', 'maskAdd', 'textAdd', 'audioVolume', 'exportPreset', 'sceneDetect', 'undo', 'applyPlan'];
  for (const opType of required) {
    assert.ok(OP_TYPES.includes(opType), `missing opType: ${opType}`);
  }
});

test('accepts a well-formed EditPlan', () => {
  const parsed = editPlanSchema.safeParse(validPlan());
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
});

test('accepts a zero-op plan (preview / no-op plan)', () => {
  assert.equal(editPlanSchema.safeParse(validPlan({ ops: [] })).success, true);
});

test('rejects a plan missing planId', () => {
  const p = validPlan();
  delete p.planId;
  assert.equal(editPlanSchema.safeParse(p).success, false);
});

test('rejects an unknown opType', () => {
  const p = validPlan();
  p.ops[0].opType = 'makeItViral';
  assert.equal(editPlanSchema.safeParse(p).success, false);
});

test('rejects an unknown target type (no "person" target — privacy §13)', () => {
  const p = validPlan();
  p.ops[0].target.type = 'person';
  assert.equal(editPlanSchema.safeParse(p).success, false);
});

test('enforces diffSummary <= 200 chars (boundary)', () => {
  assert.equal(editPlanSchema.safeParse(validPlan({ diffSummary: 'x'.repeat(200) })).success, true);
  assert.equal(editPlanSchema.safeParse(validPlan({ diffSummary: 'x'.repeat(201) })).success, false);
});

test('rejects non-positive planVersion', () => {
  assert.equal(editPlanSchema.safeParse(validPlan({ planVersion: 0 })).success, false);
});

function validParseResult(over = {}) {
  return {
    commandId: 'cmd-1',
    intent: 'timeline_trim',
    commandRef: 15,
    operationClass: 'D',
    confidence: 0.91,
    needsClarification: false,
    clarificationQuestion: null,
    options: null,
    editPlan: validPlan(),
    tokensUsed: { input: 1200, output: 450 },
    cacheHit: false,
    latencyMs: 1800,
    ...over,
  };
}

test('accepts a well-formed /ai/parse-command payload', () => {
  assert.equal(aiParseResultSchema.safeParse(validParseResult()).success, true);
});

test('accepts commandRef = null (intent not mapped to a canonical command yet)', () => {
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ commandRef: null })).success, true);
});

test('enforces commandRef within 1..251 (boundary)', () => {
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ commandRef: 1 })).success, true);
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ commandRef: 251 })).success, true);
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ commandRef: 0 })).success, false);
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ commandRef: 252 })).success, false);
});

test('enforces confidence within 0..1 (boundary)', () => {
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ confidence: 0 })).success, true);
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ confidence: 1 })).success, true);
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ confidence: 1.5 })).success, false);
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ confidence: -0.1 })).success, false);
});

test('rejects an invalid operationClass (must be "D" or "N")', () => {
  assert.equal(aiParseResultSchema.safeParse(validParseResult({ operationClass: 'X' })).success, false);
});

test('accepts clarification payload with 2-4 options', () => {
  const withOptions = validParseResult({
    confidence: 0.4,
    needsClarification: true,
    clarificationQuestion: 'Maksudnya klip yang mana?',
    options: [
      { label: 'Klip ke-3', plan: { ops: [] } },
      { label: 'Semua klip', plan: { ops: [] } },
    ],
  });
  assert.equal(aiParseResultSchema.safeParse(withOptions).success, true);
});
