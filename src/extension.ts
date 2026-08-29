import * as vscode from "vscode";
import { ContextEngine, ContextEngineConfig, DEFAULT_CONTEXT_ENGINE_CONFIG } from "./core/contextEngine";
import { LocalProceduralMusicProvider } from "./core/localProceduralMusicProvider";
import { MusicDirector } from "./core/musicDirector";
import { CodingContext, MUSIC_SOURCES, MUSIC_STYLES, MusicSource, MusicStyle, RemoteProviderId, TerminalAdaptation } from "./core/types";
import { AdaptiveMusicProvider, RemoteProviderSettings } from "./providers/adaptiveMusicProvider";
import { ElevenLabsMusicClient } from "./providers/elevenLabsMusicClient";
import { CacheEntry, GeneratedMusicCache } from "./providers/generatedMusicCache";
import { GoogleLyriaMusicClient } from "./providers/googleLyriaMusicClient";
import { StabilityAudioClient } from "./providers/stabilityAudioClient";
import { ActivityCollector } from "./vscode/activityCollector";
import { MusicSessionController, SessionSettings, stateLabel, styleLabel } from "./vscode/musicSessionController";
import { ProviderCredentialStore } from "./vscode/providerCredentialStore";
import { PlayerControl, WebviewAudioPlayer } from "./vscode/webviewAudioPlayer";

const SECTION = "adaptiveMusic";
type ContextSensitivity = "calm" | "balanced" | "responsive";

