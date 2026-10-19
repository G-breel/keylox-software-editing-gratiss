'use strict';

function ok(reply, data, requestId) {
  return reply.send({
    ok: true,
    data,
    requestId: requestId || (reply.request && reply.request.id) || undefined,
    timestamp: new Date().toISOString(),
  });
}

function fail(reply, err, requestId) {
  const rid = requestId || (reply.request && reply.request.id);
  const e = { ...err, requestId: err.requestId || rid, timestamp: err.timestamp || new Date().toISOString() };
  return reply.code(err.httpStatus || 500).send({
    ok: false,
    error: e,
    requestId: rid,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { ok, fail };