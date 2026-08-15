import { CodingContext, MusicRequest, MusicStyle, MusicalIntent, UserPreference, clamp, roundToHundredth } from "./types";

interface StateProfile {
  intent: MusicalIntent;
  energy: number;
  complexity: number;
  stability: number;
  brightness: number;
  tempoOffset: number;
  shouldPlay: boolean;
}

const STATE_PROFILES: Record<CodingContext["state"], StateProfile> = {
  idle: { intent: "rest", energy: 0, complexity: 0.05, stability: 1, brightness: 0.2, tempoOffset: -12, shouldPlay: false },
  active_coding: { intent: "flow", energy: 0.48, complexity: 0.42, stability: 0.72, brightness: 0.55, tempoOffset: 2, shouldPlay: true },
  deep_focus: { intent: "focus", energy: 0.4, complexity: 0.22, stability: 0.95, brightness: 0.42, tempoOffset: -4, shouldPlay: true },
  waiting: { intent: "anticipation", energy: 0.38, complexity: 0.5, stability: 0.58, brightness: 0.62, tempoOffset: 0, shouldPlay: true },
  reviewing: { intent: "review", energy: 0.3, complexity: 0.3, stability: 0.82, brightness: 0.45, tempoOffset: -6, shouldPlay: true },
  completed: { intent: "celebration", energy: 0.72, complexity: 0.5, stability: 0.4, brightness: 0.9, tempoOffset: 10, shouldPlay: true },
};

const STYLE_TEMPO: Record<MusicStyle, number> = { ambient: 62, jazz: 82, lofi: 72 };

export class MusicDirector {
  public createRequest(context: CodingContext, preference: UserPreference): MusicRequest {
    const profile = STATE_PROFILES[context.state];
    const influence = context.intensity * (context.state === "completed" ? 0.12 : 0.2);
    return {
      style: preference.style,
      codingState: context.state,
      intent: profile.intent,
      energy: roundToHundredth(clamp(profile.energy + influence)),
      complexity: roundToHundredth(clamp(profile.complexity + context.intensity * 0.08)),
      stability: profile.stability,
      brightness: roundToHundredth(clamp(profile.brightness + context.intensity * 0.05)),
      tempoBpm: Math.round(STYLE_TEMPO[preference.style] + profile.tempoOffset),
      shouldPlay: profile.shouldPlay,
    };
  }
}
