/**
 * Audio source: file path, URL, Buffer, or Blob.
 * Providers handle conversion internally.
 */
export type AudioSource =
  | { type: 'path'; path: string }
  | { type: 'url'; url: string }
  | { type: 'buffer'; data: Buffer; filename?: string; mimeType?: string }
  | { type: 'blob'; data: Blob };

/**
 * Options passed to any transcriber.
 * Individual providers may ignore options they don't support
 * (e.g. local Whisper has no built-in diarization).
 */
export interface TranscribeOptions {
  /** ISO 639-1 code (e.g. 'ar', 'en'). 'auto' = detect. */
  language?: string | 'auto';
  /** Provider-specific model name. Falls back to provider default. */
  model?: string;
  /** Word-level timestamps in the result. */
  wordTimestamps?: boolean;
  /** Speaker separation (provider-dependent). */
  diarize?: boolean;
  /** Domain terms / proper nouns to boost recognition. */
  vocabulary?: string[];
  /** Optional prompt to steer the model's style. */
  prompt?: string;
  /** Output format hint. Most providers ignore this and return structured data. */
  responseFormat?: 'text' | 'verbose';
}

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number;
  confidence?: number;
  speaker?: string | number;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  speaker?: string | number;
}

export interface TranscriptionResult {
  /** Full transcript as a single string. */
  text: string;
  /** Detected or provided language. */
  language?: string;
  /** Audio duration in seconds, if known. */
  durationSec?: number;
  /** Billing usage — durationSec is the cost unit for all STT providers. */
  usage?: {
    durationSec?: number;
  };
  /** Segment-level breakdown. */
  segments?: TranscriptSegment[];
  /** Word-level timestamps, if requested and supported. */
  words?: TranscriptWord[];
  /** Provider name that produced this. */
  provider: string;
  /** Model used. */
  model?: string;
  /** Raw provider response for advanced use. */
  raw?: unknown;
}

/**
 * Every transcriber implements this interface.
 * Add a new provider = implement this + register it. That's it.
 */
export interface Transcriber {
  readonly name: string;
  transcribe(source: AudioSource, options?: TranscribeOptions): Promise<TranscriptionResult>;
}

// ---------------- Summarization ----------------

export type SummaryStyle =
  | 'brief'         // 2–3 sentences
  | 'bullets'       // bullet points
  | 'detailed'      // multi-paragraph
  | 'action_items'  // extract decisions + TODOs
  | 'meeting_notes' // structured meeting format
  | 'custom';

export interface SummarizeOptions {
  style?: SummaryStyle;
  /** Required when style is 'custom'. Full prompt to use. */
  customPrompt?: string;
  /** Language for the output summary. Defaults to input language. */
  outputLanguage?: string;
  /** Model name override. */
  model?: string;
  /** Hard cap on output tokens. */
  maxTokens?: number;
  /** Extra context / instructions to prepend. */
  context?: string;
  /**
   * For long transcripts: chunk size in characters before
   * the summarizer splits and recursively summarizes. Default 80_000.
   */
  chunkThreshold?: number;
}

export interface SummaryResult {
  summary: string;
  /** Optional extracted action items when style is 'action_items' or 'meeting_notes'. */
  actionItems?: string[];
  /** Optional key topics. */
  topics?: string[];
  provider: string;
  model?: string;
  /** Token usage if reported by the provider. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  raw?: unknown;
}

export interface Summarizer {
  readonly name: string;
  summarize(text: string, options?: SummarizeOptions): Promise<SummaryResult>;
}

// ---------------- Errors ----------------

export class AudioIntelligenceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AudioIntelligenceError';
  }
}

export class TranscriptionError extends AudioIntelligenceError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, 'TRANSCRIPTION_FAILED', provider, cause);
    this.name = 'TranscriptionError';
  }
}

export class SummarizationError extends AudioIntelligenceError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, 'SUMMARIZATION_FAILED', provider, cause);
    this.name = 'SummarizationError';
  }
}
