import * as vscode from "vscode";
import { isExecutionCueAllowed } from "../core/cuePolicy";
import { MusicDirector } from "../core/musicDirector";
import { CodingContext, MusicProvider, MusicRequest, MusicStyle, PlaybackCue, Track } from "../core/types";
import { WebviewAudioPlayer } from "./webviewAudioPlayer";

export interface SessionSettings {
  volume: number;
  adaptiveSwitching: boolean;
  fadeDurationMs: number;
  minimumAdaptiveConfidence: number;
  completionCueCooldownMs: number;
  eventCueVolume: number;
}
export type PlaybackState = "inactive" | "playing" | "user_paused" | "context_paused";
const STYLE_LABELS: Record<MusicStyle, string> = { ambient: "Ambient", jazz: "Jazz", lofi: "Lo-fi" };
const STATE_LABELS: Record<CodingContext["state"], string> = { idle: "Idle", active_coding: "Active Coding", deep_focus: "Deep Focus", waiting: "Waiting", reviewing: "Reviewing", completed: "Completed" };

export class MusicSessionController implements vscode.Disposable {
  private active = false;
  private userPaused = false;
  private contextPaused = false;
  private idlePlaybackOverride = false;
  private style: MusicStyle = "ambient";
  private currentRequestSignature?: string;
  private currentTrack?: Track;
  private lastHandledExecutionId?: number;
  private lastCueAt?: number;
  private generation = 0;

  public constructor(
    private readonly director: MusicDirector,
    private readonly provider: MusicProvider,
    private readonly player: WebviewAudioPlayer,
    private readonly statusBar: vscode.StatusBarItem,
    private context: CodingContext,
    private settings: SessionSettings,
    private readonly output: vscode.OutputChannel,
  ) {
    this.statusBar.command = "adaptiveMusic.togglePause";
    this.statusBar.hide();
  }

  public async start(style: MusicStyle): Promise<void> {
    this.active = true;
    this.userPaused = false;
    this.contextPaused = false;
    this.idlePlaybackOverride = false;
    this.style = style;
    this.currentRequestSignature = undefined;
    this.lastHandledExecutionId = this.context.lastExecution?.id;
    this.lastCueAt = undefined;
    this.generation += 1;
    this.player.reveal();
    this.output.appendLine(`[session] Started with ${STYLE_LABELS[style]}`);
    this.updateStatus();
    await this.adapt(true);
  }

  public stop(): void {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    this.currentRequestSignature = undefined;
    this.currentTrack = undefined;
    this.lastCueAt = undefined;
    this.idlePlaybackOverride = false;
    this.player.stop();
    this.output.appendLine("[session] Stopped");
    this.player.dispose();
    this.statusBar.hide();
  }

  public async togglePause(forcePaused?: boolean): Promise<void> {
    if (!this.active) {
      void vscode.window.showInformationMessage("Start an Adaptive Music session first.");
      return;
    }
    const shouldPause = forcePaused === true || (
      forcePaused === undefined && !this.userPaused && !this.contextPaused
    );
    if (shouldPause) {
      this.userPaused = true;
      this.idlePlaybackOverride = false;
      this.player.pause("user");
    } else {
      this.userPaused = false;
      this.idlePlaybackOverride = this.context.state === "idle";
      this.contextPaused = false;
      if (this.context.state === "idle" || !this.currentTrack) await this.adapt(true);
      else this.player.resume();
    }
    this.updateStatus();
  }

  public async setStyle(style: MusicStyle): Promise<void> {
    this.style = style;
    this.currentRequestSignature = undefined;
    this.updateStatus();
    if (this.active) await this.adapt(true);
  }

  public setVolume(volume: number): void {
    this.settings.volume = Math.min(1, Math.max(0, volume));
    this.player.setVolume(this.settings.volume);
    this.updateStatus();
  }

  public updateSettings(settings: SessionSettings): void {
    const adaptiveChanged = this.settings.adaptiveSwitching !== settings.adaptiveSwitching;
    this.settings = { ...settings };
    this.player.setVolume(settings.volume);
    if (adaptiveChanged && settings.adaptiveSwitching && this.active) void this.adapt(true);
    this.updateStatus();
  }

  public async onContextChanged(context: CodingContext): Promise<void> {
    const stateChanged = context.state !== this.context.state;
    if (stateChanged) {
      this.output.appendLine(
        `[context] ${this.context.state} -> ${context.state} (${context.reason}; confidence ${context.confidence.toFixed(2)})`,
      );
    }
    this.context = context;
    if (context.state !== "idle") this.idlePlaybackOverride = false;
    this.handleExecutionCue(context);
    this.updateStatus();
    if (this.active && (this.settings.adaptiveSwitching || !this.currentTrack)) await this.adapt(stateChanged);
  }

