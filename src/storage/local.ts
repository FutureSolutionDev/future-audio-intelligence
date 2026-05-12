import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { OutputRecord, OutputStore, SaveResult, ListOptions } from './types.js';

export interface LocalOutputStoreConfig {
  /** Directory where JSON files are stored. Default: ./outputs */
  outputDir?: string;
}

/**
 * Stores each operation as a single JSON file:
 *   {outputDir}/{id}.json
 *
 * One file = one record. Simple read, simple write, simple list.
 */
export class LocalOutputStore implements OutputStore {
  private readonly outputDir: string;

  constructor(config: LocalOutputStoreConfig = {}) {
    this.outputDir = config.outputDir ?? './outputs';
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async save(record: OutputRecord): Promise<SaveResult> {
    mkdirSync(this.outputDir, { recursive: true });

    const filePath = join(this.outputDir, `${record.id}.json`);
    writeFileSync(
      filePath,
      JSON.stringify({ ...record, processedAt: record.processedAt.toISOString() }, null, 2),
      'utf8',
    );

    return { backend: 'local', id: record.id, location: filePath };
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  async getById(id: string): Promise<OutputRecord | null> {
    const filePath = join(this.outputDir, `${id}.json`);
    if (!existsSync(filePath)) return null;
    try {
      return this.parse(readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  async list(options: ListOptions = {}): Promise<OutputRecord[]> {
    if (!existsSync(this.outputDir)) return [];

    const files = readdirSync(this.outputDir)
      .filter((f) => f.endsWith('.json'));

    const records: OutputRecord[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.outputDir, file), 'utf8');
        records.push(this.parse(raw));
      } catch {
        // skip corrupted files
      }
    }

    records.sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime());

    const { limit, offset = 0 } = options;
    return limit != null ? records.slice(offset, offset + limit) : records.slice(offset);
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private parse(raw: string): OutputRecord {
    const data = JSON.parse(raw);
    const processedAt = new Date(data.processedAt);
    if (isNaN(processedAt.getTime())) throw new Error(`Invalid processedAt: ${data.processedAt}`);
    if (!data.id || !data.transcription)  throw new Error('Missing required fields');
    return { ...data, processedAt };
  }
}
