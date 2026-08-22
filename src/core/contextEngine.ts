import {
  ActivityEvent,
  ActivityKind,
  CodingContext,
  CodingState,
  ExecutionOutcome,
  ExecutionSummary,
  ExecutionSource,
  TerminalAdaptation,
  clamp,
  roundToHundredth,
} from "./types";

export interface ContextEngineConfig {
  idleTimeoutMs: number;
  waitingTimeoutMs: number;
  deepFocusDurationMs: number;
  completionHoldMs: number;
  editWindowMs: number;
  activeEditCount: number;
  editContinuityGapMs: number;
  navigationWindowMs: number;
  reviewingAfterEditMs: number;
  transitionDebounceMs: number;
  unfocusedIdleTimeoutMs: number;
  terminalAdaptation: TerminalAdaptation;
  terminalMinimumDurationMs: number;
}

export const DEFAULT_CONTEXT_ENGINE_CONFIG: Readonly<ContextEngineConfig> = {
  idleTimeoutMs: 120_000,
  waitingTimeoutMs: 8_000,
  deepFocusDurationMs: 90_000,
  completionHoldMs: 8_000,
  editWindowMs: 12_000,
  activeEditCount: 3,
  editContinuityGapMs: 20_000,
  navigationWindowMs: 15_000,
  reviewingAfterEditMs: 4_000,
  transitionDebounceMs: 1_500,
  unfocusedIdleTimeoutMs: 30_000,
  terminalAdaptation: "longRunningOnly",
  terminalMinimumDurationMs: 5_000,
};

interface ExecutionState {
  tasks: number;
  terminalCommands: number;
  debugSessions: number;
}

const NON_USER_ACTIVITY = new Set<ActivityKind>(["diagnostics_changed"]);
const IMMEDIATE_STATES = new Set<CodingState>(["idle", "waiting", "completed"]);

/** Pure state inference that never sees document contents or file paths. */
export class ContextEngine {
  private config: ContextEngineConfig;
  private editTimes: number[] = [];
  private navigationTimes: number[] = [];
  private lastEditAt?: number;
  private codingStreakStartedAt?: number;
  private executionStartedAt?: number;
  private executionCompletedAt?: number;
  private executionSource?: ExecutionSource;
  private executionOutcome?: ExecutionOutcome;
  private lastExecution?: ExecutionSummary;
  private executionSequence = 0;
  private readonly executions: ExecutionState = { tasks: 0, terminalCommands: 0, debugSessions: 0 };
  private diagnosticErrors = 0;
  private diagnosticWarnings = 0;
  private windowFocused = true;
  private activeLanguage?: string;
  private lastActivityAt = 0;
  private hasActivity = false;
  private stableState: CodingState = "idle";
  private pendingState?: CodingState;
  private pendingStateSince?: number;

  public constructor(config: ContextEngineConfig = { ...DEFAULT_CONTEXT_ENGINE_CONFIG }) {
    this.config = { ...config };
  }

  public updateConfig(config: ContextEngineConfig): void {
    this.config = { ...config };
    if (config.terminalAdaptation === "off" && this.executions.terminalCommands > 0) {
      this.executions.terminalCommands = 0;
      if (this.activeExecutionCount() === 0) this.executionStartedAt = undefined;
    }
  }

  public record(event: ActivityEvent): CodingContext {
    if (
      this.config.terminalAdaptation === "off" &&
      (event.kind === "terminal_command_started" || event.kind === "terminal_command_completed")
    ) return this.getContext(event.at);

    this.hasActivity = true;
    if (!NON_USER_ACTIVITY.has(event.kind)) {
      this.lastActivityAt = Math.max(this.lastActivityAt, event.at);
    }
    if (event.language) this.activeLanguage = event.language;

    switch (event.kind) {
      case "edit":
        if (this.lastEditAt === undefined || event.at - this.lastEditAt > this.config.editContinuityGapMs) {
          this.codingStreakStartedAt = event.at;
        }
        this.lastEditAt = event.at;
        this.editTimes.push(event.at);
        this.executionCompletedAt = undefined;
        this.executionOutcome = undefined;
        this.executionSource = undefined;
        break;
      case "navigation":
        this.navigationTimes.push(event.at);
        break;
      case "task_started":
        this.startExecution("task", event.at);
        break;
      case "task_completed":
        this.finishExecution("task", event.at, event.outcome);
        break;
      case "terminal_command_started":
        if (this.config.terminalAdaptation !== "off") this.startExecution("terminal", event.at);
        break;
      case "terminal_command_completed":
        if (this.config.terminalAdaptation !== "off") {
          this.finishExecution("terminal", event.at, event.outcome, event.durationMs);
        }
        break;
      case "debug_started":
        this.startExecution("debug", event.at);
        break;
      case "debug_completed":
        this.finishExecution("debug", event.at, event.outcome);
        break;
      case "diagnostics_changed":
        this.diagnosticErrors = Math.max(0, event.diagnosticErrors ?? this.diagnosticErrors);
        this.diagnosticWarnings = Math.max(0, event.diagnosticWarnings ?? this.diagnosticWarnings);
        break;
      case "window_focused":
        this.windowFocused = true;
        break;
      case "window_blurred":
        this.windowFocused = false;
        break;
      case "save":
      case "terminal_opened":
      case "terminal_closed":
        break;
    }
    return this.getContext(event.at);
  }

