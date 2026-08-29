import { MusicRequest, RemoteProviderId } from "../core/types";

export interface RemoteGenerationRequest {
  music: MusicRequest;
  prompt: string;
  durationSeconds: number;
}

export interface RemoteGenerationResult {
  bytes: Uint8Array;
  mimeType: "audio/mpeg";
  providerAssetId?: string;
}

export interface RemoteMusicClient {
  readonly id: RemoteProviderId;
  readonly label: string;
  readonly model: string;
  generate(request: RemoteGenerationRequest, apiKey: string, signal: AbortSignal): Promise<RemoteGenerationResult>;
  testConnection(apiKey: string, signal: AbortSignal): Promise<string>;
}

export type FetchLike = typeof fetch;
