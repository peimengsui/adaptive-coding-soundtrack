import * as vscode from "vscode";
import { ContextEngine, ContextEngineConfig, DEFAULT_CONTEXT_ENGINE_CONFIG } from "./core/contextEngine";
import { LocalProceduralMusicProvider } from "./core/localProceduralMusicProvider";
import { MusicDirector } from "./core/musicDirector";
import { CodingContext, MUSIC_STYLES, MusicStyle } from "./core/types";
import { ActivityCollector } from "./vscode/activityCollector";
import { MusicSessionController, SessionSettings, stateLabel, styleLabel } from "./vscode/musicSessionController";
import { PlayerControl, WebviewAudioPlayer } from "./vscode/webviewAudioPlayer";

const SECTION = "adaptiveMusic";
type ContextSensitivity = "calm" | "balanced" | "responsive";

export function activate(extensionContext: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Adaptive Music", { log: true });
  output.appendLine("[extension] Adaptive Coding Soundtrack activated");
  const engine = new ContextEngine(readEngineConfig());
  let currentContext: CodingContext = engine.getContext(Date.now());
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  let controller: MusicSessionController;
  const player = new WebviewAudioPlayer(
    extensionContext.extensionUri,
    (control: PlayerControl, value?: number) => {
      if (control === "pause") void controller.togglePause(true);
      else if (control === "resume") void controller.togglePause(false);
      else if (control === "stop") controller.stop();
      else if (control === "setVolume" && typeof value === "number") void setVolume(controller, value);
    },
    (message) => output.appendLine(`[audio] ${message}`),
  );
  controller = new MusicSessionController(
    new MusicDirector(), new LocalProceduralMusicProvider(), player, statusBar,
    currentContext, readSessionSettings(), output,
  );
  if (extensionContext.extensionMode === vscode.ExtensionMode.Test) {
    extensionContext.subscriptions.push(
      vscode.commands.registerCommand("adaptiveMusic.__testStart", async () => {
        await controller.start("ambient");
        return controller.isActive();
      }),
      vscode.commands.registerCommand("adaptiveMusic.__testStop", () => {
        controller.stop();
        return !controller.isActive();
      }),
    );
  }

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
    collector, controller, output, { dispose: () => clearInterval(refreshTimer) },
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
        context.activeExecution ? "execution running" : undefined,
        context.diagnosticErrors > 0 ? `${context.diagnosticErrors} diagnostic errors` : undefined,
        context.reason,
      ].filter(Boolean).join(" · ");
      void vscode.window.showInformationMessage(`Adaptive Music: ${detail}`);
    }),
    vscode.commands.registerCommand("adaptiveMusic.calibrateSensitivity", async () => {
      const current = readSensitivity();
      const selected = await vscode.window.showQuickPick(
        [
          { label: "Responsive", description: "Faster state changes and fewer edits required", value: "responsive" as const },
          { label: "Balanced", description: "Recommended default", value: "balanced" as const },
          { label: "Calm", description: "Slower, steadier transitions", value: "calm" as const },
        ].map((item) => ({ ...item, picked: item.value === current })),
        { placeHolder: "How quickly should the soundtrack react?" },
      );
      if (selected) {
        await vscode.workspace.getConfiguration(SECTION).update("contextSensitivity", selected.value, vscode.ConfigurationTarget.Global);
      }
    }),
    vscode.commands.registerCommand("adaptiveMusic.showDiagnostics", () => output.show(true)),
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
    minimumAdaptiveConfidence: configuration.get<number>("minimumAdaptiveConfidence", 0.65),
  };
}

function readEngineConfig(): ContextEngineConfig {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  const sensitivity = readSensitivity();
  const factor = sensitivity === "responsive" ? 0.75 : sensitivity === "calm" ? 1.25 : 1;
  return {
    ...DEFAULT_CONTEXT_ENGINE_CONFIG,
    idleTimeoutMs: configuration.get<number>("idleTimeoutSeconds", 120) * 1_000,
    waitingTimeoutMs: configuration.get<number>("waitingDetectionSeconds", 8) * 1_000 * factor,
    deepFocusDurationMs: configuration.get<number>("deepFocusSeconds", 90) * 1_000 * factor,
    completionHoldMs: configuration.get<number>("completedCueSeconds", 8) * 1_000,
    activeEditCount: sensitivity === "responsive" ? 2 : sensitivity === "calm" ? 4 : 3,
    editWindowMs: DEFAULT_CONTEXT_ENGINE_CONFIG.editWindowMs / factor,
    transitionDebounceMs: configuration.get<number>("transitionDebounceMs", 1_500) * factor,
    unfocusedIdleTimeoutMs: configuration.get<number>("unfocusedIdleSeconds", 30) * 1_000,
  };
}

function readSensitivity(): ContextSensitivity {
  const value = vscode.workspace.getConfiguration(SECTION).get<string>("contextSensitivity", "balanced");
  return value === "calm" || value === "responsive" ? value : "balanced";
}

function contextsEqual(left: CodingContext, right: CodingContext): boolean {
  return (
    left.state === right.state &&
    left.intensity === right.intensity &&
    left.confidence === right.confidence &&
    left.activeLanguage === right.activeLanguage &&
    left.activeTask === right.activeTask &&
    left.activeExecution === right.activeExecution &&
    left.diagnosticErrors === right.diagnosticErrors &&
    left.diagnosticWarnings === right.diagnosticWarnings &&
    left.reason === right.reason &&
    left.lastActivityAt === right.lastActivityAt
  );
}
