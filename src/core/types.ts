export const CODING_STATES = ["idle", "active_coding", "deep_focus", "waiting", "reviewing", "completed"] as const;
export type CodingState = (typeof CODING_STATES)[number];

export const MUSIC_STYLES = ["ambient", "jazz", "lofi"] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number];

export const MUSIC_SOURCES = ["local", "elevenlabs", "google-lyria", "stability"] as const;
export type MusicSource = (typeof MUSIC_SOURCES)[number];
export type RemoteProviderId = Exclude<MusicSource, "local">;

export interface CodingContext {
  state: CodingState;
  intensity: number;
  confidence: number;
  activeLanguage?: string;
  activeTask: boolean;
  activeExecution: boolean;
  diagnosticErrors: number;
  diagnosticWarnings: number;
  lastExecution?: ExecutionSummary;
  reason: string;
  lastActivityAt: number;
}

export type TerminalAdaptation = "off" | "longRunningOnly" | "all";
export type PlaybackCue = "completion" | "failure";

export interface ExecutionSummary {
  id: number;
  source: ExecutionSource;
  outcome: ExecutionOutcome;
  completedAt: number;
  durationMs?: number;
  cue?: PlaybackCue;
}

export type ActivityKind =
  | "edit"
  | "save"
  | "navigation"
  | "task_started"
  | "task_completed"
  | "terminal_opened"
  | "terminal_closed"
  | "terminal_command_started"
  | "terminal_command_completed"
  | "debug_started"
  | "debug_completed"
  | "diagnostics_changed"
  | "window_focused"
  | "window_blurred";

export type ExecutionOutcome = "success" | "failure" | "unknown";
export type ExecutionSource = "task" | "terminal" | "debug";

export interface ActivityEvent {
  kind: ActivityKind;
  at: number;
  language?: string;
  outcome?: ExecutionOutcome;
  durationMs?: number;
  diagnosticErrors?: number;
  diagnosticWarnings?: number;
}

export type MusicalIntent = "rest" | "flow" | "focus" | "anticipation" | "review" | "celebration";
export interface UserPreference { style: MusicStyle; }

export interface MusicRequest {
  style: MusicStyle;
  codingState: CodingState;
  intent: MusicalIntent;
  energy: number;
  complexity: number;
  stability: number;
  brightness: number;
  tempoBpm: number;
  shouldPlay: boolean;
}

export type TrackTexture = "air" | "brushes" | "tape";
export interface ProceduralSynthesis {
  tempoBpm: number;
  rootMidi: number;
  scale: number[];
  chordProgression: number[][];
  texture: TrackTexture;
  rhythmDensity: number;
  melodyDensity: number;
  warmth: number;
  swing: number;
  humanize: number;
  reverb: number;
  lowpassHz: number;
  variationSeed: number;
}

interface BaseTrack {
  id: string;
  title: string;
  artist: string;
  style: MusicStyle;
}

export interface ProceduralTrack extends BaseTrack {
  source: "procedural";
  synthesis: ProceduralSynthesis;
  remoteFallback?: RemoteFallback;
}

export type RemoteFallbackReason = "no_cache" | "cache_error";

export interface RemoteFallback {
  provider: RemoteProviderId;
  providerLabel: string;
  reason: RemoteFallbackReason;
  message: string;
}

export interface GeneratedTrackAdaptation {
  energy: number;
  brightness: number;
  tempoBpm: number;
  rootMidi: number;
}

export interface GeneratedAudioTrack extends BaseTrack {
  source: "generated";
  provider: RemoteProviderId;
  providerLabel: string;
  model: string;
  assetId: string;
  audioFilePath: string;
  mimeType: "audio/mpeg";
  durationSeconds: number;
  cacheHit: boolean;
  generatedAt: number;
  adaptation: GeneratedTrackAdaptation;
}

export type Track = ProceduralTrack | GeneratedAudioTrack;

export interface MusicProvider {
  getTrack(request: MusicRequest, signal?: AbortSignal): Promise<Track>;
  generateTrack?(request: MusicRequest, signal?: AbortSignal): Promise<GeneratedAudioTrack>;
}

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
