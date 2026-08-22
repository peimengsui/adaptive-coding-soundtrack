import { ExecutionSummary } from "./types";

export function isExecutionCueAllowed(
  execution: ExecutionSummary,
  previousCueAt: number | undefined,
  cooldownMs: number,
): boolean {
  if (!execution.cue) return false;
  return previousCueAt === undefined || execution.completedAt - previousCueAt >= Math.max(0, cooldownMs);
}
