# Atrium

Original browser meetings. Participants join with a display name. MongoDB stores users and meeting metadata. LiveKit carries audio and video after the server issues a short-lived access token.

The React app never receives the LiveKit API key or secret. A video call is connected only when the browser reaches a configured LiveKit server. Until then, the meeting page says that no call is in progress.

## Setup

Requirements:

- Node.js 22 or newer
- Docker for the included MongoDB and LiveKit development services

```bash
npm install
docker compose up -d
cp .env.example .env
```

The included development configuration starts MongoDB and LiveKit with Docker. Open the app at
`http://localhost:5173`; do not use a machine IP over plain HTTP because browsers block camera
and microphone access outside a secure context.

To use a machine IP, create a locally trusted certificate containing that IP at
`certs/dev-key.pem` and `certs/dev-cert.pem`, then set `CLIENT_ORIGIN`, `PUBLIC_APP_ORIGIN`, and
`LIVEKIT_URL` to the matching HTTPS/WSS address. Set `LIVEKIT_NODE_IP` to the machine IP so
LiveKit advertises a reachable media address. Restart Docker Compose and the app after changing
these values.

### LiveKit

Docker Compose starts the official LiveKit server in development mode with its published local
credentials. The API reads the matching `devkey` and `secret` values from `.env.example`.

To run LiveKit manually instead, stop the Compose service and use:

```bash
curl -sSL https://get.livekit.io | bash
livekit-server --dev
```

That process publishes this development pair:

```text
API key: devkey
API secret: secret
```

Keep the same values in `.env`:

```text
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

`devkey` and `secret` are LiveKit's published local defaults, not production credentials. For any shared or deployed server, create your own key pair and keep it in the server environment only.

The equivalent standalone Docker process is:

```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev
```

Restart the API after changing `.env`.

### Run

```bash
npm run dev
```

- App: http://localhost:5173
- API: http://127.0.0.1:3001
- LiveKit: ws://127.0.0.1:7880

The Vite dev server proxies `/api` to the API, so the browser does not need a LiveKit environment variable.

Optional production builds can set `VITE_API_BASE_URL` to a public API origin. That value is not a secret. Do not create a frontend variable for the LiveKit API key or secret.

## Meetings

1. Enter a display name and create a meeting.
2. Copy the link. It looks like `http://localhost:5173/m/<meeting-id>`.
3. Open the link, enter a display name, and choose the microphone and camera.
4. Join. Participant tiles and the microphone, camera, and leave controls appear after LiveKit reports a connection.
5. Leave returns to the start page and disconnects the room.

Anyone with the link can join. This version has no accounts or meeting passwords.

## Checks

```bash
npm test
npm run typecheck
```

`npm test` starts an in-memory MongoDB, creates meetings, and checks that join returns no token until LiveKit is configured. When it is configured, the test verifies the access token with `livekit-server-sdk` and checks that the API secret is not in the token or the health response.
