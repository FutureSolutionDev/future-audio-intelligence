import type { OutputRecord, OutputStore, SaveResult, ListOptions } from './types.js';
import { buildReport } from './report.js';

export interface S3OutputStoreConfig {
  bucket: string;
  region: string;
  /** Key prefix inside the bucket. Default: 'audio-intelligence/' */
  prefix?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

// S3 SDK loaded dynamically — no hard dependency at build time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = new (...args: any[]) => any;
interface S3Sdk {
  client: { send(cmd: any): Promise<any> };
  Put:  AnyClass;
  Get:  AnyClass;
  List: AnyClass;
}

/**
 * Stores each operation under: s3://{bucket}/{prefix}{id}/
 *   result.json, transcript.txt, summary.txt, segments.json, words.json, report.md
 *
 * Requires:  bun add @aws-sdk/client-s3
 * Env vars:  S3_BUCKET, S3_REGION, S3_PREFIX (opt), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
export class S3OutputStore implements OutputStore {
  private readonly config: S3OutputStoreConfig;
  private sdk: S3Sdk | null = null;

  constructor(config: S3OutputStoreConfig) {
    if (!config.bucket) throw new Error('S3OutputStore: bucket is required');
    if (!config.region) throw new Error('S3OutputStore: region is required');
    this.config = config;
  }

  private async getSdk(): Promise<S3Sdk> {
    if (this.sdk) return this.sdk;
    let mod: any;
    try {
      // Variable prevents TypeScript from statically resolving the module.
      const pkg = '@aws-sdk/client-s3';
      mod = await import(pkg);
    } catch {
      throw new Error('S3OutputStore requires @aws-sdk/client-s3:\n  bun add @aws-sdk/client-s3');
    }
    this.sdk = {
      client: new mod.S3Client({
        region: this.config.region,
        credentials: this.config.accessKeyId
          ? { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey! }
          : undefined,
      }),
      Put:  mod.PutObjectCommand,
      Get:  mod.GetObjectCommand,
      List: mod.ListObjectsV2Command,
    };
    return this.sdk;
  }

  private keyPrefix(id: string) {
    return (this.config.prefix ?? 'audio-intelligence/') + id + '/';
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async save(record: OutputRecord): Promise<SaveResult> {
    const { client, Put } = await this.getSdk();
    const prefix = this.keyPrefix(record.id);
    const { transcription, summary } = record;

    const files: Array<{ key: string; body: string; contentType: string }> = [
      {
        key:         prefix + 'result.json',
        body:        JSON.stringify({ id: record.id, audioName: record.audioName, processedAt: record.processedAt, transcription, summary }, null, 2),
        contentType: 'application/json',
      },
      {
        key:         prefix + 'transcript.txt',
        body:        transcription.text,
        contentType: 'text/plain; charset=utf-8',
      },
      {
        key:         prefix + 'report.md',
        body:        buildReport(record),
        contentType: 'text/markdown; charset=utf-8',
      },
    ];

    if (summary) {
      const lines = [summary.summary];
      if (summary.actionItems?.length) {
        lines.push('\n--- Action Items ---');
        summary.actionItems.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
      }
      files.push({ key: prefix + 'summary.txt', body: lines.join('\n'), contentType: 'text/plain; charset=utf-8' });
    }
    if (transcription.segments?.length) {
      files.push({ key: prefix + 'segments.json', body: JSON.stringify(transcription.segments, null, 2), contentType: 'application/json' });
    }
    if (transcription.words?.length) {
      files.push({ key: prefix + 'words.json', body: JSON.stringify(transcription.words, null, 2), contentType: 'application/json' });
    }

    await Promise.all(
      files.map((f) =>
        client.send(new Put({ Bucket: this.config.bucket, Key: f.key, Body: f.body, ContentType: f.contentType })),
      ),
    );

    return {
      backend:  's3',
      id:       record.id,
      location: `s3://${this.config.bucket}/${prefix}`,
    };
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  async getById(id: string): Promise<OutputRecord | null> {
    const { client, Get } = await this.getSdk();
    const key = this.keyPrefix(id) + 'result.json';
    try {
      const res  = await client.send(new Get({ Bucket: this.config.bucket, Key: key }));
      const body = await res.Body!.transformToString('utf-8');
      const raw  = JSON.parse(body);
      return {
        id:            raw.id,
        audioName:     raw.audioName,
        processedAt:   new Date(raw.processedAt),
        transcription: raw.transcription,
        summary:       raw.summary,
      };
    } catch {
      return null;
    }
  }

  async list(options: ListOptions = {}): Promise<OutputRecord[]> {
    const { client, List, Get } = await this.getSdk();
    const rootPrefix = this.config.prefix ?? 'audio-intelligence/';

    const listRes = await client.send(
      new List({
        Bucket:    this.config.bucket,
        Prefix:    rootPrefix,
        Delimiter: '/',
        MaxKeys:   options.limit ?? 50,
      }),
    );

    const prefixes = (listRes.CommonPrefixes ?? [])
      .map((p: any) => p.Prefix as string)
      .filter(Boolean);

    const records = await Promise.all(
      prefixes.map(async (prefix: string) => {
        try {
          const res  = await client.send(new Get({ Bucket: this.config.bucket, Key: prefix + 'result.json' }));
          const body = await res.Body!.transformToString('utf-8');
          const raw  = JSON.parse(body);
          return {
            id:            raw.id,
            audioName:     raw.audioName,
            processedAt:   new Date(raw.processedAt),
            transcription: raw.transcription,
            summary:       raw.summary,
          } as OutputRecord;
        } catch {
          return null;
        }
      }),
    );

    return (records.filter(Boolean) as OutputRecord[])
      .sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime());
  }
}
