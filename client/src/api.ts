export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type LiveKitReadiness = "ready" | "missing" | "incomplete" | "invalid_url";

export type Meeting = {
  id: string;
  title: string;
  hostDisplayName: string;
  createdAt: string;
};

export type HealthResponse = {
  ok: boolean;
  livekit: LiveKitReadiness;
  appOrigin?: string;
};

export type JoinSession = {
  meeting: Meeting;
  participant: { id: string; displayName: string };
  token: string;
  serverUrl: string;
};

let shareOrigin = "";

export function meetingLink(meetingId: string): string {
  const origin = shareOrigin || window.location.origin;
  return `${origin}/m/${meetingId}`;
}

export async function getHealth(): Promise<HealthResponse> {
  const health = await request<HealthResponse>("/api/health");
  if (health.appOrigin) {
    shareOrigin = health.appOrigin.replace(/\/$/, "");
  }
  return health;
}

export async function createMeeting(input: { displayName: string; title: string }): Promise<{ meeting: Meeting; joinPath: string; joinUrl?: string }> {
  return request("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      displayName: input.displayName,
      title: input.title.trim(),
    }),
  });
}

export async function getMeeting(meetingId: string): Promise<Meeting> {
  const body = await request<{ meeting: Meeting }>(`/api/meetings/${meetingId}`);
  return body.meeting;
}

export async function joinMeeting(meetingId: string, displayName: string): Promise<JoinSession> {
  return request(`/api/meetings/${meetingId}/join`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("The meeting server is not running.", "network_error", 0);
  }

  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? "The meeting server could not complete that request.",
      body?.error?.code ?? "request_failed",
      response.status,
    );
  }
  return body as T;
}
