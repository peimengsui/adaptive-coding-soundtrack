import assert from "node:assert/strict";
import test from "node:test";
import { LocalProceduralMusicProvider } from "../core/localProceduralMusicProvider";
import { MusicDirector } from "../core/musicDirector";
import { CodingContext, CodingState, MusicStyle } from "../core/types";

function context(state: CodingState, intensity: number): CodingContext {
  return {
    state,
    intensity,
    confidence: 0.9,
    activeTask: state === "waiting",
    activeExecution: state === "waiting",
    diagnosticErrors: 0,
    diagnosticWarnings: 0,
    reason: "test context",
    lastActivityAt: 1_000,
  };
}

test("director deterministically maps each state to musical intent", () => {
  const director = new MusicDirector();
  const expected = { idle: "rest", active_coding: "flow", deep_focus: "focus", waiting: "anticipation", reviewing: "review", completed: "celebration" } as const;
  for (const [state, intent] of Object.entries(expected)) {
    const first = director.createRequest(context(state as CodingState, 0.6), { style: "jazz" });
    const second = director.createRequest(context(state as CodingState, 0.6), { style: "jazz" });
    assert.deepEqual(first, second);
    assert.equal(first.intent, intent);
    assert.equal(first.shouldPlay, state !== "idle");
  }
});

test("style changes tempo while intensity changes energy", () => {
  const director = new MusicDirector();
  const styles: MusicStyle[] = ["ambient", "jazz", "lofi"];
  assert.deepEqual(styles.map((style) => director.createRequest(context("active_coding", 0.5), { style }).tempoBpm), [64, 84, 74]);
  const low = director.createRequest(context("active_coding", 0.1), { style: "jazz" });
  const high = director.createRequest(context("active_coding", 0.9), { style: "jazz" });
  assert.ok(high.energy > low.energy);
  assert.ok(high.complexity > low.complexity);
});

test("provider resolves a deterministic original procedural track", async () => {
  const director = new MusicDirector(), provider = new LocalProceduralMusicProvider();
  const request = director.createRequest(context("deep_focus", 0.8), { style: "lofi" });
  const first = await provider.getTrack(request), second = await provider.getTrack(request);
  assert.deepEqual(first, second);
  assert.equal(first.source, "procedural");
  assert.match(first.id, /^lofi-focus-/);
  assert.equal(first.synthesis.tempoBpm, request.tempoBpm);
  assert.ok(first.synthesis.chordProgression.length >= 4);
  assert.ok(first.synthesis.variationSeed > 0);
  assert.ok(first.synthesis.lowpassHz > 0);
});
