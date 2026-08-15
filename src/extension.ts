import * as vscode from "vscode";
import { ContextEngine, ContextEngineConfig, DEFAULT_CONTEXT_ENGINE_CONFIG } from "./core/contextEngine";
import { LocalProceduralMusicProvider } from "./core/localProceduralMusicProvider";
import { MusicDirector } from "./core/musicDirector";
import { CodingContext, MUSIC_STYLES, MusicStyle } from "./core/types";
import { ActivityCollector } from "./vscode/activityCollector";
import { MusicSessionController, SessionSettings, stateLabel, styleLabel } from "./vscode/musicSessionController";
import { PlayerControl, WebviewAudioPlayer } from "./vscode/webviewAudioPlayer";

const SECTION = "adaptiveMusic";

export function activate(extensionContext: vscode.ExtensionContext): void {
  const engine = new ContextEngine(readEngineConfig());
  let currentContext: CodingContext = engine.getContext(Date.now());
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  let controller: MusicSessionController;
  const player = new WebviewAudioPlayer((control: PlayerControl, value?: number) => {
    if (control === "pause") void controller.togglePause(true);
    else if (control === "resume") void controller.togglePause(false);
    else if (control === "stop") controller.stop();
    else if (control === "setVolume" && typeof value === "number") void setVolume(controller, value);
  });
  controller = new MusicSessionController(new MusicDirector(), new LocalProceduralMusicProvider(), player, statusBar, currentContext, readSessionSettings());

  const collector = new ActivityCollector((event) => {
    currentContext = engine.record(event);
    controller.onContextChanged(currentContext);
  });
  collector.start();
  const refreshTimer = setInterval(() => {
    const next = engine.getContext(Date.now());
    if (!contextsEqual(currentContext, next)) {
      currentContext = next;
      controller.onContextChanged(next);
    }
  }, 1_000);

  extensionContext.subscriptions.push(
    collector, controller, { dispose: () => clearInterval(refreshTimer) },
    vscode.commands.registerCommand("adaptiveMusic.start", async () => {
      const selected = await chooseStyle(readDefaultStyle(), "Start with which music style?");
      if (selected) await controller.start(selected);
    }),
    vscode.commands.registerCommand("adaptiveMusic.stop", () => controller.stop()),
    vscode.commands.registerCommand("adaptiveMusic.togglePause", () => controller.togglePause()),
    vscode.commands.registerCommand("adaptiveMusic.chooseStyle", async () => {
      const selected = await chooseStyle(controller.getStyle(), "Choose a music style");
      if (!selected) return;
      await vscode.workspace.getConfiguration(SECTION).update("defaultStyle", selected, vscode.ConfigurationTarget.Global);
      await controller.setStyle(selected);
    }),
    vscode.commands.registerCommand("adaptiveMusic.setVolume", (provided?: number) => setVolume(controller, provided)),
    vscode.commands.registerCommand("adaptiveMusic.showCurrentState", () => {
      const context = controller.getContext();
      const detail = [
        `${styleLabel(controller.getStyle())} · ${stateLabel(context.state)}`,
        `intensity ${Math.round(context.intensity * 100)}%`, `confidence ${Math.round(context.confidence * 100)}%`,
        context.activeLanguage ? `language ${context.activeLanguage}` : undefined,
        context.activeTask ? "task running" : undefined,
      ].filter(Boolean).join(" · ");
      void vscode.window.showInformationMessage(`Adaptive Music: ${detail}`);
    }),
    vscode.commands.registerCommand("adaptiveMusic.showPlayer", () => controller.showPlayer()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(SECTION)) return;
      engine.updateConfig(readEngineConfig());
      controller.updateSettings(readSessionSettings());
      currentContext = engine.getContext(Date.now());
      controller.onContextChanged(currentContext);
    }),
  );
}

export function deactivate(): void {}

async function chooseStyle(current: MusicStyle, placeHolder: string): Promise<MusicStyle | undefined> {
  const selected = await vscode.window.showQuickPick(MUSIC_STYLES.map((style) => ({
    label: style === current ? `$(check) ${styleLabel(style)}` : styleLabel(style),
    description: style === current ? "Current/default style" : undefined, style,
  })), { placeHolder });
  return selected?.style;
}

async function setVolume(controller: MusicSessionController, provided?: number): Promise<void> {
  let volume = provided;
  if (volume === undefined) {
    const input = await vscode.window.showInputBox({
      title: "Adaptive Music Volume", prompt: "Enter a volume from 0 to 100",
      value: String(Math.round(readSessionSettings().volume * 100)),
      validateInput: (value) => {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 && number <= 100 ? undefined : "Enter a number from 0 to 100.";
      },
    });
    if (input === undefined) return;
    volume = Number(input) / 100;
  }
  const clamped = Math.min(1, Math.max(0, volume));
  controller.setVolume(clamped);
  await vscode.workspace.getConfiguration(SECTION).update("volume", clamped, vscode.ConfigurationTarget.Global);
}

function readDefaultStyle(): MusicStyle {
  const configured = vscode.workspace.getConfiguration(SECTION).get<string>("defaultStyle", "ambient");
  return MUSIC_STYLES.includes(configured as MusicStyle) ? configured as MusicStyle : "ambient";
}

function readSessionSettings(): SessionSettings {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  return {
    volume: configuration.get<number>("volume", 0.45),
    adaptiveSwitching: configuration.get<boolean>("adaptiveSwitching", true),
    fadeDurationMs: configuration.get<number>("fadeDurationMs", 1_400),
  };
}

function readEngineConfig(): ContextEngineConfig {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  return {
    ...DEFAULT_CONTEXT_ENGINE_CONFIG,
    idleTimeoutMs: configuration.get<number>("idleTimeoutSeconds", 120) * 1_000,
    waitingTimeoutMs: configuration.get<number>("waitingDetectionSeconds", 8) * 1_000,
    deepFocusDurationMs: configuration.get<number>("deepFocusSeconds", 90) * 1_000,
    completionHoldMs: configuration.get<number>("completedCueSeconds", 8) * 1_000,
  };
}

function contextsEqual(left: CodingContext, right: CodingContext): boolean {
  return left.state === right.state && left.intensity === right.intensity && left.confidence === right.confidence && left.activeLanguage === right.activeLanguage && left.activeTask === right.activeTask && left.lastActivityAt === right.lastActivityAt;
}