  public showPlayer(): void {
    if (!this.active) void vscode.window.showInformationMessage("Start an Adaptive Music session first.");
    else this.player.reveal();
  }
  public getStyle(): MusicStyle { return this.style; }
  public getContext(): CodingContext { return this.context; }
  public isActive(): boolean { return this.active; }
  public getPlaybackState(): PlaybackState {
    if (!this.active) return "inactive";
    if (this.userPaused) return "user_paused";
    if (this.contextPaused) return "context_paused";
    return "playing";
  }

  public dispose(): void {
    this.active = false;
    this.generation += 1;
    this.player.dispose();
    this.statusBar.dispose();
  }

  private async adapt(force: boolean): Promise<void> {
    if (!this.active || this.userPaused) return;
    const request = this.director.createRequest(this.context, { style: this.style });
    const idleOverride = this.context.state === "idle" && this.idlePlaybackOverride;
    if (!request.shouldPlay && !idleOverride) {
      this.contextPaused = true;
      this.currentRequestSignature = undefined;
      this.player.pause("idle");
      this.updateStatus();
      return;
    }
    const confidenceGated =
      this.currentTrack !== undefined &&
      this.context.confidence < this.settings.minimumAdaptiveConfidence &&
      this.context.state !== "completed" &&
      this.context.state !== "waiting";
    if (confidenceGated) {
      this.output.appendLine(
        `[director] Kept the current track: confidence ${this.context.confidence.toFixed(2)} is below ${this.settings.minimumAdaptiveConfidence.toFixed(2)}`,
      );
      return;
    }
    const signature = this.requestSignature(request);
    if (!force && signature === this.currentRequestSignature) return;
    const requestGeneration = ++this.generation;
    const track = await this.provider.getTrack(request);
    if (!this.active || this.userPaused || requestGeneration !== this.generation) return;
    this.contextPaused = false;
    this.currentTrack = track;
    this.currentRequestSignature = signature;
    this.player.play(track, this.settings.volume, this.settings.fadeDurationMs);
    this.output.appendLine(`[director] Playing ${track.id}`);
    this.updateStatus();
  }

  private requestSignature(request: MusicRequest): string {
    const band = request.energy < 0.4 ? "low" : request.energy < 0.7 ? "mid" : "high";
    return `${request.style}:${request.intent}:${band}`;
  }

  private handleExecutionCue(context: CodingContext): void {
    const execution = context.lastExecution;
    if (!execution || execution.id === this.lastHandledExecutionId) return;
    this.lastHandledExecutionId = execution.id;
    if (!execution.cue || !this.active || this.userPaused || this.contextPaused || !this.currentTrack) return;

    if (!isExecutionCueAllowed(execution, this.lastCueAt, this.settings.completionCueCooldownMs)) {
      this.output.appendLine(`[director] Suppressed terminal ${execution.cue} cue during cooldown`);
      return;
    }

    this.lastCueAt = execution.completedAt;
    this.player.playCue(execution.cue, this.settings.eventCueVolume);
    const duration = execution.durationMs === undefined ? "unknown duration" : `${(execution.durationMs / 1_000).toFixed(1)}s`;
    this.output.appendLine(`[director] Played terminal ${cueLabel(execution.cue)} cue after ${duration}`);
  }

  private updateStatus(): void {
    if (!this.active) { this.statusBar.hide(); return; }
    const pausedSuffix = this.userPaused ? " · Paused" : this.contextPaused ? " · Auto-paused" : "";
    this.statusBar.text = `♫ ${STYLE_LABELS[this.style]} · ${STATE_LABELS[this.context.state]}${pausedSuffix}`;
    this.statusBar.tooltip = new vscode.MarkdownString([
      "**Adaptive Coding Soundtrack**", "", `State: ${STATE_LABELS[this.context.state]}`,
      `Intensity: ${Math.round(this.context.intensity * 100)}%`, `Confidence: ${Math.round(this.context.confidence * 100)}%`,
      `Reason: ${this.context.reason}`,
      this.context.activeLanguage ? `Language: ${this.context.activeLanguage}` : "",
      this.context.activeExecution ? "Execution running" : "",
      this.context.diagnosticErrors > 0 ? `Diagnostic errors: ${this.context.diagnosticErrors}` : "",
      "", "Click to pause or resume.",
    ].filter(Boolean).join("  \n"));
    this.statusBar.show();
  }
}

export function styleLabel(style: MusicStyle): string { return STYLE_LABELS[style]; }
export function stateLabel(state: CodingContext["state"]): string { return STATE_LABELS[state]; }
function cueLabel(cue: PlaybackCue): string { return cue === "failure" ? "failure" : "completion"; }