export function activate(extensionContext: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Adaptive Music", { log: true });
  output.appendLine("[extension] Adaptive Coding Soundtrack activated");
  const engine = new ContextEngine(readEngineConfig());
  let currentContext: CodingContext = engine.getContext(Date.now());
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const credentials = new ProviderCredentialStore(extensionContext.secrets);
  const cache = new GeneratedMusicCache(
    extensionContext.globalStorageUri.fsPath,
    () => vscode.workspace.getConfiguration(SECTION).get<number>("generatedCacheSizeMb", 250) * 1024 * 1024,
  );
  const provider = new AdaptiveMusicProvider(
    new LocalProceduralMusicProvider(),
    [new ElevenLabsMusicClient(), new GoogleLyriaMusicClient(), new StabilityAudioClient()],
    credentials,
    cache,
    extensionContext.globalState,
    readRemoteProviderSettings,
    (message) => output.appendLine(message),
  );
  let controller: MusicSessionController;
  const player = new WebviewAudioPlayer(
    extensionContext.extensionUri,
    (control: PlayerControl, value?: number) => {
      if (control === "pause") void controller.togglePause(true);
      else if (control === "resume") void controller.togglePause(false);
      else if (control === "stop") controller.stop();
      else if (control === "generate") void vscode.commands.executeCommand("adaptiveMusic.generateCurrentStyle");
      else if (control === "setVolume" && typeof value === "number") void setVolume(controller, value);
    },
    (message) => output.appendLine(`[audio] ${message}`),
  );
  controller = new MusicSessionController(
    new MusicDirector(), provider, player, statusBar,
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
      vscode.commands.registerCommand("adaptiveMusic.__testCue", () => {
        player.playCue("completion", 0.18);
        return true;
      }),
      vscode.commands.registerCommand("adaptiveMusic.__testSetIdle", async () => {
        const context = controller.getContext();
        await controller.onContextChanged({
          ...context,
          state: "idle",
          intensity: 0,
          confidence: 0.95,
          activeTask: false,
          activeExecution: false,
          reason: "No recent editor activity",
        });
        return controller.getPlaybackState();
      }),
      vscode.commands.registerCommand("adaptiveMusic.__testResume", async () => {
        await controller.togglePause(false);
        return controller.getPlaybackState();
      }),
    );
  }

  const collector = new ActivityCollector((event) => {
    currentContext = engine.record(event);
    void controller.onContextChanged(currentContext);
  });
  collector.start();
  const refreshTimer = setInterval(() => {
    const next = engine.getContext(Date.now());
    if (!contextsEqual(currentContext, next)) {
      currentContext = next;
      void controller.onContextChanged(next);
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
    vscode.commands.registerCommand("adaptiveMusic.chooseMusicSource", async () => {
      const selected = await chooseMusicSource(readMusicSource());
      if (!selected) return;
      await vscode.workspace.getConfiguration(SECTION).update("musicSource", selected, vscode.ConfigurationTarget.Global);
      if (selected !== "local" && !(await credentials.get(selected))) {
        const configure = await vscode.window.showInformationMessage(
          `${sourceLabel(selected)} selected. Cached tracks play automatically; paid generation only runs after explicit confirmation.`,
          "Add API Key",
        );
        if (configure === "Add API Key" && await configureProvider(credentials, selected)) await controller.refreshTrack();
      } else if (selected !== "local") {
        void vscode.window.showInformationMessage(
          `${sourceLabel(selected)} selected. No paid request was made. Use “Adaptive Music: Generate and Cache Current Style” when ready.`,
        );
      }
    }),
    vscode.commands.registerCommand("adaptiveMusic.configureProvider", async () => {
      const selected = await chooseRemoteProvider(remoteSourceOrUndefined(readMusicSource()), "Which provider do you want to configure?");
      if (selected && await configureProvider(credentials, selected) && selected === readMusicSource()) await controller.refreshTrack();
    }),
    vscode.commands.registerCommand("adaptiveMusic.testProviderConnection", async () => {
      const selected = await chooseRemoteProvider(remoteSourceOrUndefined(readMusicSource()), "Test which provider?");
      if (!selected) return;
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Testing ${sourceLabel(selected)}…` }, async () => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 30_000);
        try {
          const result = await provider.testConnection(selected, abort.signal);
          void vscode.window.showInformationMessage(`${sourceLabel(selected)}: ${result}`);
        } catch (error) {
          void vscode.window.showErrorMessage(`${sourceLabel(selected)} connection failed: ${safeUiError(error)}`);
        } finally {
          clearTimeout(timer);
        }
      });
    }),
    vscode.commands.registerCommand("adaptiveMusic.removeProviderCredentials", async () => {
      const selected = await chooseRemoteProvider(remoteSourceOrUndefined(readMusicSource()), "Remove credentials for which provider?");
      if (!selected) return;
      const confirmation = await vscode.window.showWarningMessage(
        `Remove the saved ${sourceLabel(selected)} API key from VS Code Secret Storage?`,
        { modal: true },
        "Remove",
      );
      if (confirmation === "Remove") {
        await credentials.delete(selected);
        void vscode.window.showInformationMessage(`${sourceLabel(selected)} API key removed.`);
      }
    }),
    vscode.commands.registerCommand("adaptiveMusic.generateCurrentStyle", async () => {
      const source = readMusicSource();
      if (source === "local") {
        void vscode.window.showInformationMessage("Choose an AI music source before generating a track.");
        return;
      }
      if (!controller.isActive()) {
        void vscode.window.showInformationMessage("Start an Adaptive Music session and choose a style first.");
        return;
      }
      if (!(await credentials.get(source))) {
        const action = await vscode.window.showWarningMessage(
          `${sourceLabel(source)} has no saved API key.`,
          "Add API Key",
        );
        if (action === "Add API Key") await configureProvider(credentials, source);
        return;
      }
      const settings = readRemoteProviderSettings();
      const request = controller.getCurrentRequest();
      const client = provider.getClient(source);
      if (!client) {
        void vscode.window.showErrorMessage(`The ${sourceLabel(source)} adapter is unavailable.`);
        return;
      }
      const existing = await cache.get({
        provider: source,
        model: client.model,
        style: request.style,
        durationSeconds: settings.durationSeconds,
      });
      const action = await vscode.window.showWarningMessage(
        `${existing ? "Replace the cached" : "Generate and cache a"} ${settings.durationSeconds}-second ${styleLabel(request.style)} track with ${sourceLabel(source)}? This uses provider credits. Only musical settings and your optional custom prompt suffix are sent.`,
        { modal: true },
        existing ? "Replace Cached Track" : "Generate Track",
      );
      if (!action) return;
      const abort = new AbortController();
      try {
        const track = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Generating ${styleLabel(request.style)} with ${sourceLabel(source)}…`,
            cancellable: true,
          },
          async (_progress, token) => {
            token.onCancellationRequested(() => abort.abort());
            return controller.generateCurrentTrack(abort.signal);
          },
        );
        void vscode.window.showInformationMessage(
          `${track.title} was generated by ${track.providerLabel}, cached locally, and is now playing.`,
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          void vscode.window.showInformationMessage("Music generation cancelled.");
        } else {
          void vscode.window.showErrorMessage(`Music generation failed: ${safeUiError(error)}`);
        }
      }
    }),
    vscode.commands.registerCommand("adaptiveMusic.previewGenerationPrompt", async () => {
      if (!controller.isActive()) {
        void vscode.window.showInformationMessage("Start an Adaptive Music session and choose a style first.");
        return;
      }
      const source = readMusicSource();
      if (source === "local") {
        void vscode.window.showInformationMessage("Choose an AI music source to preview its generation prompt.");
        return;
      }
      const prompt = provider.previewPrompt(controller.getCurrentRequest());
      const document = await vscode.workspace.openTextDocument({
        language: "plaintext",
        content: [
          `Provider: ${sourceLabel(source)}`,
          `Style: ${styleLabel(controller.getStyle())}`,
          "No editor content, file paths, terminal commands, or terminal output are included.",
          "",
          prompt,
        ].join("\n"),
      });
      await vscode.window.showTextDocument(document, { preview: true });
    }),
    vscode.commands.registerCommand("adaptiveMusic.showGeneratedCache", async () => {
      const entries = await cache.list();
      if (entries.length === 0) {
        void vscode.window.showInformationMessage("The generated music cache is empty.");
        return;
      }
      const selected = await vscode.window.showQuickPick(
        entries.map((entry) => cacheQuickPickItem(entry)),
        { placeHolder: `${entries.length} cached generated track${entries.length === 1 ? "" : "s"}. Select one to inspect or delete.` },
      );
      if (!selected) return;
      const action = await vscode.window.showInformationMessage(
        `${selected.label} — ${selected.description}. Generated ${new Date(selected.entry.createdAt).toLocaleString()}.`,
        { modal: true },
        "Delete Track",
      );
      if (action !== "Delete Track") return;
      controller.stop();
      await cache.remove(selected.entry.key);
      void vscode.window.showInformationMessage(`${selected.label} was removed from the local cache.`);
    }),
    vscode.commands.registerCommand("adaptiveMusic.clearGeneratedCache", async () => {
      const stats = await cache.stats();
      if (stats.tracks === 0) {
        void vscode.window.showInformationMessage("The generated music cache is already empty.");
        return;
      }
      const confirmation = await vscode.window.showWarningMessage(
        `Delete ${stats.tracks} cached generated track${stats.tracks === 1 ? "" : "s"} (${formatBytes(stats.bytes)})?`,
        { modal: true },
        "Clear Cache",
      );
      if (confirmation === "Clear Cache") {
        controller.stop();
        await cache.clear();
        void vscode.window.showInformationMessage("Generated music cache cleared.");
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(SECTION)) return;
      engine.updateConfig(readEngineConfig());
      controller.updateSettings(readSessionSettings());
      currentContext = engine.getContext(Date.now());
      if (event.affectsConfiguration(`${SECTION}.musicSource`) || event.affectsConfiguration(`${SECTION}.generatedTrackDurationSeconds`)) {
        void controller.refreshTrack();
      } else {
        void controller.onContextChanged(currentContext);
      }
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

function readMusicSource(): MusicSource {
  const configured = vscode.workspace.getConfiguration(SECTION).get<string>("musicSource", "local");
  return MUSIC_SOURCES.includes(configured as MusicSource) ? configured as MusicSource : "local";
}

function readRemoteProviderSettings(): RemoteProviderSettings {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  return {
    source: readMusicSource(),
    durationSeconds: configuration.get<number>("generatedTrackDurationSeconds", 30),
    timeoutSeconds: configuration.get<number>("remoteRequestTimeoutSeconds", 300),
    dailyGenerationLimit: configuration.get<number>("remoteDailyGenerationLimit", 1),
    customPromptSuffix: configuration.get<string>("customPromptSuffix", ""),
  };
}

function readSessionSettings(): SessionSettings {
  const configuration = vscode.workspace.getConfiguration(SECTION);
  return {
    volume: configuration.get<number>("volume", 0.45),
    adaptiveSwitching: configuration.get<boolean>("adaptiveSwitching", true),
    fadeDurationMs: configuration.get<number>("fadeDurationMs", 1_400),
    minimumAdaptiveConfidence: configuration.get<number>("minimumAdaptiveConfidence", 0.65),
    completionCueCooldownMs: configuration.get<number>("completionCueCooldownSeconds", 20) * 1_000,
    eventCueVolume: configuration.get<number>("eventCueVolume", 0.18),
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
    terminalAdaptation: readTerminalAdaptation(),
    terminalMinimumDurationMs: configuration.get<number>("terminalMinimumDurationSeconds", 5) * 1_000,
  };
}

function readSensitivity(): ContextSensitivity {
  const value = vscode.workspace.getConfiguration(SECTION).get<string>("contextSensitivity", "balanced");
  return value === "calm" || value === "responsive" ? value : "balanced";
}

function readTerminalAdaptation(): TerminalAdaptation {
  const value = vscode.workspace.getConfiguration(SECTION).get<string>("terminalAdaptation", "longRunningOnly");
  return value === "off" || value === "all" ? value : "longRunningOnly";
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
    left.lastExecution?.id === right.lastExecution?.id &&
    left.reason === right.reason &&
    left.lastActivityAt === right.lastActivityAt
  );
}

async function chooseMusicSource(current: MusicSource): Promise<MusicSource | undefined> {
  const descriptions: Record<MusicSource, string> = {
    local: "Free, offline procedural audio; no account required",
    elevenlabs: "ElevenLabs Music v2; paid Music API access required",
    "google-lyria": "Google Lyria 3 Pro Preview; paid-tier Gemini API access required",
    stability: "Stable Audio 3; each new generation uses Stability credits",
  };
  const selected = await vscode.window.showQuickPick(MUSIC_SOURCES.map((source) => ({
    label: source === current ? `$(check) ${sourceLabel(source)}` : sourceLabel(source),
    description: descriptions[source],
    source,
  })), { placeHolder: "Choose a soundtrack source" });
  return selected?.source;
}

async function chooseRemoteProvider(current: RemoteProviderId | undefined, placeHolder: string): Promise<RemoteProviderId | undefined> {
  const providers: RemoteProviderId[] = ["elevenlabs", "google-lyria", "stability"];
  const selected = await vscode.window.showQuickPick(providers.map((provider) => ({
    label: provider === current ? `$(check) ${sourceLabel(provider)}` : sourceLabel(provider),
    provider,
  })), { placeHolder });
  return selected?.provider;
}

async function configureProvider(credentials: ProviderCredentialStore, provider: RemoteProviderId): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    title: `${sourceLabel(provider)} API Key`,
    prompt: "The key is stored in VS Code Secret Storage and is never written to settings or logs.",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => value.trim().length >= 8 ? undefined : "Enter a valid API key.",
  });
  if (key === undefined) return false;
  await credentials.store(provider, key.trim());
  void vscode.window.showInformationMessage(`${sourceLabel(provider)} API key saved. Run “Adaptive Music: Test Provider Connection” to verify access.`);
  return true;
}

function remoteSourceOrUndefined(source: MusicSource): RemoteProviderId | undefined {
  return source === "local" ? undefined : source;
}

function sourceLabel(source: MusicSource): string {
  const labels: Record<MusicSource, string> = {
    local: "Local Procedural",
    elevenlabs: "ElevenLabs",
    "google-lyria": "Google Lyria",
    stability: "Stability AI",
  };
  return labels[source];
}

function safeUiError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider error.";
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CacheQuickPickItem extends vscode.QuickPickItem {
  entry: CacheEntry;
}

function cacheQuickPickItem(entry: CacheEntry): CacheQuickPickItem {
  return {
    label: `${styleLabel(entry.style)} · ${sourceLabel(entry.provider)}`,
    description: `${entry.durationSeconds}s · ${formatBytes(entry.byteLength)}`,
    detail: `${entry.model} · last used ${new Date(entry.lastAccessedAt).toLocaleString()}`,
    entry,
  };
}
