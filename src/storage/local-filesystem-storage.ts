import { createReadStream } from 'node:fs';
import { constants } from 'node:fs';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider } from './storage-provider';

/** Only generated UUID keys with known image extensions can address files. */
export class LocalFilesystemStorageProvider implements StorageProvider {
  private readonly root: string;
  constructor(root: string) { this.root = path.resolve(root); }

  private resolveKey(key: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(key)) throw new Error('Invalid storage key');
    const resolved = path.resolve(this.root, key);
    if (path.dirname(resolved) !== this.root) throw new Error('Invalid storage key');
    return resolved;
  }

  async put(tempPath: string, storageKey: string): Promise<void> {
    const destination = this.resolveKey(storageKey);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await copyFile(tempPath, destination, constants.COPYFILE_EXCL);
    await unlink(tempPath);
  }

  openReadStream(storageKey: string) { return createReadStream(this.resolveKey(storageKey)); }
  async delete(storageKey: string): Promise<void> {
    try { await unlink(this.resolveKey(storageKey)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

