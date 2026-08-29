import assert from "node:assert/strict";
import test from "node:test";
import { ElevenLabsMusicClient } from "../providers/elevenLabsMusicClient";
import { GoogleLyriaMusicClient } from "../providers/googleLyriaMusicClient";
import { StabilityAudioClient } from "../providers/stabilityAudioClient";
import { FetchLike, RemoteGenerationRequest } from "../providers/types";

const mp3 = Uint8Array.from([0x49, 0x44, 0x33, ...Array.from({ length: 40 }, () => 0)]);
const generation: RemoteGenerationRequest = {
  music: {
    style: "ambient", codingState: "active_coding", intent: "flow", energy: 0.5,
    complexity: 0.4, stability: 0.8, brightness: 0.5, tempoBpm: 64, shouldPlay: true,
  },
  prompt: "Synthetic test prompt",
  durationSeconds: 120,
};

test("ElevenLabs uses Music v2 streaming with header authentication", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    observedUrl = String(input);
    observedInit = init;
    return new Response(mp3, { status: 200, headers: { "song-id": "song-1" } });
  }) as FetchLike;
  const result = await new ElevenLabsMusicClient(fetcher).generate(generation, "secret-eleven", new AbortController().signal);
  assert.match(observedUrl, /\/v1\/music\/stream/);
  assert.equal((observedInit?.headers as Record<string, string>)["xi-api-key"], "secret-eleven");
  const body = JSON.parse(String(observedInit?.body)) as Record<string, unknown>;
  assert.equal(body.model_id, "music_v2");
  assert.equal(body.music_length_ms, 120_000);
  assert.equal(body.force_instrumental, true);
  assert.equal(result.providerAssetId, "song-1");
});

test("Google Lyria parses base64 MP3 output and verifies model availability", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).includes("/models")) {
      return Response.json({ models: [{ name: "models/lyria-3-pro-preview" }] });
    }
    return Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: Buffer.from(mp3).toString("base64") }] }] });
  }) as FetchLike;
  const client = new GoogleLyriaMusicClient(fetcher);
  const result = await client.generate(generation, "secret-google", new AbortController().signal);
  assert.deepEqual(result.bytes, mp3);
  assert.equal((calls[0].init?.headers as Record<string, string>)["x-goog-api-key"], "secret-google");
  assert.match(await client.testConnection("secret-google", new AbortController().signal), /available/);
});

test("Stability submits Stable Audio 3 and polls the result", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).includes("text-to-audio")) return Response.json({ id: "generation-1" }, { status: 202 });
    if (calls.filter((call) => call.url.includes("/results/")).length === 1) return new Response(undefined, { status: 202 });
    return new Response(mp3, { status: 200 });
  }) as FetchLike;
  const client = new StabilityAudioClient(fetcher, async () => undefined, 0);
  const result = await client.generate(generation, "secret-stability", new AbortController().signal);
  assert.deepEqual(result.bytes, mp3);
  assert.equal(calls.length, 3);
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer secret-stability");
  assert.ok(calls[0].init?.body instanceof FormData);
});

test("provider failures never echo request credentials", async () => {
  const fetcher = (async () => new Response("unauthorized", { status: 401, statusText: "Unauthorized" })) as FetchLike;
  await assert.rejects(
    () => new ElevenLabsMusicClient(fetcher).generate(generation, "super-secret-token", new AbortController().signal),
    (error: Error) => !error.message.includes("super-secret-token") && /401/.test(error.message),
  );
});
