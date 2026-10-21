export const MEETING_ID_PATTERN = /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;

export function parseMeetingId(input: string): string | null {
  const trimmed = input.trim();
  if (MEETING_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 2 && parts[0] === "m" && MEETING_ID_PATTERN.test(parts[1] ?? "")) {
      return parts[1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}
