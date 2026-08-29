import { LocalProceduralMusicProvider } from "../core/localProceduralMusicProvider";
import {
  GeneratedAudioTrack,
  MusicProvider,
  MusicRequest,
  MusicSource,
  MusicStyle,
  RemoteProviderId,
  Track,
} from "../core/types";
import { abortError } from "./http";
import { GeneratedMusicCache, CacheDescriptor, CacheEntry } from "./generatedMusicCache";
import { buildMusicPrompt } from "./promptBuilder";
import { RemoteMusicClient } from "./types";

const STYLE_ROOT: Record<MusicStyle, number> = { ambient: 48, jazz: 45, lofi: 48 };
const STYLE_LABEL: Record<MusicStyle, string> = { ambient: "Ambient", jazz: "Jazz", lofi: "Lo-fi" };

export interface ProviderCredentialReader {
  get(provider: RemoteProviderId): Promise<string | undefined>;
}

export interface ProviderStateStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface RemoteProviderSettings {
  source: MusicSource;
  durationSeconds: number;
  timeoutSeconds: number;
  dailyGenerationLimit: number;
  customPromptSuffix: string;
}

export class AdaptiveMusicProvider implements MusicProvider {
  private readonly clients: Map<RemoteProviderId, RemoteMusicClient>;
  private lastFallbackDiagnostic?: string;

  public constructor(
    private readonly local: LocalProceduralMusicProvider,
    clients: RemoteMusicClient[],
    private readonly credentials: ProviderCredentialReader,
    private readonly cache: GeneratedMusicCache,
    private readonly state: ProviderStateStore,
    private readonly readSettings: () => RemoteProviderSettings,
    private readonly diagnostic: (message: string) => void,
  ) {
    this.clients = new Map(clients.map((client) => [client.id, client]));
  }

  public async getTrack(request: MusicRequest, signal?: AbortSignal): Promise<Track> {
    const settings = this.readSettings();
    if (settings.source === "local") {
      this.lastFallbackDiagnostic = undefined;
      return this.local.getTrack(request, signal);
    }
    signal?.throwIfAborted();
    const client = this.clients.get(settings.source);
    if (!client) return this.local.getTrack(request, signal);
    const descriptor = this.cacheDescriptor(request, client, settings);

    try {
      const cached = await this.cache.get(descriptor);
      if (cached) {
        this.lastFallbackDiagnostic = undefined;
        return this.generatedTrack(request, client, cached, true);
      }
      return this.fallback(
        request,
        client,
        "no_cache",
        `No cached ${styleLabel(request.style)} track is available. Run Adaptive Music: Generate and Cache Current Style to use ${client.label}.`,
        signal,
      );
    } catch (error) {
      if (signal?.aborted || isAbort(error) && signal?.aborted) throw abortError();
      return this.fallback(
        request,
        client,
        "cache_error",
        `The generated-audio cache could not be read: ${safeProviderError(error)}`,
        signal,
      );
    }
  }

  public async generateTrack(request: MusicRequest, signal?: AbortSignal): Promise<GeneratedAudioTrack> {
    const settings = this.readSettings();
    if (settings.source === "local") throw new Error("Choose ElevenLabs, Google Lyria, or Stability AI before generating a track.");
    signal?.throwIfAborted();
    const client = this.clients.get(settings.source);
    if (!client) throw new Error(`Unknown provider: ${settings.source}.`);
    const descriptor = this.cacheDescriptor(request, client, settings);
    const apiKey = await this.credentials.get(client.id);
    if (!apiKey) throw new Error(`${client.label} has no saved API key.`);
    if (!this.hasGenerationBudget(client.id, settings.dailyGenerationLimit)) {
      throw new Error(`${client.label} daily generation limit reached. Cached playback does not count toward the limit.`);
    }

    const timed = timedSignal(signal, Math.max(10, settings.timeoutSeconds) * 1_000);
    try {
      this.diagnostic(`[provider] Explicitly generating ${descriptor.style} with ${client.label}; no editor content is included`);
      await this.recordGeneration(client.id);
      const result = await client.generate({
        music: request,
        prompt: buildMusicPrompt(request, descriptor.durationSeconds, settings.customPromptSuffix),
        durationSeconds: descriptor.durationSeconds,
      }, apiKey, timed.signal);
      signal?.throwIfAborted();
      const entry = await this.cache.put(descriptor, result.bytes);
      this.lastFallbackDiagnostic = undefined;
      return this.generatedTrack(request, client, entry, false);
    } catch (error) {
      if (signal?.aborted || isAbort(error) && signal?.aborted) throw abortError();
      throw new Error(`${client.label}: ${safeProviderError(error)}`);
    } finally {
      timed.dispose();
    }
  }

