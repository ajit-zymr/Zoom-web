import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const ID_LENGTH = 10;

export function createMeetingId(): string {
  const chars: string[] = [];
  const limit = ALPHABET.length * Math.floor(256 / ALPHABET.length);

  while (chars.length < ID_LENGTH) {
    const bytes = randomBytes(ID_LENGTH);
    for (const byte of bytes) {
      if (byte < limit) {
        chars.push(ALPHABET[byte % ALPHABET.length] ?? "");
        if (chars.length === ID_LENGTH) {
          break;
        }
      }
    }
  }

  return chars.join("");
}
