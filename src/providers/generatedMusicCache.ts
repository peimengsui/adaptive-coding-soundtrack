import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { MusicStyle, RemoteProviderId } from "../core/types";

const INDEX_VERSION = 1;

export interface CacheDescriptor {
  provider: RemoteProviderId;
  model: string;
  style: MusicStyle;
  durationSeconds: number;
}

export interface CacheEntry extends CacheDescriptor {
  key: string;
  filePath: string;
  byteLength: number;
  createdAt: number;
  lastAccessedAt: number;
}

interface CacheIndex {
  version: number;
  entries: Record<string, Omit<CacheEntry, "filePath">>;
}

export interface CacheStats {
  tracks: number;
  bytes: number;
}

export class GeneratedMusicCache {
  private readonly cacheDirectory: string;
  private readonly indexPath: string;

  public constructor(rootDirectory: string, private readonly maxBytes: () => number) {
    this.cacheDirectory = path.join(rootDirectory, "generated-music-v1");
    this.indexPath = path.join(this.cacheDirectory, "index.json");
  }

  public keyFor(descriptor: CacheDescriptor): string {
    const stable = [
      descriptor.provider,
      descriptor.model,
      descriptor.style,
      Math.round(descriptor.durationSeconds),
    ].join(":");
    return createHash("sha256").update(stable).digest("hex").slice(0, 32);
  }

  public async get(descriptor: CacheDescriptor): Promise<CacheEntry | undefined> {
    const index = await this.readIndex();
    const key = this.keyFor(descriptor);
    const stored = index.entries[key] ?? Object.values(index.entries)
      .filter((entry) => this.matchesDescriptor(entry, descriptor))
      .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)[0];
    if (!stored) return undefined;
    const filePath = this.audioPath(stored.key);
    try {
      const stat = await fs.stat(filePath);
      stored.byteLength = stat.size;
      stored.lastAccessedAt = Date.now();
      await this.writeIndex(index);
      return { ...stored, filePath };
    } catch (error) {
      if (isMissing(error)) {
        delete index.entries[stored.key];
        await this.writeIndex(index);
        return undefined;
      }
      throw error;
    }
  }

  public async put(descriptor: CacheDescriptor, bytes: Uint8Array): Promise<CacheEntry> {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    const index = await this.readIndex();
    const key = this.keyFor(descriptor);
    const filePath = this.audioPath(key);
    const temporaryPath = `${filePath}.tmp`;
    await fs.writeFile(temporaryPath, bytes);
    await fs.rename(temporaryPath, filePath);
    const now = Date.now();
    const stored: Omit<CacheEntry, "filePath"> = {
      ...descriptor,
      key,
      byteLength: bytes.byteLength,
      createdAt: now,
      lastAccessedAt: now,
    };
    for (const existing of Object.values(index.entries)) {
      if (existing.key === key || !this.matchesDescriptor(existing, descriptor)) continue;
      await fs.rm(this.audioPath(existing.key), { force: true });
      delete index.entries[existing.key];
    }
    index.entries[key] = stored;
    await this.enforceLimit(index, key);
    await this.writeIndex(index);
    return { ...stored, filePath };
  }

  public async clear(): Promise<void> {
    await fs.rm(this.cacheDirectory, { recursive: true, force: true });
  }

  public async stats(): Promise<CacheStats> {
    const index = await this.readIndex();
    const entries = Object.values(index.entries);
    return { tracks: entries.length, bytes: entries.reduce((total, entry) => total + entry.byteLength, 0) };
  }

  public async list(): Promise<CacheEntry[]> {
    const index = await this.readIndex();
    const entries: CacheEntry[] = [];
    let indexChanged = false;
    for (const stored of Object.values(index.entries).sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)) {
      const filePath = this.audioPath(stored.key);
      try {
        const stat = await fs.stat(filePath);
        if (stored.byteLength !== stat.size) {
          stored.byteLength = stat.size;
          indexChanged = true;
        }
        entries.push({ ...stored, filePath });
      } catch (error) {
        if (!isMissing(error)) throw error;
        delete index.entries[stored.key];
        indexChanged = true;
      }
    }
    if (indexChanged) await this.writeIndex(index);
    return entries;
  }

  public async remove(key: string): Promise<boolean> {
    const index = await this.readIndex();
    if (!index.entries[key]) return false;
    await fs.rm(this.audioPath(key), { force: true });
    delete index.entries[key];
    await this.writeIndex(index);
    return true;
  }

  private async enforceLimit(index: CacheIndex, protectedKey: string): Promise<void> {
    const limit = Math.max(1, this.maxBytes());
    let total = Object.values(index.entries).reduce((sum, entry) => sum + entry.byteLength, 0);
    const oldest = Object.values(index.entries)
      .filter((entry) => entry.key !== protectedKey)
      .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
    for (const entry of oldest) {
      if (total <= limit) break;
      await fs.rm(this.audioPath(entry.key), { force: true });
      delete index.entries[entry.key];
      total -= entry.byteLength;
    }
  }

  private async readIndex(): Promise<CacheIndex> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.indexPath, "utf8")) as Partial<CacheIndex>;
      if (parsed.version === INDEX_VERSION && parsed.entries && typeof parsed.entries === "object") {
        return { version: INDEX_VERSION, entries: parsed.entries };
      }
    } catch (error) {
      if (!isMissing(error) && !(error instanceof SyntaxError)) throw error;
    }
    return { version: INDEX_VERSION, entries: {} };
  }

  private async writeIndex(index: CacheIndex): Promise<void> {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    await fs.writeFile(this.indexPath, `${JSON.stringify(index, undefined, 2)}\n`, "utf8");
  }

  private audioPath(key: string): string {
    return path.join(this.cacheDirectory, `${key}.mp3`);
  }

  private matchesDescriptor(entry: Omit<CacheEntry, "filePath">, descriptor: CacheDescriptor): boolean {
    return (
      entry.provider === descriptor.provider &&
      entry.model === descriptor.model &&
      entry.style === descriptor.style &&
      Math.round(entry.durationSeconds) === Math.round(descriptor.durationSeconds)
    );
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}
