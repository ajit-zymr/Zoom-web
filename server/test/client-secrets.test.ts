import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const forbidden = ["LIVEKIT_API_SECRET", "LIVEKIT_API_KEY", "VITE_LIVEKIT"];

describe("client secrets", () => {
  test("frontend source does not name LiveKit API credentials", async () => {
    const files = [
      ...(await sourceFiles(path.join(root, "client", "src"))),
      path.join(root, "client", "index.html"),
      ...(await sourceFiles(path.join(root, "shared"))),
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const secretName of forbidden) {
        assert.equal(
          source.includes(secretName),
          false,
          `${path.relative(root, file)} contains ${secretName}`,
        );
      }
    }
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(fullPath)));
    } else if (/\.(tsx?|css|html)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}
