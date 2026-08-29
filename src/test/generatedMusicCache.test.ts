import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { CacheDescriptor, GeneratedMusicCache } from "../providers/generatedMusicCache";

const descriptor: CacheDescriptor = {
  provider: "elevenlabs",
  model: "music_v2",
  style: "lofi",
  durationSeconds: 30,
};

test("generated cache stores one content-free asset per provider, model, style, and duration", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-music-cache-"));
  try {
    const cache = new GeneratedMusicCache(directory, () => 1024 * 1024);
    const bytes = Uint8Array.from([0x49, 0x44, 0x33, ...Array.from({ length: 60 }, () => 0)]);
    const created = await cache.put(descriptor, bytes);
    assert.equal((await cache.get(descriptor))?.key, created.key);
    const index = await fs.readFile(path.join(directory, "generated-music-v1", "index.json"), "utf8");
    assert.doesNotMatch(index, /prompt|intent/i);
    assert.deepEqual(await cache.stats(), { tracks: 1, bytes: bytes.byteLength });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("generated cache reuses a legacy same-style asset created by the earlier intent-aware key", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-music-cache-"));
  const cacheDirectory = path.join(directory, "generated-music-v1");
  try {
    await fs.mkdir(cacheDirectory, { recursive: true });
    const bytes = Uint8Array.from([0x49, 0x44, 0x33, ...Array.from({ length: 30 }, () => 0)]);
    await fs.writeFile(path.join(cacheDirectory, "legacy-jazz.mp3"), bytes);
    await fs.writeFile(path.join(cacheDirectory, "index.json"), JSON.stringify({
      version: 1,
      entries: {
        "legacy-jazz": {
          provider: "elevenlabs", model: "music_v2", style: "jazz", intent: "review", durationSeconds: 30,
          key: "legacy-jazz", byteLength: bytes.byteLength, createdAt: 1, lastAccessedAt: 1,
        },
      },
    }));
    const cache = new GeneratedMusicCache(directory, () => 1024 * 1024);
    const reused = await cache.get({ ...descriptor, style: "jazz" });
    assert.equal(reused?.key, "legacy-jazz");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("generated cache lists, removes, and evicts assets", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-music-cache-"));
  try {
    const cache = new GeneratedMusicCache(directory, () => 90);
    const bytes = Uint8Array.from({ length: 60 }, (_, index) => index);
    const first = await cache.put(descriptor, bytes);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const secondDescriptor = { ...descriptor, style: "ambient" as const };
    const second = await cache.put(secondDescriptor, bytes);
    assert.equal(await cache.get(descriptor), undefined);
    assert.equal((await cache.get(secondDescriptor))?.key, second.key);
    await assert.rejects(fs.stat(first.filePath));
    assert.deepEqual((await cache.list()).map((entry) => entry.key), [second.key]);
    assert.equal(await cache.remove(second.key), true);
    assert.equal(await cache.remove(second.key), false);
    assert.deepEqual(await cache.list(), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
