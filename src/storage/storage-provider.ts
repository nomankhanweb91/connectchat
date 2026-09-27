import type { ReadStream } from 'node:fs';

/** Storage provider contract; message services depend on this interface, not a disk path. */
export interface StorageProvider {
  put(tempPath: string, storageKey: string): Promise<void>;
  openReadStream(storageKey: string): ReadStream;
  delete(storageKey: string): Promise<void>;
}

