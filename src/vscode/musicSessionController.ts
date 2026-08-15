import * as vscode from "vscode";
import { MusicDirector } from "../core/musicDirector";
import { CodingContext, MusicProvider, MusicRequest, MusicStyle, Track } from "../core/types";
import { WebviewAudioPlayer } from "./webviewAudioPlayer";

export interface SessionSettings { volume: number; adaptiveSwitching: boolean; fadeDurationMs: number; }
const STYLE_LABELS: Record<MusicStyle, string> = { ambient: "Ambient", jazz: "Jazz", lofi: "Lo-fi" };
const STATE_LABELS: Record<CodingContext["state"], string> = { idle: "Idle", active_coding: "Active Coding", deep_focus: "Deep Focus", waiting: "Waiting", reviewing: "Reviewing", completed: "Completed" };

export class MusicSessionController implements vscode.Disposable {
  private active = false;
  private userPaused = false;
  private contextPaused = false;
  private style: MusicStyle = "ambient";
  private currentRequestSignature?: string;
  private currentTrack?: Track;
  private generation = 0;

  public constructor(
    private readonly director: MusicDirector,
    private readonly provider: MusicProvider,
    private readonly player: WebviewAudioPlayer,
    private readonly statusBar: vscode.StatusBarItem,
    private context: CodingContext,
    private settings: SessionSettings,
  ) {
    this.statusBar.command = "adaptiveMusic.togglePause";
    this.statusBar.hide();
  }

  public async start(style: MusicStyle): Promise<void> {
    this.active = true;
    this.userPaused = false;
    this.contextPaused = false;
    this.style = style;
    this.currentRequestSignature = undefined;
    this.generation += 1;
    this.player.reveal();
    this.updateStatus();
    await this.adapt(true);
  }

  public stop(): void {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    this.currentRequestSignature = undefined;
    this.currentTrack = undefined;
    this.player.stop();
    this.player.dispose();
    this.statusBar.hide();
  }

  public async togglePause(forcePaused?: boolean): Promise<void> {
    if (!this.active) {
      void vscode.window.showInformationMessage("Start an Adaptive Music session first.");
      return;
    }
    this.userPaused = forcePaused ?? !this.userPaused;
    if (this.userPaused) this.player.pause();
    else if (!this.contextPaused && this.currentTrack) this.player.resume();
    else await this.adapt(true);
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

  public onContextChanged(context: CodingContext): void {
    const stateChanged = context.state !== this.context.state;
    this.context = context;
    this.updateStatus();
    if (this.active && (this.settings.adaptiveSwitching || !this.currentTrack)) void this.adapt(stateChanged);
  }

  public showPlayer(): void {
    if (!this.active) void vscode.window.showInformationMessage("Start an Adaptive Music session first.");
    else this.player.reveal();
  }
  public getStyle(): MusicStyle { return this.style; }
  public getContext(): CodingContext { return this.context; }

  public dispose(): void {
    this.active = false;
    this.generation += 1;
    this.player.dispose();
    this.statusBar.dispose();
  }

  private async adapt(force: boolean): Promise<void> {
    if (!this.active || this.userPaused) return;
    const request = this.director.createRequest(this.context, { style: this.style });
    if (!request.shouldPlay) {
      this.contextPaused = true;
      this.currentRequestSignature = undefined;
      this.player.pause();
      this.updateStatus();
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
    this.updateStatus();
  }

  private requestSignature(request: MusicRequest): string {
    const band = request.energy < 0.4 ? "low" : request.energy < 0.7 ? "mid" : "high";
    return `${request.style}:${request.intent}:${band}`;
  }

  private updateStatus(): void {
    if (!this.active) { this.statusBar.hide(); return; }
    const pausedSuffix = this.userPaused ? " · Paused" : this.contextPaused ? " · Auto-paused" : "";
    this.statusBar.text = `♫ ${STYLE_LABELS[this.style]} · ${STATE_LABELS[this.context.state]}${pausedSuffix}`;
    this.statusBar.tooltip = new vscode.MarkdownString([
      "**Adaptive Coding Soundtrack**", "", `State: ${STATE_LABELS[this.context.state]}`,
      `Intensity: ${Math.round(this.context.intensity * 100)}%`, `Confidence: ${Math.round(this.context.confidence * 100)}%`,
      this.context.activeLanguage ? `Language: ${this.context.activeLanguage}` : "",
      this.context.activeTask ? "VS Code task running" : "", "", "Click to pause or resume.",
    ].filter(Boolean).join("  \n"));
    this.statusBar.show();
  }
}

export function styleLabel(style: MusicStyle): string { return STYLE_LABELS[style]; }
export function stateLabel(state: CodingContext["state"]): string { return STATE_LABELS[state]; }
