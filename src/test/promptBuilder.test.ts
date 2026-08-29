import assert from "node:assert/strict";
import test from "node:test";
import { buildMusicPrompt } from "../providers/promptBuilder";
import { MusicRequest } from "../core/types";

const request: MusicRequest = {
  style: "jazz",
  codingState: "deep_focus",
  intent: "focus",
  energy: 0.56,
  complexity: 0.4,
  stability: 0.9,
  brightness: 0.7,
  tempoBpm: 84,
  shouldPlay: true,
};

test("remote prompts contain musical controls but no workspace content", () => {
  const prompt = buildMusicPrompt(request, 150, "Keep the piano especially soft.");
  assert.match(prompt, /150-second/);
  assert.match(prompt, /cool jazz/);
  assert.match(prompt, /upright bass/);
  assert.match(prompt, /brushed drum kit/);
  assert.match(prompt, /late-1950s/);
  assert.match(prompt, /Exclude synth pads/);
  assert.match(prompt, /84 BPM/);
  assert.match(prompt, /No vocals/);
  assert.match(prompt, /Additional user direction: Keep the piano especially soft/);
  for (const forbidden of ["filename", "workspace", "terminal command", "source code", "diagnostic message"]) {
    assert.doesNotMatch(prompt.toLowerCase(), new RegExp(forbidden));
  }
});

test("each style prompt defines instrumentation and exclusions", () => {
  const ambient = buildMusicPrompt({ ...request, style: "ambient" }, 30);
  const jazz = buildMusicPrompt(request, 30);
  const lofi = buildMusicPrompt({ ...request, style: "lofi" }, 30);
  assert.match(ambient, /evolving warm pads/);
  assert.match(ambient, /cinematic climax/);
  assert.match(jazz, /extended seventh and ninth voicings/);
  assert.match(lofi, /dusty electric piano/);
  assert.match(lofi, /trap hi-hat rolls/);
});
