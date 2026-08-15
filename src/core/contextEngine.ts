import { ActivityEvent, CodingContext, CodingState, clamp, roundToHundredth } from "./types";

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
};

/** Pure state inference that never sees document contents or file paths. */
export class ContextEngine {
  private config: ContextEngineConfig;
  private editTimes: number[] = [];
  private navigationTimes: number[] = [];
  private lastEditAt?: number;
  private codingStreakStartedAt?: number;
  private taskStartedAt?: number;
  private taskCompletedAt?: number;
  private activeTaskCount = 0;
  private activeLanguage?: string;
  private lastActivityAt = 0;
  private hasActivity = false;

  public constructor(config: ContextEngineConfig = { ...DEFAULT_CONTEXT_ENGINE_CONFIG }) {
    this.config = { ...config };
  }

  public updateConfig(config: ContextEngineConfig): void { this.config = { ...config }; }

  public record(event: ActivityEvent): CodingContext {
    this.hasActivity = true;
    this.lastActivityAt = Math.max(this.lastActivityAt, event.at);
    if (event.language) this.activeLanguage = event.language;

    switch (event.kind) {
      case "edit":
        if (this.lastEditAt === undefined || event.at - this.lastEditAt > this.config.editContinuityGapMs) {
          this.codingStreakStartedAt = event.at;
        }
        this.lastEditAt = event.at;
        this.editTimes.push(event.at);
        this.taskCompletedAt = undefined;
        break;
      case "navigation":
        this.navigationTimes.push(event.at);
        break;
      case "task_started":
        this.activeTaskCount += 1;
        if (this.activeTaskCount === 1) this.taskStartedAt = event.at;
        this.taskCompletedAt = undefined;
        break;
      case "task_completed":
        this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
        if (this.activeTaskCount === 0) {
          this.taskStartedAt = undefined;
          this.taskCompletedAt = event.at;
        }
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
    const state = this.inferState(now);
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
      activeTask: this.activeTaskCount > 0,
      lastActivityAt: this.lastActivityAt,
    };
  }

  private inferState(now: number): CodingState {
    if (this.taskCompletedAt !== undefined && now - this.taskCompletedAt < this.config.completionHoldMs) return "completed";

    if (this.activeTaskCount > 0 && this.taskStartedAt !== undefined) {
      const relevantEditAt = this.lastEditAt !== undefined && this.lastEditAt >= this.taskStartedAt ? this.lastEditAt : this.taskStartedAt;
      if (now - relevantEditAt >= this.config.waitingTimeoutMs) return "waiting";
    }

    if (!this.hasActivity || now - this.lastActivityAt >= this.config.idleTimeoutMs) return "idle";

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

  private pruneHistory(now: number): void {
    const editCutoff = now - Math.max(this.config.editWindowMs, this.config.deepFocusDurationMs);
    const navigationCutoff = now - this.config.navigationWindowMs;
    this.editTimes = this.editTimes.filter((at) => at >= editCutoff);
    this.navigationTimes = this.navigationTimes.filter((at) => at >= navigationCutoff);
  }
}
