import { expectOk, readJson, readMp3 } from "./http";
import { FetchLike, RemoteGenerationRequest, RemoteGenerationResult, RemoteMusicClient } from "./types";

const API_ROOT = "https://api.elevenlabs.io/v1";

export class ElevenLabsMusicClient implements RemoteMusicClient {
  public readonly id = "elevenlabs" as const;
  public readonly label = "ElevenLabs";
  public readonly model = "music_v2";

  public constructor(private readonly fetcher: FetchLike = fetch) {}

  public async generate(request: RemoteGenerationRequest, apiKey: string, signal: AbortSignal): Promise<RemoteGenerationResult> {
    const response = await this.fetcher(`${API_ROOT}/music/stream?output_format=mp3_48000_192`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        prompt: request.prompt,
        music_length_ms: Math.round(request.durationSeconds * 1_000),
        model_id: this.model,
        force_instrumental: true,
      }),
      signal,
    });
    const bytes = await readMp3(response, this.label);
    return { bytes, mimeType: "audio/mpeg", providerAssetId: response.headers.get("song-id") ?? undefined };
  }

  public async testConnection(apiKey: string, signal: AbortSignal): Promise<string> {
    const response = await this.fetcher(`${API_ROOT}/user/subscription`, { headers: { "xi-api-key": apiKey }, signal });
    const data = await readJson(await expectOk(response, this.label), this.label) as { tier?: unknown };
    return typeof data.tier === "string" ? `Connected (${data.tier} tier).` : "Connected to ElevenLabs.";
  }
}
