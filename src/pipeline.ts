import { basename, extname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  AudioSource,
  SummarizeOptions,
  Summarizer,
  SummaryResult,
  TranscribeOptions,
  Transcriber,
  TranscriptionResult,
} from './types/index.js';
import type { OutputStore, OutputRecord, SaveResult } from './storage/types.js';

export interface StoreOptions {
  /** Include timestamped segments (one per sentence). Default: false */
  includeSegments?: boolean;
  /** Include word-level timestamps. Default: false */
  includeWords?: boolean;
  /** Include raw provider response. Default: false */
  includeRaw?: boolean;
}

export interface PipelineConfig {
  transcriber: Transcriber;
  summarizer?: Summarizer;
  storage?: OutputStore;
  /** Controls what gets persisted. Defaults to minimal set. */
  storeOptions?: StoreOptions;
}

export interface ProcessOptions {
  transcribe?:  TranscribeOptions;
  summarize?:   SummarizeOptions;
  skipSummary?: boolean;
}

export interface ProcessResult {
  transcription: TranscriptionResult;
  summary?:      SummaryResult;
  saved?:        SaveResult;
}

export class AudioIntelligencePipeline {
  constructor(private readonly config: PipelineConfig) {}

  async process(source: AudioSource, options: ProcessOptions = {}): Promise<ProcessResult> {
    const transcription = await this.config.transcriber.transcribe(source, options.transcribe);

    let summary: SummaryResult | undefined;
    if (!options.skipSummary && this.config.summarizer && transcription.text.trim()) {
      summary = await this.config.summarizer.summarize(transcription.text, {
        outputLanguage: transcription.language,
        ...options.summarize,
      });
    }

    const result: ProcessResult = { transcription, summary };

    if (this.config.storage) {
      const record = buildRecord(
        uuidv4(),
        extractAudioName(source),
        transcription,
        summary,
        this.config.storeOptions,
      );
      result.saved = await this.config.storage.save(record);
    }

    return result;
  }

  transcribe(source: AudioSource, options?: TranscribeOptions) {
    return this.config.transcriber.transcribe(source, options);
  }

  summarize(text: string, options?: SummarizeOptions) {
    if (!this.config.summarizer) throw new Error('No summarizer configured on this pipeline');
    return this.config.summarizer.summarize(text, options);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRecord(
  id: string,
  audioName: string,
  transcription: TranscriptionResult,
  summary: SummaryResult | undefined,
  opts: StoreOptions = {},
): OutputRecord {
  const { includeSegments = false, includeWords = false, includeRaw = false } = opts;

  return {
    id,
    audioName,
    processedAt: new Date(),
    transcription: {
      text:        transcription.text,
      language:    transcription.language,
      durationSec: transcription.durationSec,
      usage:       transcription.usage,
      provider:    transcription.provider,
      model:       transcription.model,
      segments:    includeSegments ? transcription.segments : undefined,
      words:       includeWords    ? transcription.words    : undefined,
      raw:         includeRaw      ? transcription.raw      : undefined,
    },
    summary: summary && {
      summary:     summary.summary,
      actionItems: summary.actionItems,
      topics:      summary.topics,
      provider:    summary.provider,
      model:       summary.model,
      usage:       summary.usage,
      raw:         includeRaw ? summary.raw : undefined,
    },
  };
}

function extractAudioName(source: AudioSource): string {
  switch (source.type) {
    case 'path': {
      const base = basename(source.path);
      const ext  = extname(base);
      return ext ? base.slice(0, -ext.length) : base;
    }
    case 'url': {
      const segment = source.url.split('/').pop()?.split('?')[0] ?? 'audio';
      const ext     = extname(segment);
      return ext ? segment.slice(0, -ext.length) : segment;
    }
    case 'buffer': {
      const name = source.filename ?? 'audio';
      const ext  = extname(name);
      return ext ? name.slice(0, -ext.length) : name;
    }
    case 'blob':
      return 'audio';
  }
}
