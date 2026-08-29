import { MusicRequest, MusicalIntent, MusicStyle } from "../core/types";

const INTENT_DESCRIPTION: Record<MusicalIntent, string> = {
  rest: "quiet rest",
  flow: "steady creative flow",
  focus: "deep, distraction-free focus",
  anticipation: "calm anticipation while a task runs",
  review: "careful review and reflection",
  celebration: "a restrained sense of completion",
};

interface StylePromptProfile {
  identity: string;
  instrumentation: string;
  production: string;
  exclusions: string;
}

const STYLE_PROMPTS: Record<MusicStyle, StylePromptProfile> = {
  ambient: {
    identity: "minimal, spacious ambient music with very slow harmonic movement",
    instrumentation: "slowly evolving warm pads, soft felt piano fragments, subtle organic texture, and no prominent beat",
    production: "wide but gentle stereo image, soft transients, restrained low end, and smooth continuous dynamics",
    exclusions: "cinematic climax, trailer percussion, arpeggiator ostinatos, dramatic risers, or sudden new sections",
  },
  jazz: {
    identity: "restrained cool jazz for concentration with a light, natural swing",
    instrumentation: "small acoustic quartet with warm piano comping in extended seventh and ninth voicings, upright bass, brushed drum kit, and sparse muted trumpet phrases",
    production: "intimate late-1950s small-club recording, close and warm with subtle tape character and understated dynamics",
    exclusions: "synth pads, electronic drums, cinematic strings, smooth-jazz saxophone, virtuosic solos, or a big-band arrangement",
  },
  lofi: {
    identity: "mellow instrumental lo-fi hip-hop for sustained concentration",
    instrumentation: "dusty electric piano chords, warm rounded bass, soft swung drums, restrained guitar fragments, and subtle tape texture",
    production: "cozy near-field mix with gentle saturation, softened transients, light vinyl texture, and stable dynamics",
    exclusions: "trap hi-hat rolls, aggressive sub-bass, bright EDM synths, vocal chops, dramatic drops, or abrupt beat switches",
  },
};

export function buildMusicPrompt(request: MusicRequest, durationSeconds: number, customSuffix = ""): string {
  const duration = Math.round(durationSeconds);
  const profile = STYLE_PROMPTS[request.style];
  const prompt = [
    `Create a ${duration}-second seamless instrumental background track for focused coding.`,
    `Style: ${profile.identity}.`,
    `Instrumentation: ${profile.instrumentation}.`,
    `Production: ${profile.production}.`,
    `Mood: ${INTENT_DESCRIPTION[request.intent]}.`,
    `Tempo: about ${Math.round(request.tempoBpm)} BPM. Energy: ${describe(request.energy)}.`,
    `Complexity: ${describe(request.complexity)}. Brightness: ${describe(request.brightness)}.`,
    `Exclude ${profile.exclusions}.`,
    "No vocals, speech, lyrics, artist imitation, recognizable existing melodies, sudden silence, or dramatic ending.",
    "Keep the arrangement sparse and non-distracting, with a bar-aligned ending that loops naturally into the opening.",
  ];
  const suffix = normalizeCustomSuffix(customSuffix);
  if (suffix) prompt.push(`Additional user direction: ${suffix}`);
  return prompt.join(" ");
}

function describe(value: number): string {
  if (value < 0.34) return "low";
  if (value < 0.67) return "medium";
  return "high";
}

function normalizeCustomSuffix(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 600);
}
