import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseMeetingId } from "../../shared/meetingId.js";

const id = "abcdefgh23";

describe("parseMeetingId", () => {
  test("accepts a bare meeting id", () => {
    assert.equal(parseMeetingId(`  ${id}  `), id);
  });

  test("accepts a shareable meeting link", () => {
    assert.equal(parseMeetingId(`http://localhost:5173/m/${id}`), id);
    assert.equal(parseMeetingId(`https://meet.example.com/m/${id}/`), id);
    assert.equal(parseMeetingId(`http://localhost:5173/m/${id}?guest=1`), id);
  });

  test("rejects other text", () => {
    assert.equal(parseMeetingId("abc"), null);
    assert.equal(parseMeetingId(`http://localhost:5173/room/${id}`), null);
    assert.equal(parseMeetingId("not a url"), null);
    assert.equal(parseMeetingId("ABCDEFGH23"), null);
  });
});
