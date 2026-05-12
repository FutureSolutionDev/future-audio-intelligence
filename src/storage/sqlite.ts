import type { OutputRecord, OutputStore, SaveResult, ListOptions } from './types.js';

export interface SQLiteOutputStoreConfig {
  /** Path to the SQLite DB file. Default: ./audio-intelligence.db */
  dbPath?: string;
}

type DB = import('bun:sqlite').Database;

/**
 * Stores outputs in SQLite using Bun's built-in bun:sqlite (zero extra deps).
 *
 * Table: audio_outputs
 *   id, audio_name, processed_at,
 *   transcript, language, duration_sec,
 *   transcriber_provider, transcriber_model,
 *   summary, action_items, topics,
 *   summarizer_provider, summarizer_model,
 *   input_tokens, output_tokens,
 *   result_json   ← full OutputRecord JSON (used for getById / list)
 */
export class SQLiteOutputStore implements OutputStore {
  private readonly dbPath: string;
  private db: DB | null = null;

  constructor(config: SQLiteOutputStoreConfig = {}) {
    this.dbPath = config.dbPath ?? './audio-intelligence.db';
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private getDb(): DB {
    if (this.db) return this.db;

    const { Database } = require('bun:sqlite') as typeof import('bun:sqlite');
    this.db = new Database(this.dbPath, { create: true });
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audio_outputs (
        id                   TEXT PRIMARY KEY,
        audio_name           TEXT NOT NULL,
        processed_at         TEXT NOT NULL,
        transcript           TEXT NOT NULL,
        language             TEXT,
        duration_sec         REAL,
        transcriber_provider TEXT,
        transcriber_model    TEXT,
        summary              TEXT,
        action_items         TEXT,
        topics               TEXT,
        summarizer_provider  TEXT,
        summarizer_model     TEXT,
        input_tokens         INTEGER,
        output_tokens        INTEGER,
        result_json          TEXT NOT NULL
      )
    `);
    return this.db;
  }

  private rowToRecord(row: any): OutputRecord {
    const data = JSON.parse(row.result_json);
    return {
      id:            row.id,
      audioName:     row.audio_name,
      processedAt:   new Date(row.processed_at),
      transcription: data.transcription,
      summary:       data.summary,
    };
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async save(record: OutputRecord): Promise<SaveResult> {
    const db = this.getDb();
    const { transcription, summary } = record;

    db.prepare(`
      INSERT INTO audio_outputs (
        id, audio_name, processed_at,
        transcript, language, duration_sec,
        transcriber_provider, transcriber_model,
        summary, action_items, topics,
        summarizer_provider, summarizer_model,
        input_tokens, output_tokens,
        result_json
      ) VALUES (
        $id, $audioName, $processedAt,
        $transcript, $language, $durationSec,
        $transcriberProvider, $transcriberModel,
        $summary, $actionItems, $topics,
        $summarizerProvider, $summarizerModel,
        $inputTokens, $outputTokens,
        $resultJson
      )
    `).run({
      $id:                  record.id,
      $audioName:           record.audioName,
      $processedAt:         record.processedAt.toISOString(),
      $transcript:          transcription.text,
      $language:            transcription.language           ?? null,
      $durationSec:         transcription.durationSec        ?? null,
      $transcriberProvider: transcription.provider,
      $transcriberModel:    transcription.model              ?? null,
      $summary:             summary?.summary                 ?? null,
      $actionItems:         summary?.actionItems ? JSON.stringify(summary.actionItems) : null,
      $topics:              summary?.topics      ? JSON.stringify(summary.topics)      : null,
      $summarizerProvider:  summary?.provider                ?? null,
      $summarizerModel:     summary?.model                   ?? null,
      $inputTokens:         summary?.usage?.inputTokens      ?? null,
      $outputTokens:        summary?.usage?.outputTokens     ?? null,
      $resultJson:          JSON.stringify({ transcription, summary }),
    });

    return {
      backend:  'sqlite',
      id:       record.id,
      location: `sqlite:id=${record.id} db=${this.dbPath}`,
    };
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  async getById(id: string): Promise<OutputRecord | null> {
    const row = this.getDb()
      .prepare('SELECT * FROM audio_outputs WHERE id = $id')
      .get({ $id: id }) as any;
    return row ? this.rowToRecord(row) : null;
  }

  async list(options: ListOptions = {}): Promise<OutputRecord[]> {
    const limit  = options.limit  ?? 50;
    const offset = options.offset ?? 0;

    const rows = this.getDb()
      .prepare('SELECT * FROM audio_outputs ORDER BY processed_at DESC LIMIT $limit OFFSET $offset')
      .all({ $limit: limit, $offset: offset }) as any[];

    return rows.map((r) => this.rowToRecord(r));
  }
}
