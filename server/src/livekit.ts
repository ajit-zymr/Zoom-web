import { AccessToken } from "livekit-server-sdk";
import type { LiveKitConfig } from "./config.js";

type ReadyLiveKit = Extract<LiveKitConfig, { state: "ready" }>;

export async function createParticipantToken(
  livekit: ReadyLiveKit,
  input: { identity: string; displayName: string; roomName: string },
): Promise<string> {
  const token = new AccessToken(livekit.apiKey, livekit.apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl: "2h",
  });
  token.addGrant({
    room: input.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return token.toJwt();
}