  public getContext(now: number = Date.now()): CodingContext {
    this.pruneHistory(now);
    const candidate = this.inferCandidateState(now);
    const state = this.stabilizeState(candidate, now);
    const recentEdits = this.editTimes.length;
    const editSignal = clamp(recentEdits / Math.max(this.config.activeEditCount * 2, 1));
    let intensity = 0;
    let confidence = 0.7;

    switch (state) {
      case "idle": confidence = this.hasActivity ? 0.95 : 0.7; break;
      case "active_coding":
        intensity = 0.35 + editSignal * 0.55;
        confidence = recentEdits >= this.config.activeEditCount ? 0.88 : 0.6;
        break;
      case "deep_focus": intensity = 0.7 + editSignal * 0.25; confidence = 0.92; break;
      case "waiting": intensity = 0.3; confidence = 0.94; break;
      case "reviewing":
        intensity = 0.35 + clamp(this.navigationTimes.length / 8) * 0.2;
        confidence = this.navigationTimes.length > 0 ? 0.78 : 0.55;
        break;
      case "completed": intensity = 0.85; confidence = 0.98; break;
    }

    return {
      state,
      intensity: roundToHundredth(clamp(intensity)),
      confidence: roundToHundredth(clamp(confidence)),
      activeLanguage: this.activeLanguage,
      activeTask: this.executions.tasks > 0,
      activeExecution: this.activeExecutionCount() > 0,
      diagnosticErrors: this.diagnosticErrors,
      diagnosticWarnings: this.diagnosticWarnings,
      lastExecution: this.lastExecution,
      reason: this.explainState(state, now),
      lastActivityAt: this.lastActivityAt,
    };
  }

  private inferCandidateState(now: number): CodingState {
    if (
      this.executionCompletedAt !== undefined &&
      this.executionSource !== "terminal" &&
      this.executionOutcome !== "failure" &&
      now - this.executionCompletedAt < this.config.completionHoldMs
    ) return "completed";

    if (this.activeExecutionCount() > 0 && this.executionStartedAt !== undefined) {
      const relevantEditAt = this.lastEditAt !== undefined && this.lastEditAt >= this.executionStartedAt ? this.lastEditAt : this.executionStartedAt;
      if (now - relevantEditAt >= this.config.waitingTimeoutMs) return "waiting";
    }

    const idleTimeout = this.windowFocused ? this.config.idleTimeoutMs : Math.min(this.config.idleTimeoutMs, this.config.unfocusedIdleTimeoutMs);
    if (!this.hasActivity || now - this.lastActivityAt >= idleTimeout) return "idle";

    const hasRecentEdit = this.lastEditAt !== undefined && now - this.lastEditAt <= this.config.editWindowMs;
    const hasSustainedEditing = hasRecentEdit && this.codingStreakStartedAt !== undefined && now - this.codingStreakStartedAt >= this.config.deepFocusDurationMs && this.editTimes.length >= this.config.activeEditCount;
    if (hasSustainedEditing) return "deep_focus";
    if (hasRecentEdit && this.editTimes.length >= this.config.activeEditCount) return "active_coding";

    const lastNavigationAt = this.navigationTimes.at(-1);
    const isNavigating = lastNavigationAt !== undefined && now - lastNavigationAt <= this.config.navigationWindowMs;
    const editingHasSettled = this.lastEditAt === undefined || now - this.lastEditAt >= this.config.reviewingAfterEditMs;
    if (isNavigating && editingHasSettled) return "reviewing";
    if (hasRecentEdit) return "active_coding";
    return "reviewing";
  }

