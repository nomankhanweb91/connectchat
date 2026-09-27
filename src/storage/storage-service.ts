import path from 'node:path';
import { env } from '../config/env';
import { LocalFilesystemStorageProvider } from './local-filesystem-storage';
import type { StorageProvider } from './storage-provider';

export class StorageService {
  constructor(private readonly provider: StorageProvider) {}
  put(tempPath: string, key: string) { return this.provider.put(tempPath, key); }
  openReadStream(key: string) { return this.provider.openReadStream(key); }
  delete(key: string) { return this.provider.delete(key); }
}

export const storageService = new StorageService(new LocalFilesystemStorageProvider(path.resolve(env.UPLOAD_STORAGE_DIR)));

