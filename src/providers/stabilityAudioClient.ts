import { abortableDelay, expectOk, readJson, readMp3 } from "./http";
import { FetchLike, RemoteGenerationRequest, RemoteGenerationResult, RemoteMusicClient } from "./types";

const API_ROOT = "https://api.stability.ai";

export class StabilityAudioClient implements RemoteMusicClient {
  public readonly id = "stability" as const;
  public readonly label = "Stability AI";
  public readonly model = "stable-audio-3";

  public constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly pollDelay: (milliseconds: number, signal: AbortSignal) => Promise<void> = abortableDelay,
    private readonly pollIntervalMs = 10_000,
  ) {}

  public async generate(request: RemoteGenerationRequest, apiKey: string, signal: AbortSignal): Promise<RemoteGenerationResult> {
    const form = new FormData();
    form.append("prompt", request.prompt);
    form.append("output_format", "mp3");
    form.append("duration", String(Math.min(380, Math.max(1, Math.round(request.durationSeconds)))));
    form.append("model", this.model);
    form.append("none", new Blob([]), "none");
    const authorization = { Authorization: `Bearer ${apiKey}` };
    const response = await this.fetcher(`${API_ROOT}/v2beta/audio/stable-audio/text-to-audio`, {
      method: "POST", headers: { ...authorization, accept: "audio/*" }, body: form, signal,
    });
    const data = await readJson(await expectOk(response, this.label), this.label) as { id?: unknown };
    if (typeof data.id !== "string" || data.id.length === 0) throw new Error(`${this.label} returned no generation ID.`);

    while (true) {
      await this.pollDelay(this.pollIntervalMs, signal);
      const result = await this.fetcher(`${API_ROOT}/v2beta/audio/results/${encodeURIComponent(data.id)}`, {
        headers: { ...authorization, accept: "audio/*" }, signal,
      });
      if (result.status === 202) continue;
      return { bytes: await readMp3(result, this.label), mimeType: "audio/mpeg", providerAssetId: data.id };
    }
  }

  public async testConnection(apiKey: string, signal: AbortSignal): Promise<string> {
    const response = await this.fetcher(`${API_ROOT}/v1/user/balance`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    const data = await readJson(response, this.label) as { credits?: unknown };
    return typeof data.credits === "number" ? `Connected; balance: ${data.credits} credits.` : "Connected to Stability AI.";
  }
}
