# Atrium

Original browser meetings. Participants join with a display name. MongoDB stores users and meeting metadata. LiveKit carries audio and video after the server issues a short-lived access token.

The React app never receives the LiveKit API key or secret. A video call is connected only when the browser reaches a configured LiveKit server. Until then, the meeting page says that no call is in progress.

## Setup

Requirements:

- Node.js 22 or newer
- MongoDB 7, local or in Docker
- A LiveKit server when you want to test audio and video

```bash
npm install
docker compose up -d
cp .env.example .env
```

Edit `.env` after you have a LiveKit server. Leave the LiveKit values empty if you only want to create and share meeting links.

### LiveKit

The official local server uses development credentials. From [Running LiveKit locally](https://docs.livekit.io/transport/self-hosting/local/):

```bash
curl -sSL https://get.livekit.io | bash
livekit-server --dev
```

That process publishes this development pair:

```text
API key: devkey
API secret: secret
```

Put the same values in `.env`:

```text
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

`devkey` and `secret` are LiveKit's published local defaults, not production credentials. For any shared or deployed server, create your own key pair and keep it in the server environment only.

An equivalent Docker process is:

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
