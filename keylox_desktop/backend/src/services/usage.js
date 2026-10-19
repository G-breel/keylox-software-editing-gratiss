'use strict';

// In-memory usage tracking per device (MVP). Production: persist to DB.
const usage = new Map(); // deviceId -> { tokensIn, tokensOut, requests, lastReset }

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUsage(deviceId) {
  const rec = usage.get(deviceId) || { date: todayKey(), tokensIn: 0, tokensOut: 0, requests: 0 };
  if (rec.date !== todayKey()) {
    rec.date = todayKey();
    rec.tokensIn = 0;
    rec.tokensOut = 0;
    rec.requests = 0;
  }
  usage.set(deviceId, rec);
  return rec;
}

function record(deviceId, tokensIn = 0, tokensOut = 0) {
  const rec = getUsage(deviceId);
  rec.tokensIn += tokensIn;
  rec.tokensOut += tokensOut;
  rec.requests += 1;
  usage.set(deviceId, rec);
  return rec;
}

/** Hitung percobaan permintaan saja (dipakai untuk kuota/abuse protection). */
function countRequest(key) {
  const rec = getUsage(key);
  rec.requests += 1;
  usage.set(key, rec);
  return rec;
}

/** Catat token saja, tanpa menambah counter request (request sudah dihitung middleware). */
function recordTokens(key, tokensIn = 0, tokensOut = 0) {
  const rec = getUsage(key);
  rec.tokensIn += tokensIn;
  rec.tokensOut += tokensOut;
  usage.set(key, rec);
  return rec;
}

function allUsage() {
  const out = {};
  for (const [k, v] of usage.entries()) out[k] = v;
  return out;
}

module.exports = { getUsage, record, countRequest, recordTokens, allUsage };