  public previewPrompt(request: MusicRequest): string {
    const settings = this.readSettings();
    return buildMusicPrompt(request, clampDuration(settings.durationSeconds), settings.customPromptSuffix);
  }

  public async testConnection(provider: RemoteProviderId, signal: AbortSignal): Promise<string> {
    const client = this.clients.get(provider);
    if (!client) throw new Error(`Unknown provider: ${provider}.`);
    const key = await this.credentials.get(provider);
    if (!key) throw new Error(`No API key is saved for ${client.label}.`);
    return client.testConnection(key, signal);
  }

  public getClient(provider: RemoteProviderId): RemoteMusicClient | undefined {
    return this.clients.get(provider);
  }

  private generatedTrack(request: MusicRequest, client: RemoteMusicClient, entry: CacheEntry, cacheHit: boolean): GeneratedAudioTrack {
    return {
      id: `generated-${entry.key}`,
      assetId: entry.key,
      title: `${STYLE_LABEL[request.style]} AI Soundtrack`,
      artist: `${client.label} Music`,
      style: request.style,
      source: "generated",
      provider: client.id,
      providerLabel: client.label,
      model: client.model,
      audioFilePath: entry.filePath,
      mimeType: "audio/mpeg",
      durationSeconds: entry.durationSeconds,
      cacheHit,
      generatedAt: entry.createdAt,
      adaptation: {
        energy: request.energy,
        brightness: request.brightness,
        tempoBpm: request.tempoBpm,
        rootMidi: STYLE_ROOT[request.style] + (request.intent === "celebration" ? 2 : 0),
      },
    };
  }

  private async fallback(
    request: MusicRequest,
    client: RemoteMusicClient,
    reason: "no_cache" | "cache_error",
    message: string,
    signal?: AbortSignal,
  ): Promise<Track> {
    signal?.throwIfAborted();
    const diagnostic = `[provider] ${message} Playing local procedural audio.`;
    if (diagnostic !== this.lastFallbackDiagnostic) {
      this.diagnostic(diagnostic);
      this.lastFallbackDiagnostic = diagnostic;
    }
    const local = await this.local.getTrack(request, signal);
    if (local.source !== "procedural") return local;
    return {
      ...local,
      remoteFallback: { provider: client.id, providerLabel: client.label, reason, message },
    };
  }

  private cacheDescriptor(
    request: MusicRequest,
    client: RemoteMusicClient,
    settings: RemoteProviderSettings,
  ): CacheDescriptor {
    return {
      provider: client.id,
      model: client.model,
      style: request.style,
      durationSeconds: clampDuration(settings.durationSeconds),
    };
  }

  private hasGenerationBudget(provider: RemoteProviderId, limit: number): boolean {
    if (limit === 0) return true;
    return this.state.get<number>(budgetKey(provider), 0) < limit;
  }

  private async recordGeneration(provider: RemoteProviderId): Promise<void> {
    const key = budgetKey(provider);
    await this.state.update(key, this.state.get<number>(key, 0) + 1);
  }
}

function budgetKey(provider: RemoteProviderId): string {
  const date = new Date().toISOString().slice(0, 10);
  return `adaptiveMusic.remoteGenerations.${date}.${provider}`;
}

function clampDuration(value: number): number {
  return Math.min(360, Math.max(30, Math.round(value)));
}

function styleLabel(style: MusicStyle): string {
  return STYLE_LABEL[style];
}

function timedSignal(parent: AbortSignal | undefined, milliseconds: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("The provider request timed out.")), milliseconds);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function safeProviderError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "request timed out or was cancelled.";
    return error.message.replace(/(Bearer|key|token)\s+[A-Za-z0-9._-]+/gi, "$1 [redacted]");
  }
  return "provider request failed.";
}
