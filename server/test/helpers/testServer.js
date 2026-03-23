'use strict';

/**
 * Minimal Express + Socket.io test server.
 *
 * Accepts an injected better-sqlite3 DB so tests stay hermetic.
 * Only registers the socket handlers relevant to testing — the same
 * logic as production server.js, referencing the injected DB instead
 * of the global singleton.
 *
 * Usage:
 *   const { createTestDb, insertCharacter } = require('./testDb');
 *   const { createTestServer }              = require('./testServer');
 *
 *   const db     = createTestDb();
 *   const server = await createTestServer(db);
 *   // ... connect clients, fire events, assert ...
 *   await server.close();
 */

const http = require('http');
const express = require('express');
const { Server: SocketServer } = require('socket.io');
const { io: SocketClient } = require('socket.io-client');

const {
  applyDamageEvent,
  applyHealEvent,
  applyConditionEvent,
  removeConditionEvent,
  applyBuffEvent,
  getSessionState,
  getResolvedCharacterState,
} = require('../../lib/rulesIntegration');

const {
  applyPartyEffect,
  getCombatTimeline,
} = require('../../lib/effectEngine');

/**
 * Create and start the test server.
 *
 * @param {import('better-sqlite3').Database} db - In-memory test database
 * @returns {Promise<{
 *   port: number,
 *   io: import('socket.io').Server,
 *   close: () => Promise<void>,
 *   connect: () => import('socket.io-client').Socket
 * }>}
 */
function createTestServer(db) {
  return new Promise((resolve, reject) => {
    const app = express();
    const httpServer = http.createServer(app);
    const io = new SocketServer(httpServer, {
      cors: { origin: '*' },
      // Use polling in tests — avoids WebSocket upgrade latency
      transports: ['polling'],
    });

    // Shared combat state (mirrors production server globals)
    let currentCombatRound = 0;
    let currentTurnIndex = 0;

    function broadcastPartyState() {
      const chars = db.prepare('SELECT id FROM characters').all();
      const state = chars.map(c => getResolvedCharacterState(db, c.id)).filter(Boolean);
      io.emit('party_state', state);
    }

    function broadcastTimeline() {
      io.emit('timeline_update', getCombatTimeline(db));
    }

    io.on('connection', (socket) => {

      // ── HP events ─────────────────────────────────────────────────────────
      socket.on('update_hp', ({ characterId, delta, damageType }) => {
        const result = delta < 0
          ? applyDamageEvent(db, characterId, Math.abs(delta), damageType || 'untyped')
          : applyHealEvent(db, characterId, delta);

        if (result?.success) {
          broadcastPartyState();
          broadcastTimeline();
        }
        socket.emit('update_hp_result', result);
      });

      // ── Conditions ────────────────────────────────────────────────────────
      socket.on('apply_condition', ({ characterId, condition }) => {
        const result = applyConditionEvent(db, characterId, condition);
        if (result.success) broadcastPartyState();
        socket.emit('apply_condition_result', result);
      });

      socket.on('remove_condition', ({ characterId, condition }) => {
        const result = removeConditionEvent(db, characterId, condition);
        if (result.success) broadcastPartyState();
        socket.emit('remove_condition_result', result);
      });

      // ── Buffs ─────────────────────────────────────────────────────────────
      socket.on('apply_buff', ({ characterId, buffData }) => {
        const result = applyBuffEvent(db, characterId, buffData);
        if (result.success) broadcastPartyState();
        socket.emit('apply_buff_result', result);
      });

      // ── Multi-target party effects ─────────────────────────────────────────
      socket.on('apply_party_effect', ({ effects, targets }) => {
        const results = applyPartyEffect(
          db, effects, targets || 'party',
          'TestDM', currentCombatRound, currentTurnIndex, 'action', null
        );
        broadcastPartyState();
        broadcastTimeline();
        socket.emit('apply_party_effect_result', results);
      });

      // ── State query ───────────────────────────────────────────────────────
      socket.on('get_session_state', ({ characterId }) => {
        socket.emit('session_state', getSessionState(db, characterId));
      });

      socket.on('get_party_state', () => {
        const chars = db.prepare('SELECT id FROM characters').all();
        const state = chars.map(c => getResolvedCharacterState(db, c.id)).filter(Boolean);
        socket.emit('party_state', state);
      });
    });

    httpServer.listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address();

      /**
       * Creates a new connected Socket.io client for this server.
       * The caller is responsible for disconnecting it when done.
       */
      function connect() {
        return SocketClient(`http://127.0.0.1:${port}`, {
          transports: ['polling'],
          forceNew: true,
        });
      }

      /**
       * Close the server and forcibly disconnect all sockets.
       */
      function close() {
        return new Promise((res) => {
          io.close(() => httpServer.close(res));
        });
      }

      resolve({ port, io, close, connect });
    });

    httpServer.once('error', reject);
  });
}

/**
 * Convenience: emit an event and wait for a specific response event.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {string} emitEvent
 * @param {object} payload
 * @param {string} replyEvent
 * @param {number} [timeoutMs=3000]
 */
function emitAndWait(socket, emitEvent, payload, replyEvent, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${replyEvent}"`)), timeoutMs);
    socket.once(replyEvent, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.emit(emitEvent, payload);
  });
}

/**
 * Convenience: wait for a broadcast event (not a direct reply).
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {string} event
 * @param {number} [timeoutMs=3000]
 */
function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

module.exports = { createTestServer, emitAndWait, waitFor };
