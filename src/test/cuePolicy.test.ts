import assert from "node:assert/strict";
import test from "node:test";
import { isExecutionCueAllowed } from "../core/cuePolicy";
import { ExecutionSummary } from "../core/types";

const completion: ExecutionSummary = {
  id: 1,
  source: "terminal",
  outcome: "success",
  completedAt: 10_000,
  durationMs: 6_000,
  cue: "completion",
};

test("execution cue policy allows the first cue and enforces cooldown", () => {
  assert.equal(isExecutionCueAllowed(completion, undefined, 20_000), true);
  assert.equal(isExecutionCueAllowed(completion, 5_000, 20_000), false);
  assert.equal(isExecutionCueAllowed({ ...completion, completedAt: 25_000 }, 5_000, 20_000), true);
});

test("execution cue policy rejects executions without a cue", () => {
  assert.equal(isExecutionCueAllowed({ ...completion, cue: undefined }, undefined, 20_000), false);
});
