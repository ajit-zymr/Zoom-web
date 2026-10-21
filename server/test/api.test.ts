import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config.js";
import { ensureIndexes } from "../src/db.js";

type ErrorBody = { error: { code: string; message: string } };
type MeetingBody = {
  meeting: { id: string; title: string; hostDisplayName: string; createdAt: string };
  joinPath?: string;
};
type JoinBody = MeetingBody & {
  participant: { id: string; displayName: string };
  token: string;
  serverUrl: string;
};

let baseUrl = "";

describe("meetings API", { timeout: 120_000, concurrency: 1 }, () => {
  let memory: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let server: Server;
  const livekit = {
    url: "ws://127.0.0.1:7880",
    apiKey: "testkey",
    apiSecret: "test-secret-not-for-frontend-use",
  };

  before(async () => {
    memory = await MongoMemoryServer.create();
    client = new MongoClient(memory.getUri());
    await client.connect();
    db = client.db("atrium-test");
    await ensureIndexes(db);
    const app = createApp(db, configured(true));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    server.close();
    await client.close();
    await memory.stop();
  });

  test("reports LiveKit as ready without returning credentials", async () => {
    const body = await request<{ ok: boolean; livekit: string }>("/api/health");
    assert.equal(body.ok, true);
    assert.equal(body.livekit, "ready");
    assert.equal(JSON.stringify(body).includes(livekit.apiSecret), false);
    assert.equal(JSON.stringify(body).includes(livekit.apiKey), false);
  });

  test("creates a meeting and returns a shareable path", async () => {
    const response = await fetch(`${baseUrl}/api/meetings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "  Ada  ", title: " Design review " }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as MeetingBody;
    assert.equal(body.meeting.hostDisplayName, "Ada");
    assert.equal(body.meeting.title, "Design review");
    assert.equal(body.joinPath, `/m/${body.meeting.id}`);

    const loaded = await request<MeetingBody>(`/api/meetings/${body.meeting.id}`);
    assert.equal(loaded.meeting.title, "Design review");
    assert.equal(await db.collection("users").countDocuments({ displayName: "Ada" }), 1);
  });

  test("rejects a missing display name", async () => {
    const response = await fetch(`${baseUrl}/api/meetings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "   " }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as ErrorBody;
    assert.equal(body.error.code, "validation_error");
  });

  test("returns 404 for an unknown meeting", async () => {
    const response = await fetch(`${baseUrl}/api/meetings/abcdefgh23`);
    assert.equal(response.status, 404);
  });

  test("does not issue a token when LiveKit is not configured", async () => {
    const meeting = await request<MeetingBody>("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ displayName: "Grace" }),
    });
    const blocked = createApp(db, configured(false));
    const blockedServer = blocked.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => blockedServer.once("listening", () => resolve()));
    const address = blockedServer.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/meetings/${meeting.meeting.id}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Grace" }),
      });
      assert.equal(response.status, 503);
      const body = (await response.json()) as ErrorBody & { token?: string };
      assert.equal(body.error.code, "media_not_configured");
      assert.equal(body.token, undefined);
      assert.equal(await db.collection("users").countDocuments({ displayName: "Grace" }), 1);
    } finally {
      blockedServer.close();
    }
  });

  test("issues a room-scoped LiveKit token for an existing meeting", async () => {
    const meeting = await request<MeetingBody>("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ displayName: "Lin" }),
    });
    const response = await fetch(`${baseUrl}/api/meetings/${meeting.meeting.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Lin" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as JoinBody;
    assert.equal(body.serverUrl, livekit.url);
    assert.equal(body.token.includes(livekit.apiSecret), false);

    const grants = await new TokenVerifier(livekit.apiKey, livekit.apiSecret).verify(body.token);
    assert.equal(grants.sub, body.participant.id);
    assert.equal(grants.name, "Lin");
    assert.equal(grants.video?.room, meeting.meeting.id);
    assert.equal(grants.video?.roomJoin, true);
    assert.equal(grants.video?.canPublish, true);
    assert.equal(grants.video?.canSubscribe, true);
  });
});

function configured(ready: boolean): AppConfig {
  const env = {
    PORT: "3001",
    MONGODB_URI: "mongodb://127.0.0.1:27017/unused",
    CLIENT_ORIGIN: "http://localhost:5173",
    LIVEKIT_URL: ready ? "ws://127.0.0.1:7880" : "",
    LIVEKIT_API_KEY: ready ? "testkey" : "",
    LIVEKIT_API_SECRET: ready ? "test-secret-not-for-frontend-use" : "",
  };
  return loadConfig(env);
}

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  assert.equal(response.ok, true, `${pathname} returned ${response.status}`);
  return (await response.json()) as T;
}
