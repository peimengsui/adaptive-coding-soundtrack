import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { LocalProceduralMusicProvider } from "../core/localProceduralMusicProvider";
import { MusicRequest } from "../core/types";
import { AdaptiveMusicProvider, ProviderStateStore } from "../providers/adaptiveMusicProvider";
import { GeneratedMusicCache } from "../providers/generatedMusicCache";
import { RemoteMusicClient } from "../providers/types";

const request: MusicRequest = {
  style: "ambient", codingState: "active_coding", intent: "flow", energy: 0.4,
  complexity: 0.4, stability: 0.8, brightness: 0.5, tempoBpm: 64, shouldPlay: true,
};

class MemoryState implements ProviderStateStore {
  private readonly values = new Map<string, unknown>();
  public get<T>(key: string, defaultValue: T): T { return (this.values.get(key) as T | undefined) ?? defaultValue; }
  public async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

function settings(dailyGenerationLimit = 5) {
  return {
    source: "elevenlabs" as const,
    durationSeconds: 30,
    timeoutSeconds: 30,
    dailyGenerationLimit,
    customPromptSuffix: "",
  };
}

test("remote playback is cache-only until generation is explicitly requested", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-music-provider-"));
  let generations = 0;
  const client: RemoteMusicClient = {
    id: "elevenlabs", label: "ElevenLabs", model: "music_v2",
    async generate() {
      generations += 1;
      return { bytes: Uint8Array.from([0x49, 0x44, 0x33, ...Array.from({ length: 40 }, () => 0)]), mimeType: "audio/mpeg" };
    },
    async testConnection() { return "Connected."; },
  };
  try {
    const provider = new AdaptiveMusicProvider(
      new LocalProceduralMusicProvider(), [client], { async get() { return "test-key"; } },
      new GeneratedMusicCache(directory, () => 1024 * 1024), new MemoryState(),
      () => settings(), () => undefined,
    );
    const beforeGeneration = await provider.getTrack(request);
    assert.equal(beforeGeneration.source, "procedural");
    if (beforeGeneration.source === "procedural") assert.equal(beforeGeneration.remoteFallback?.reason, "no_cache");
    assert.equal(generations, 0);

    const generated = await provider.generateTrack(request);
    const adapted = await provider.getTrack({ ...request, codingState: "waiting", intent: "anticipation", energy: 0.9 });
    assert.equal(adapted.source, "generated");
    if (adapted.source === "generated") {
      assert.equal(adapted.assetId, generated.assetId);
      assert.equal(adapted.cacheHit, true);
      assert.equal(adapted.title, "Ambient AI Soundtrack");
      assert.equal(adapted.adaptation.energy, 0.9);
    }
    assert.equal(generations, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("missing credentials are reported only when explicit generation is requested", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-music-provider-"));
  const messages: string[] = [];
  const client: RemoteMusicClient = {
    id: "elevenlabs", label: "ElevenLabs", model: "music_v2",
    async generate() { throw new Error("must not generate"); },
    async testConnection() { return "Connected."; },
  };
  try {
    const provider = new AdaptiveMusicProvider(
      new LocalProceduralMusicProvider(), [client], { async get() { return undefined; } },
      new GeneratedMusicCache(directory, () => 1024 * 1024), new MemoryState(),
      () => settings(), (message) => messages.push(message),
    );
    const playback = await provider.getTrack(request);
    assert.equal(playback.source, "procedural");
    await assert.rejects(provider.generateTrack(request), /no saved API key/);
    assert.match(messages.join("\n"), /No cached Ambient track/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("daily limit blocks replacement generation but never blocks cached playback", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adaptive-music-provider-"));
  let generations = 0;
  const client: RemoteMusicClient = {
    id: "elevenlabs", label: "ElevenLabs", model: "music_v2",
    async generate() {
      generations += 1;
      return { bytes: Uint8Array.from([0x49, 0x44, 0x33, ...Array.from({ length: 40 }, () => 0)]), mimeType: "audio/mpeg" };
    },
    async testConnection() { return "Connected."; },
  };
  try {
    const provider = new AdaptiveMusicProvider(
      new LocalProceduralMusicProvider(), [client], { async get() { return "test-key"; } },
      new GeneratedMusicCache(directory, () => 1024 * 1024), new MemoryState(),
      () => settings(1), () => undefined,
    );
    const generated = await provider.generateTrack(request);
    await assert.rejects(provider.generateTrack({ ...request, intent: "focus" }), /daily generation limit reached/);
    const cached = await provider.getTrack({ ...request, intent: "review" });
    assert.equal(cached.source, "generated");
    if (cached.source === "generated") assert.equal(cached.assetId, generated.assetId);
    assert.equal(generations, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
