import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { MusicStyle, RemoteProviderId } from "../core/types";
import { looksLikeMp3 } from "./http";

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

export interface CacheRepairResult {
  removedEntries: number;
  removedTemporaryFiles: number;
  orphanedAudioFiles: number;
  corruptIndexBackedUp: boolean;
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
    const matched = index.entries[key]
      ? [key, index.entries[key]] as const
      : Object.entries(index.entries)
        .filter(([, entry]) => this.matchesDescriptor(entry, descriptor))
        .sort(([, left], [, right]) => right.lastAccessedAt - left.lastAccessedAt)[0];
    if (!matched) return undefined;
    const [indexKey, stored] = matched;
    if (!this.isValidStoredEntry(indexKey, stored)) {
      delete index.entries[indexKey];
      await this.writeIndex(index);
      return undefined;
    }
    const filePath = this.audioPath(stored.key);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size === 0 || !(await this.isValidAudioFile(filePath))) {
        await fs.rm(filePath, { force: true });
        delete index.entries[indexKey];
        await this.writeIndex(index);
        return undefined;
      }
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
    if (!looksLikeMp3(bytes)) throw new Error("Generated music cache only accepts valid MP3 audio.");
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
    const entries = await this.list();
    return { tracks: entries.length, bytes: entries.reduce((total, entry) => total + entry.byteLength, 0) };
  }

  public async list(): Promise<CacheEntry[]> {
    const index = await this.readIndex();
    const entries: CacheEntry[] = [];
    let indexChanged = false;
    for (const [indexKey, stored] of Object.entries(index.entries).sort(([, left], [, right]) => storedAccessTime(right) - storedAccessTime(left))) {
      if (!this.isValidStoredEntry(indexKey, stored)) {
        delete index.entries[indexKey];
        indexChanged = true;
        continue;
      }
      const filePath = this.audioPath(stored.key);
      try {
        const stat = await fs.stat(filePath);
        if (stat.size === 0 || !(await this.isValidAudioFile(filePath))) {
          await fs.rm(filePath, { force: true });
          delete index.entries[indexKey];
          indexChanged = true;
          continue;
        }
        if (stored.byteLength !== stat.size) {
          stored.byteLength = stat.size;
          indexChanged = true;
        }
        entries.push({ ...stored, filePath });
      } catch (error) {
        if (!isMissing(error)) throw error;
        delete index.entries[indexKey];
        indexChanged = true;
      }
    }
    if (indexChanged) await this.writeIndex(index);
    return entries;
  }

  public async remove(key: string): Promise<boolean> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(key)) return false;
    const index = await this.readIndex();
    if (!index.entries[key]) return false;
    await fs.rm(this.audioPath(key), { force: true });
    delete index.entries[key];
    await this.writeIndex(index);
    return true;
  }

  /** Reconciles content-free metadata after interrupted writes without deleting recoverable orphaned MP3s. */
  public async repair(): Promise<CacheRepairResult> {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    const loaded = await this.readIndexWithStatus();
    const index = loaded.index;
    let removedEntries = 0;
    let removedTemporaryFiles = 0;
    let corruptIndexBackedUp = false;

    if (loaded.corrupt) {
      const backupPath = path.join(this.cacheDirectory, `index.corrupt-${Date.now()}.json`);
      try {
        await fs.rename(this.indexPath, backupPath);
        corruptIndexBackedUp = true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }

    for (const [key, stored] of Object.entries(index.entries)) {
      if (!this.isValidStoredEntry(key, stored)) {
        delete index.entries[key];
        removedEntries += 1;
        continue;
      }
      const filePath = this.audioPath(stored.key);
      try {
        if (!(await this.isValidAudioFile(filePath))) {
          await fs.rm(filePath, { force: true });
          delete index.entries[key];
          removedEntries += 1;
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
        delete index.entries[key];
        removedEntries += 1;
      }
    }

    const files = await fs.readdir(this.cacheDirectory);
    const indexedAudio = new Set(Object.values(index.entries).map((entry) => `${entry.key}.mp3`));
    const orphanedAudioFiles = files.filter((file) => file.endsWith(".mp3") && !indexedAudio.has(file)).length;
    for (const file of files) {
      if (!file.endsWith(".tmp")) continue;
      await fs.rm(path.join(this.cacheDirectory, file), { force: true });
      removedTemporaryFiles += 1;
    }

    if (loaded.corrupt || removedEntries > 0 || removedTemporaryFiles > 0) await this.writeIndex(index);
    return { removedEntries, removedTemporaryFiles, orphanedAudioFiles, corruptIndexBackedUp };
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
    return (await this.readIndexWithStatus()).index;
  }

  private async readIndexWithStatus(): Promise<{ index: CacheIndex; corrupt: boolean }> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.indexPath, "utf8")) as Partial<CacheIndex>;
      if (parsed.version === INDEX_VERSION && parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)) {
        return { index: { version: INDEX_VERSION, entries: parsed.entries }, corrupt: false };
      }
      return { index: { version: INDEX_VERSION, entries: {} }, corrupt: true };
    } catch (error) {
      if (isMissing(error)) return { index: { version: INDEX_VERSION, entries: {} }, corrupt: false };
      if (error instanceof SyntaxError) return { index: { version: INDEX_VERSION, entries: {} }, corrupt: true };
      throw error;
    }
  }

  private async writeIndex(index: CacheIndex): Promise<void> {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    const temporaryPath = `${this.indexPath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(index, undefined, 2)}\n`, "utf8");
      await fs.rename(temporaryPath, this.indexPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  private audioPath(key: string): string {
    return path.join(this.cacheDirectory, `${key}.mp3`);
  }

  private matchesDescriptor(entry: unknown, descriptor: CacheDescriptor): entry is Omit<CacheEntry, "filePath"> {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<Omit<CacheEntry, "filePath">>;
    return (
      candidate.provider === descriptor.provider &&
      candidate.model === descriptor.model &&
      candidate.style === descriptor.style &&
      typeof candidate.durationSeconds === "number" &&
      Math.round(candidate.durationSeconds) === Math.round(descriptor.durationSeconds)
    );
  }

  private isValidStoredEntry(key: string, entry: unknown): entry is Omit<CacheEntry, "filePath"> {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as Partial<Omit<CacheEntry, "filePath">>;
    return (
      /^[a-zA-Z0-9_-]{1,128}$/.test(key) && candidate.key === key &&
      typeof candidate.provider === "string" && ["elevenlabs", "google-lyria", "stability"].includes(candidate.provider) &&
      typeof candidate.style === "string" && ["ambient", "jazz", "lofi"].includes(candidate.style) &&
      typeof candidate.model === "string" && candidate.model.length > 0 && candidate.model.length <= 128 &&
      typeof candidate.durationSeconds === "number" && Number.isFinite(candidate.durationSeconds) && candidate.durationSeconds >= 1 && candidate.durationSeconds <= 600 &&
      typeof candidate.byteLength === "number" && Number.isFinite(candidate.byteLength) && candidate.byteLength >= 0 &&
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) &&
      typeof candidate.lastAccessedAt === "number" && Number.isFinite(candidate.lastAccessedAt)
    );
  }

  private async isValidAudioFile(filePath: string): Promise<boolean> {
    const handle = await fs.open(filePath, "r");
    try {
      const bytes = new Uint8Array(4_096);
      const result = await handle.read(bytes, 0, bytes.byteLength, 0);
      return looksLikeMp3(bytes.subarray(0, result.bytesRead));
    } finally {
      await handle.close();
    }
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

function storedAccessTime(value: unknown): number {
  if (!value || typeof value !== "object") return Number.NEGATIVE_INFINITY;
  const timestamp = (value as { lastAccessedAt?: unknown }).lastAccessedAt;
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
