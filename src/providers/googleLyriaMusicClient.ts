import { readJson, readMp3 } from "./http";
import { FetchLike, RemoteGenerationRequest, RemoteGenerationResult, RemoteMusicClient } from "./types";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export class GoogleLyriaMusicClient implements RemoteMusicClient {
  public readonly id = "google-lyria" as const;
  public readonly label = "Google Lyria";
  public readonly model = "lyria-3-pro-preview";

  public constructor(private readonly fetcher: FetchLike = fetch) {}

  public async generate(request: RemoteGenerationRequest, apiKey: string, signal: AbortSignal): Promise<RemoteGenerationResult> {
    const response = await this.fetcher(`${API_ROOT}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ model: this.model, input: request.prompt, response_format: { type: "audio" } }),
      signal,
    });
    const data = await readJson(response, this.label);
    const encoded = findAudioBlock(data);
    if (!encoded) throw new Error(`${this.label} returned no audio block.`);
    const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
    const syntheticResponse = new Response(bytes, { status: 200 });
    return { bytes: await readMp3(syntheticResponse, this.label), mimeType: "audio/mpeg" };
  }

  public async testConnection(apiKey: string, signal: AbortSignal): Promise<string> {
    const response = await this.fetcher(`${API_ROOT}/models?pageSize=1000`, { headers: { "x-goog-api-key": apiKey }, signal });
    const data = await readJson(response, this.label) as { models?: Array<{ name?: unknown }> };
    const available = data.models?.some((model) => model.name === `models/${this.model}` || model.name === this.model);
    if (!available) throw new Error(`${this.label} connected, but ${this.model} is not enabled for this key.`);
    return `Connected; ${this.model} is available.`;
  }
}

function findAudioBlock(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const steps = (data as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return undefined;
  for (const step of steps) {
    if (!step || typeof step !== "object" || (step as { type?: unknown }).type !== "model_output") continue;
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: unknown }).type === "audio" && typeof (block as { data?: unknown }).data === "string") {
        return (block as { data: string }).data;
      }
    }
  }
  return undefined;
}
