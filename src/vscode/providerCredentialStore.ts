import * as vscode from "vscode";
import { RemoteProviderId } from "../core/types";
import { ProviderCredentialReader } from "../providers/adaptiveMusicProvider";

const PREFIX = "adaptiveMusic.providerKey.";

export class ProviderCredentialStore implements ProviderCredentialReader {
  public constructor(private readonly secrets: vscode.SecretStorage) {}

  public async get(provider: RemoteProviderId): Promise<string | undefined> {
    return this.secrets.get(`${PREFIX}${provider}`);
  }

  public store(provider: RemoteProviderId, apiKey: string): Thenable<void> {
    return this.secrets.store(`${PREFIX}${provider}`, apiKey);
  }

  public delete(provider: RemoteProviderId): Thenable<void> {
    return this.secrets.delete(`${PREFIX}${provider}`);
  }
}
