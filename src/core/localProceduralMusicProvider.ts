import { MusicProvider, MusicRequest, MusicStyle, Track, TrackTexture, clamp } from "./types";

interface StyleProfile {
  rootMidi: number;
  scale: number[];
  texture: TrackTexture;
  progression: number[][];
  warmth: number;
}

const STYLE_PROFILES: Record<MusicStyle, StyleProfile> = {
  ambient: { rootMidi: 48, scale: [0, 2, 4, 7, 9], texture: "air", progression: [[0, 7, 14], [4, 11, 16], [9, 16, 21], [7, 14, 19]], warmth: 0.7 },
  jazz: { rootMidi: 45, scale: [0, 2, 3, 5, 7, 9, 10], texture: "brushes", progression: [[0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]], warmth: 0.82 },
  lofi: { rootMidi: 48, scale: [0, 2, 3, 5, 7, 8, 10], texture: "tape", progression: [[0, 3, 7, 10], [8, 12, 15, 19], [5, 8, 12, 15], [7, 10, 14, 17]], warmth: 0.92 },
};

const DISPLAY_STYLE: Record<MusicStyle, string> = { ambient: "Ambient", jazz: "Jazz", lofi: "Lo-fi" };

export class LocalProceduralMusicProvider implements MusicProvider {
  public async getTrack(request: MusicRequest): Promise<Track> {
    const profile = STYLE_PROFILES[request.style];
    const band = request.energy < 0.4 ? "low" : request.energy < 0.7 ? "mid" : "high";
    const intentTitle = request.intent.charAt(0).toUpperCase() + request.intent.slice(1);
    return {
      id: `${request.style}-${request.intent}-${band}`,
      title: `${DISPLAY_STYLE[request.style]} ${intentTitle}`,
      artist: "Adaptive Procedural Ensemble",
      style: request.style,
      source: "procedural",
      synthesis: {
        tempoBpm: request.tempoBpm,
        rootMidi: profile.rootMidi + (request.intent === "celebration" ? 2 : 0),
        scale: [...profile.scale],
        chordProgression: profile.progression.map((chord) => [...chord]),
        texture: profile.texture,
        rhythmDensity: clamp(request.energy * (request.style === "ambient" ? 0.25 : 1)),
        melodyDensity: clamp(request.complexity * (request.intent === "focus" ? 0.55 : 1)),
        warmth: profile.warmth,
      },
    };
  }
}
