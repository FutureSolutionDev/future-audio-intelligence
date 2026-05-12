export type { OutputRecord, SaveResult, OutputStore, ListOptions } from './types.js';

export { LocalOutputStore }  from './local.js';
export type { LocalOutputStoreConfig }  from './local.js';

export { S3OutputStore }     from './s3.js';
export type { S3OutputStoreConfig }     from './s3.js';

export { SQLiteOutputStore } from './sqlite.js';
export type { SQLiteOutputStoreConfig } from './sqlite.js';

import { LocalOutputStore }  from './local.js';
import { S3OutputStore }     from './s3.js';
import { SQLiteOutputStore } from './sqlite.js';
import type { OutputStore }  from './types.js';

/**
 * Factory — reads AUDIO_STORAGE env var and returns the correct backend.
 *
 * AUDIO_STORAGE=local   (default)
 *   AUDIO_OUTPUT_DIR    → output directory (default: ./outputs)
 *
 * AUDIO_STORAGE=s3
 *   S3_BUCKET, S3_REGION          → required
 *   S3_PREFIX                     → optional (default: audio-intelligence/)
 *   AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (or IAM role)
 *   Requires: bun add @aws-sdk/client-s3
 *
 * AUDIO_STORAGE=sqlite
 *   SQLITE_PATH         → path to .db file (default: ./audio-intelligence.db)
 */
export function createStorageFromEnv(): OutputStore {
  const backend = (process.env.AUDIO_STORAGE ?? 'local').toLowerCase();

  switch (backend) {
    case 'local':
      return new LocalOutputStore({ outputDir: process.env.AUDIO_OUTPUT_DIR ?? './outputs' });

    case 's3':
      return new S3OutputStore({
        bucket:          process.env.S3_BUCKET!,
        region:          process.env.S3_REGION!,
        prefix:          process.env.S3_PREFIX,
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

    case 'sqlite':
      return new SQLiteOutputStore({ dbPath: process.env.SQLITE_PATH ?? './audio-intelligence.db' });

    default:
      throw new Error(`Unknown AUDIO_STORAGE value: "${backend}". Valid: local, s3, sqlite`);
  }
}
