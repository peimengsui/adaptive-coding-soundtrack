import * as vscode from "vscode";
import { PlaybackCue, Track } from "../core/types";

export type PlayerControl = "pause" | "resume" | "stop" | "setVolume";
export type PlayerControlHandler = (control: PlayerControl, value?: number) => void;
export type PlayerPauseReason = "user" | "idle";

interface DesiredPlayback {
  track?: Track;
  paused: boolean;
  pauseReason?: PlayerPauseReason;
  volume: number;
  fadeDurationMs: number;
}

/** A context-agnostic Web Audio player hosted in a minimal VS Code Webview. */
export class WebviewAudioPlayer implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private disposing = false;
  private pendingCue?: { cue: PlaybackCue; volume: number };
  private readonly desired: DesiredPlayback = {
    paused: false,
    volume: 0.45,
    fadeDurationMs: 1_400,
  };

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onControl: PlayerControlHandler,
    private readonly onDiagnostic: (message: string) => void,
  ) {}

  public reveal(): void {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "adaptiveMusic.player",
      "Adaptive Music Player",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
      },
    );
    this.panel = panel;
    this.ready = false;
    panel.iconPath = new vscode.ThemeIcon("unmute");
    panel.webview.html = this.getHtml(panel.webview);
    panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
      if (!this.disposing) this.onControl("stop");
    });
  }

  public play(track: Track, volume: number, fadeDurationMs: number): void {
    this.desired.track = track;
    this.desired.paused = false;
    this.desired.pauseReason = undefined;
    this.desired.volume = volume;
    this.desired.fadeDurationMs = fadeDurationMs;
    this.reveal();
    this.sendDesiredPlayback();
  }

  public pause(reason: PlayerPauseReason = "user"): void {
    this.desired.paused = true;
    this.desired.pauseReason = reason;
    this.post({ type: "pause", reason, fadeDurationMs: this.desired.fadeDurationMs });
  }

  public resume(): void {
    this.desired.paused = false;
    this.desired.pauseReason = undefined;
    if (this.desired.track) this.post({ type: "resume", fadeDurationMs: this.desired.fadeDurationMs });
  }

  public stop(): void {
    this.desired.track = undefined;
    this.desired.paused = false;
    this.desired.pauseReason = undefined;
    this.pendingCue = undefined;
    this.post({ type: "stop", fadeDurationMs: this.desired.fadeDurationMs });
  }

  public playCue(cue: PlaybackCue, volume: number): void {
    if (!this.desired.track || this.desired.paused) return;
    const pending = { cue, volume: Math.min(1, Math.max(0, volume)) };
    if (!this.ready) {
      this.pendingCue = pending;
      return;
    }
    this.post({ type: "cue", ...pending });
  }

  public setVolume(volume: number): void {
    this.desired.volume = volume;
    this.post({ type: "volume", volume });
  }

  public dispose(): void {
    this.disposing = true;
    this.panel?.dispose();
    this.panel = undefined;
    this.ready = false;
    this.disposing = false;
  }

  private sendDesiredPlayback(): void {
    if (!this.ready) return;
    this.post({ type: "volume", volume: this.desired.volume });
    if (this.desired.track) {
      this.post({ type: "play", track: this.desired.track, fadeDurationMs: this.desired.fadeDurationMs });
      if (this.desired.paused) {
        this.post({
          type: "pause",
          reason: this.desired.pauseReason ?? "user",
          fadeDurationMs: this.desired.fadeDurationMs,
        });
      }
    }
    if (this.pendingCue && !this.desired.paused) {
      this.post({ type: "cue", ...this.pendingCue });
      this.pendingCue = undefined;
    }
  }

  private post(message: object): void {
    if (this.panel && this.ready) void this.panel.webview.postMessage(message);
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const typed = message as { type: string; action?: string; value?: number; message?: string };
    if (typed.type === "ready") {
      this.ready = true;
      this.sendDesiredPlayback();
      return;
    }
    if (typed.type === "diagnostic" && typeof typed.message === "string") {
      this.onDiagnostic(typed.message);
      return;
    }
    if (typed.type !== "control") return;
    if (typed.action === "pause" || typed.action === "resume" || typed.action === "stop") {
      this.onControl(typed.action);
    } else if (typed.action === "setVolume" && typeof typed.value === "number") {
      this.onControl("setVolume", typed.value);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "player.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "player.js"));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src ${webview.cspSource}`,
    ].join("; ");
    const bars = Array.from({ length: 12 }, (_, index) => `<span style="--i:${index % 7}"></span>`).join("");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Adaptive Music Player</title>
</head>
<body>
  <main>
    <p class="eyebrow">Adaptive Coding Soundtrack</p>
    <h1 id="title">Waiting for coding activity</h1>
    <p id="artist">Original audio generated locally with Web Audio</p>
    <div class="visualizer" aria-hidden="true">${bars}</div>
    <div class="controls">
      <button id="toggle" type="button">Pause</button>
      <button id="stop" type="button">Stop Session</button>
      <label>Volume <input id="volume" type="range" min="0" max="1" step="0.01" value="0.45"></label>
    </div>
    <button id="audioGate" type="button">Enable Audio</button>
    <p id="status" aria-live="polite">The soundtrack will begin when activity is detected.</p>
  </main>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
