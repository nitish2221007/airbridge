'use strict';

/**
 * Airbridge relay.
 *
 * Purpose: let two devices that are NOT on the same Wi-Fi still talk to each other.
 *
 * Design rules this server sticks to:
 *   - No accounts, no database, no disk writes. Nothing is ever stored.
 *   - Payloads are forwarded byte-for-byte and never inspected or buffered to disk.
 *   - A "room" is just a pairing code. Devices that know the same code can talk.
 *   - Rooms are capped and evaporate the moment the last socket leaves.
 *
 * It is deliberately dumb: all the transfer logic (chunking, resume, hashing) lives
 * in the app, so the relay stays small enough to audit in one sitting and cheap
 * enough to run on a free tier.
 */

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PEERS_PER_ROOM = 4;
const HEARTBEAT_MS = 30000;
const MAX_FRAME_BYTES = 16 * 1024 * 1024; // 16 MB — app chunks well below this

/** @type {Map<string, Set<WebSocket>>} */
const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      peers: [...rooms.values()].reduce((n, s) => n + s.size, 0),
      uptime: Math.round(process.uptime()),
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Airbridge relay is running. Connect over WebSocket.\n');
});

const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME_BYTES });

function send(sock, obj) {
  if (sock.readyState === sock.OPEN) {
    sock.send(JSON.stringify(obj));
  }
}

function peersOf(room, except) {
  const set = rooms.get(room);
  if (!set) return [];
  return [...set].filter((s) => s !== except && s.readyState === s.OPEN);
}

function announceRoster(room) {
  const set = rooms.get(room);
  if (!set) return;
  const roster = [...set].map((s) => ({ id: s.deviceId, name: s.deviceName }));
  for (const sock of set) {
    send(sock, {
      type: 'roster',
      peers: roster.filter((p) => p.id !== sock.deviceId),
    });
  }
}

function leaveRoom(sock) {
  const room = sock.room;
  if (!room) return;
  const set = rooms.get(room);
  if (!set) return;
  set.delete(sock);
  if (set.size === 0) {
    rooms.delete(room);
  } else {
    for (const peer of set) {
      send(peer, { type: 'peer-left', id: sock.deviceId, name: sock.deviceName });
    }
    announceRoster(room);
  }
  sock.room = null;
}

wss.on('connection', (sock) => {
  sock.isAlive = true;
  sock.room = null;
  sock.deviceId = null;
  sock.deviceName = 'unknown';

  sock.on('pong', () => { sock.isAlive = true; });

  sock.on('message', (data, isBinary) => {
    // Binary frames are pure payload: forward untouched to everyone else in the room.
    if (isBinary) {
      if (!sock.room) return;
      for (const peer of peersOf(sock.room, sock)) {
        peer.send(data, { binary: true });
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(sock, { type: 'error', message: 'malformed json' });
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code)) {
        send(sock, { type: 'error', code: 'bad-room', message: 'invalid pairing code' });
        return;
      }
      let set = rooms.get(code);
      if (!set) {
        set = new Set();
        rooms.set(code, set);
      }
      if (set.size >= MAX_PEERS_PER_ROOM) {
        send(sock, { type: 'error', code: 'room-full', message: 'pairing code already in use' });
        return;
      }
      leaveRoom(sock);
      sock.room = code;
      sock.deviceId = String(msg.deviceId || crypto.randomUUID()).slice(0, 64);
      sock.deviceName = String(msg.deviceName || 'device').slice(0, 64);
      set.add(sock);

      send(sock, { type: 'joined', room: code, id: sock.deviceId });
      for (const peer of peersOf(code, sock)) {
        send(peer, { type: 'peer-joined', id: sock.deviceId, name: sock.deviceName });
      }
      announceRoster(code);
      return;
    }

    if (msg.type === 'leave') {
      leaveRoom(sock);
      send(sock, { type: 'left' });
      return;
    }

    if (msg.type === 'ping') {
      send(sock, { type: 'pong', t: Date.now() });
      return;
    }

    // Anything else is app-level signalling — relay it verbatim.
    if (!sock.room) {
      send(sock, { type: 'error', code: 'not-joined', message: 'join a room first' });
      return;
    }
    const forwarded = { ...msg, from: sock.deviceId };
    for (const peer of peersOf(sock.room, sock)) {
      send(peer, forwarded);
    }
  });

  sock.on('close', () => leaveRoom(sock));
  sock.on('error', () => leaveRoom(sock));
});

// Drop sockets that stopped responding, so rooms do not fill up with ghosts
// after a phone loses signal or sleeps.
const heartbeat = setInterval(() => {
  for (const sock of wss.clients) {
    if (sock.isAlive === false) {
      leaveRoom(sock);
      sock.terminate();
      continue;
    }
    sock.isAlive = false;
    sock.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Airbridge relay listening on :${PORT}`);
});
