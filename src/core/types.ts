export const CODING_STATES = ["idle", "active_coding", "deep_focus", "waiting", "reviewing", "completed"] as const;
export type CodingState = (typeof CODING_STATES)[number];

export const MUSIC_STYLES = ["ambient", "jazz", "lofi"] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number];

export interface CodingContext {
  state: CodingState;
  intensity: number;
  confidence: number;
  activeLanguage?: string;
  activeTask: boolean;
  activeExecution: boolean;
  diagnosticErrors: number;
  diagnosticWarnings: number;
  reason: string;
  lastActivityAt: number;
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

export interface Track {
  id: string;
  title: string;
  artist: string;
  style: MusicStyle;
  source: "procedural";
  synthesis: ProceduralSynthesis;
}

export interface MusicProvider { getTrack(request: MusicRequest): Promise<Track>; }

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
