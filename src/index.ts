// Types & contracts
export type {
  AudioSource,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptSegment,
  TranscriptWord,
  Transcriber,
  SummarizeOptions,
  SummaryResult,
  SummaryStyle,
  Summarizer,
} from './types/index.js';

export {
  AudioIntelligenceError,
  TranscriptionError,
  SummarizationError,
} from './types/index.js';

// Providers
export * from './transcribers/index.js';
export * from './summarizers/index.js';

// Pipeline
export { AudioIntelligencePipeline } from './pipeline.js';
export type {
  PipelineConfig,
  ProcessOptions,
  ProcessResult,
} from './pipeline.js';

// Utilities (exposed for advanced use)
export { chunkText, estimateTokens } from './utils/chunking.js';

// Storage backends + factory
export {
  LocalOutputStore,
  S3OutputStore,
  SQLiteOutputStore,
  createStorageFromEnv,
} from './storage/index.js';
export type {
  OutputStore,
  OutputRecord,
  SaveResult,
  LocalOutputStoreConfig,
  S3OutputStoreConfig,
  SQLiteOutputStoreConfig,
} from './storage/index.js';
