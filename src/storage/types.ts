import type { TranscriptionResult, SummaryResult } from '../types/index.js';

export interface OutputRecord {
  id: string;
  audioName: string;
  processedAt: Date;
  transcription: TranscriptionResult;
  summary?: SummaryResult;
}

export interface SaveResult {
  backend: 'local' | 's3' | 'sqlite';
  id: string;
  /** Local → directory path. S3 → s3://bucket/prefix/id/. SQLite → row id. */
  location: string;
}

export interface ListOptions {
  limit?: number;
  /** SQLite only — skip N rows. */
  offset?: number;
}

export interface OutputStore {
  save(record: OutputRecord): Promise<SaveResult>;
  getById(id: string): Promise<OutputRecord | null>;
  list(options?: ListOptions): Promise<OutputRecord[]>;
}
