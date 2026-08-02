# Airbridge relay

A ~150 line WebSocket server whose only job is to forward bytes between two devices
that cannot see each other on a local network.

It stores nothing. There is no database, no filesystem write, no account system. A
"room" is just a pairing code held in memory, and it disappears the instant the last
device disconnects. If this server restarts, nothing is lost except in-flight
transfers, which the app will simply report as failed.

## Running it locally

```
cd relay
npm install
npm start
```

It listens on port 8080. `GET /health` returns room and peer counts, which is handy
for checking that a deployment is actually alive.

## Deploying free

Any host that runs a Node process and supports WebSockets will do. On Render:
create a new **Web Service**, point it at this repo, set the root directory to
`relay`, build command `npm install`, start command `node server.js`. Render sets
`PORT` automatically. Fly.io and Railway work the same way, or use the included
`Dockerfile`.

Once deployed you get a URL like `https://airbridge-relay.onrender.com`. In the app,
Settings → Internet relay → paste that URL. The app converts it to `wss://` itself.

Note on free tiers: most of them sleep an idle service after ~15 minutes, so the
first connection after a quiet period can take 30-60 seconds to wake up. The app
treats that as a slow connect rather than a failure.

## Protocol

Control messages are JSON; payload frames are raw binary and are forwarded
byte-for-byte without inspection.

| Message | Direction | Meaning |
|---|---|---|
| `{type:'join', room, deviceId, deviceName}` | client → server | Enter a pairing code |
| `{type:'joined', room, id}` | server → client | Join accepted |
| `{type:'roster', peers:[{id,name}]}` | server → client | Who else is here |
| `{type:'peer-joined' / 'peer-left', id, name}` | server → client | Membership change |
| `{type:'error', code, message}` | server → client | `bad-room`, `room-full`, `not-joined` |
| anything else | client → server | Forwarded verbatim to other peers, with `from` added |

Rooms are capped at 4 peers. Dead sockets are pruned by a 30 second ping/pong
heartbeat so a phone that loses signal does not hold a pairing code hostage.
