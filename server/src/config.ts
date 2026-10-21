export type LiveKitState = "ready" | "missing" | "incomplete" | "invalid_url";

export type LiveKitConfig =
  | { state: "ready"; url: string; apiKey: string; apiSecret: string }
  | { state: "missing" }
  | { state: "incomplete" }
  | { state: "invalid_url" };

export type AppConfig = {
  port: number;
  mongodbUri: string;
  clientOrigin: string;
  appOrigin: string;
  livekit: LiveKitConfig;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return {
    port,
    mongodbUri: env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017/atrium",
    clientOrigin: env.CLIENT_ORIGIN?.trim() || "http://localhost:5173",
    appOrigin: (env.PUBLIC_APP_ORIGIN?.trim() || env.CLIENT_ORIGIN?.trim() || "http://localhost:5173").replace(/\/$/, ""),
    livekit: readLiveKit(env),
  };
}

function readLiveKit(env: NodeJS.ProcessEnv): LiveKitConfig {
  const url = env.LIVEKIT_URL?.trim() ?? "";
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? "";
  const provided = [url, apiKey, apiSecret].filter(Boolean);

  if (provided.length === 0) {
    return { state: "missing" };
  }
  if (provided.length < 3) {
    return { state: "incomplete" };
  }
  if (!/^wss?:\/\/.+/i.test(url)) {
    return { state: "invalid_url" };
  }

  return { state: "ready", url, apiKey, apiSecret };
}

export function livekitUnavailableMessage(state: Exclude<LiveKitState, "ready">): string {
  if (state === "incomplete") {
    return "LiveKit is only partly configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET together. No access token was issued.";
  }
  if (state === "invalid_url") {
    return "LIVEKIT_URL must start with ws:// or wss://. No access token was issued.";
  }
  return "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET on the server. No access token was issued.";
}
