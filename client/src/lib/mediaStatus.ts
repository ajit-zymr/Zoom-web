import type { LiveKitReadiness } from "../api";

export function mediaStatusCopy(livekit: LiveKitReadiness | "offline"): string {
  if (livekit === "offline") {
    return "The meeting server is not running.";
  }
  if (livekit === "ready") {
    return "LiveKit credentials are configured. A video call starts only after this browser connects to the media server.";
  }
  if (livekit === "incomplete") {
    return "LiveKit is only partly configured on the server. Meeting links can be created, and video calls stay unavailable.";
  }
  if (livekit === "invalid_url") {
    return "The server's LiveKit address is invalid. Meeting links can be created, and video calls stay unavailable.";
  }
  return "LiveKit is not configured on the server. Meeting links can be created, and video calls stay unavailable.";
}
