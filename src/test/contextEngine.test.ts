import assert from "node:assert/strict";
import test from "node:test";
import { ContextEngine, ContextEngineConfig } from "../core/contextEngine";

const TEST_CONFIG: ContextEngineConfig = {
  idleTimeoutMs: 5_000, waitingTimeoutMs: 1_000, deepFocusDurationMs: 2_500,
  completionHoldMs: 800, editWindowMs: 1_200, activeEditCount: 3,
  editContinuityGapMs: 1_500, navigationWindowMs: 1_000, reviewingAfterEditMs: 300,
};

test("repeated typing becomes active coding", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "edit", at: 100, language: "typescript" });
  engine.record({ kind: "edit", at: 200, language: "typescript" });
  const context = engine.record({ kind: "edit", at: 300, language: "typescript" });
  assert.equal(context.state, "active_coding");
  assert.equal(context.activeLanguage, "typescript");
  assert.ok(context.intensity > 0.5);
});

test("sustained recent editing becomes deep focus", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  for (const at of [100, 700, 1_300, 1_900, 2_600, 2_900]) engine.record({ kind: "edit", at });
  assert.equal(engine.getContext(2_900).state, "deep_focus");
});

test("a running task plus an editing pause becomes waiting", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "task_started", at: 100 });
  engine.record({ kind: "edit", at: 200 });
  assert.equal(engine.getContext(1_199).state, "active_coding");
  const waiting = engine.getContext(1_200);
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.activeTask, true);
});

test("task completion enters completed and a new edit clears the cue", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "task_started", at: 100 });
  const completed = engine.record({ kind: "task_completed", at: 250 });
  assert.equal(completed.state, "completed");
  assert.equal(completed.activeTask, false);
  assert.equal(engine.record({ kind: "edit", at: 300 }).state, "active_coding");
});

test("navigation without editing becomes reviewing", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  const context = engine.record({ kind: "navigation", at: 100, language: "python" });
  assert.equal(context.state, "reviewing");
  assert.equal(context.activeLanguage, "python");
});

test("prolonged inactivity becomes idle", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "navigation", at: 100 });
  assert.equal(engine.getContext(5_099).state, "reviewing");
  assert.equal(engine.getContext(5_100).state, "idle");
});
