import assert from "node:assert/strict";
import test from "node:test";
import { ContextEngine, ContextEngineConfig } from "../core/contextEngine";

const TEST_CONFIG: ContextEngineConfig = {
  idleTimeoutMs: 5_000, waitingTimeoutMs: 1_000, deepFocusDurationMs: 2_500,
  completionHoldMs: 800, editWindowMs: 1_200, activeEditCount: 3,
  editContinuityGapMs: 1_500, navigationWindowMs: 1_000, reviewingAfterEditMs: 300,
  transitionDebounceMs: 0, unfocusedIdleTimeoutMs: 1_000,
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

test("terminal shell execution contributes waiting and completion signals", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "terminal_command_started", at: 100 });
  engine.record({ kind: "edit", at: 200 });
  const waiting = engine.getContext(1_200);
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.activeTask, false);
  assert.equal(waiting.activeExecution, true);

  const completed = engine.record({ kind: "terminal_command_completed", at: 1_300, outcome: "success" });
  assert.equal(completed.state, "completed");
  assert.match(completed.reason, /Terminal command completed/);
});

test("failed execution does not play the completion state", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "task_started", at: 100 });
  const context = engine.record({ kind: "task_completed", at: 250, outcome: "failure" });
  assert.equal(context.state, "reviewing");
  assert.match(context.reason, /ended with errors/);
});

test("completion cue expires without an extra debounce delay", () => {
  const engine = new ContextEngine({ ...TEST_CONFIG, transitionDebounceMs: 500 });
  engine.record({ kind: "task_started", at: 100 });
  assert.equal(engine.record({ kind: "task_completed", at: 250, outcome: "success" }).state, "completed");
  assert.equal(engine.getContext(1_049).state, "completed");
  assert.equal(engine.getContext(1_050).state, "reviewing");
});

test("diagnostic updates do not postpone idle", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "navigation", at: 100 });
  engine.record({ kind: "diagnostics_changed", at: 4_900, diagnosticErrors: 2 });
  const context = engine.getContext(5_100);
  assert.equal(context.state, "idle");
  assert.equal(context.diagnosticErrors, 2);
  assert.equal(context.lastActivityAt, 100);
});

test("an unfocused editor uses the shorter idle timeout", () => {
  const engine = new ContextEngine(TEST_CONFIG);
  engine.record({ kind: "navigation", at: 100 });
  engine.record({ kind: "window_blurred", at: 200 });
  assert.equal(engine.getContext(1_199).state, "reviewing");
  assert.equal(engine.getContext(1_200).state, "idle");
});

test("non-critical transitions are debounced", () => {
  const engine = new ContextEngine({ ...TEST_CONFIG, transitionDebounceMs: 500 });
  engine.record({ kind: "edit", at: 100 });
  engine.record({ kind: "edit", at: 200 });
  engine.record({ kind: "edit", at: 300 });
  assert.equal(engine.record({ kind: "navigation", at: 1_600 }).state, "active_coding");
  assert.equal(engine.getContext(2_099).state, "active_coding");
  assert.equal(engine.getContext(2_100).state, "reviewing");
});
