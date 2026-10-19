'use strict';

const config = require('../config');
const cache = require('../services/cache');
const queue = require('../services/queue');
const gemini = require('../services/gemini');
const editPlanGate = require('../services/editPlanGate');

async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    const gate = editPlanGate.gateStatus();
    return reply.send({
      ok: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        geminiConfigured: Boolean(config.geminiApiKey),
        mockAi: config.mockAi,
        cache: cache.stats(),
        queue: queue.stats(),
        // Status BYOK & gerbang validasi output AI (tanpa nilai rahasia / path berkas).
        byok: {
          requireUserKey: config.byokRequireUserKey,
          userKeyAccepted: true,
          envFallbackAllowed: !config.byokRequireUserKey && !config.isProduction,
        },
        editPlanGate: { available: gate.available, reason: gate.reason },
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = healthRoutes;