  private stabilizeState(candidate: CodingState, now: number): CodingState {
    if (candidate === this.stableState) {
      this.pendingState = undefined;
      this.pendingStateSince = undefined;
      return this.stableState;
    }

    const immediate =
      this.config.transitionDebounceMs <= 0 ||
      IMMEDIATE_STATES.has(candidate) ||
      this.executionCompletedAt === now ||
      this.stableState === "completed" ||
      (this.stableState === "idle" && candidate !== "idle") ||
      (candidate === "active_coding" && this.lastEditAt === now);
    if (immediate) return this.commitState(candidate);

    if (this.pendingState !== candidate) {
      this.pendingState = candidate;
      this.pendingStateSince = now;
      return this.stableState;
    }
    if (this.pendingStateSince !== undefined && now - this.pendingStateSince >= this.config.transitionDebounceMs) {
      return this.commitState(candidate);
    }
    return this.stableState;
  }

  private commitState(state: CodingState): CodingState {
    this.stableState = state;
    this.pendingState = undefined;
    this.pendingStateSince = undefined;
    return state;
  }

  private startExecution(source: ExecutionSource, at: number): void {
    const wasIdle = this.activeExecutionCount() === 0;
    if (source === "task") this.executions.tasks += 1;
    else if (source === "terminal") this.executions.terminalCommands += 1;
    else this.executions.debugSessions += 1;
    if (wasIdle) this.executionStartedAt = at;
    this.executionCompletedAt = undefined;
    this.executionOutcome = undefined;
  }

  private finishExecution(
    source: ExecutionSource,
    at: number,
    outcome: ExecutionOutcome = "unknown",
    durationMs?: number,
  ): void {
    if (source === "task") this.executions.tasks = Math.max(0, this.executions.tasks - 1);
    else if (source === "terminal") this.executions.terminalCommands = Math.max(0, this.executions.terminalCommands - 1);
    else this.executions.debugSessions = Math.max(0, this.executions.debugSessions - 1);

    this.lastExecution = {
      id: ++this.executionSequence,
      source,
      outcome,
      completedAt: at,
      durationMs,
      cue: this.executionCue(source, outcome, durationMs),
    };

    if (this.activeExecutionCount() === 0) {
      this.executionStartedAt = undefined;
      this.executionCompletedAt = at;
      this.executionSource = source;
      this.executionOutcome = outcome;
    }
  }

  private executionCue(
    source: ExecutionSource,
    outcome: ExecutionOutcome,
    durationMs: number | undefined,
  ): ExecutionSummary["cue"] {
    if (source !== "terminal" || outcome === "unknown" || this.config.terminalAdaptation === "off") return undefined;
    const eligible =
      this.config.terminalAdaptation === "all" ||
      (durationMs !== undefined && durationMs >= this.config.terminalMinimumDurationMs);
    if (!eligible) return undefined;
    return outcome === "failure" ? "failure" : "completion";
  }

  private activeExecutionCount(): number {
    return this.executions.tasks + this.executions.terminalCommands + this.executions.debugSessions;
  }

  private explainState(state: CodingState, now: number): string {
    switch (state) {
      case "idle": return this.windowFocused ? "No recent editor activity" : "Editor window is unfocused";
      case "active_coding": return `${this.editTimes.length} recent edit${this.editTimes.length === 1 ? "" : "s"}`;
      case "deep_focus": return "Sustained editing with a recent change";
      case "waiting": return `${this.executionLabel()} running while editing is paused`;
      case "completed": return `${this.executionLabel(this.executionSource)} completed`;
      case "reviewing":
        if (this.executionOutcome === "failure" && this.executionCompletedAt !== undefined && now - this.executionCompletedAt < this.config.completionHoldMs) {
          return `${this.executionLabel(this.executionSource)} ended with errors`;
        }
        if (this.diagnosticErrors > 0) return `Reviewing with ${this.diagnosticErrors} diagnostic error${this.diagnosticErrors === 1 ? "" : "s"}`;
        return "Navigation or low-intensity editor activity";
    }
  }

  private executionLabel(source: ExecutionSource | undefined = this.activeSource()): string {
    if (source === "terminal") return "Terminal command";
    if (source === "debug") return "Debug session";
    return "Task";
  }

  private activeSource(): ExecutionSource | undefined {
    if (this.executions.tasks > 0) return "task";
    if (this.executions.terminalCommands > 0) return "terminal";
    if (this.executions.debugSessions > 0) return "debug";
    return this.executionSource;
  }

  private pruneHistory(now: number): void {
    const editCutoff = now - Math.max(this.config.editWindowMs, this.config.deepFocusDurationMs);
    const navigationCutoff = now - this.config.navigationWindowMs;
    this.editTimes = this.editTimes.filter((at) => at >= editCutoff);
    this.navigationTimes = this.navigationTimes.filter((at) => at >= navigationCutoff);
  }
}
