import type { OutputRecord, OutputStore, SaveResult, ListOptions } from './types.js';

export interface SQLiteOutputStoreConfig {
  /** Path to the SQLite DB file. Default: ./audio-intelligence.db */
  dbPath?: string;
}

// Minimal interface — matches both bun:sqlite and better-sqlite3 APIs.
interface SQLiteDB {
  run(sql: string): void;
  prepare(sql: string): SQLiteStmt;
}
interface SQLiteStmt {
  run(params: Record<string, unknown>): void;
  get(params: Record<string, unknown>): unknown;
  all(params: Record<string, unknown>): unknown[];
}

const CREATE_TABLE = `
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
`;

/**
 * Stores outputs in SQLite.
 *
 * Runtime detection (automatic):
 *   Bun  → bun:sqlite       (built-in, zero deps)
 *   Node → better-sqlite3   (install: npm i better-sqlite3 @types/better-sqlite3)
 */
export class SQLiteOutputStore implements OutputStore {
  private readonly dbPath: string;
  private db: SQLiteDB | null = null;

  constructor(config: SQLiteOutputStoreConfig = {}) {
    this.dbPath = config.dbPath ?? './audio-intelligence.db';
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private getDb(): SQLiteDB {
    if (this.db) return this.db;

    const isBun = typeof (globalThis as any).Bun !== 'undefined';

    if (isBun) {
      // Bun built-in — no install needed.
      const pkg = 'bun:sqlite';
      const { Database } = require(pkg) as typeof import('bun:sqlite');
      const db = new Database(this.dbPath, { create: true });
      db.run(CREATE_TABLE);
      this.db = db as unknown as SQLiteDB;
    } else {
      // Node.js — requires: npm i better-sqlite3
      let Database: any;
      try {
        Database = require('better-sqlite3');
      } catch {
        throw new Error(
          'SQLiteOutputStore on Node.js requires better-sqlite3:\n  npm i better-sqlite3',
        );
      }
      const db = new Database(this.dbPath);
      db.exec(CREATE_TABLE);
      // better-sqlite3 uses db.exec() not db.run() for DDL
      this.db = {
        run:     (sql: string) => db.exec(sql),
        prepare: (sql: string) => db.prepare(sql),
      };
    }

    return this.db!;
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
      .get({ $id: id });
    return row ? this.rowToRecord(row) : null;
  }

  async list(options: ListOptions = {}): Promise<OutputRecord[]> {
    const limit  = options.limit  ?? 50;
    const offset = options.offset ?? 0;

    const rows = this.getDb()
      .prepare('SELECT * FROM audio_outputs ORDER BY processed_at DESC LIMIT $limit OFFSET $offset')
      .all({ $limit: limit, $offset: offset });

    return rows.map((r) => this.rowToRecord(r));
  }
}
