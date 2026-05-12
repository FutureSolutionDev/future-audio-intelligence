/**
 * Build verification test.
 * Imports from dist/ to confirm the compiled output is valid and all exports are present.
 * Run AFTER `bun run build`.
 *
 * NOTE: Each env-sensitive test saves + restores AUDIO_STORAGE via try/finally
 * so that .env values (loaded automatically by Bun) don't bleed between tests.
 */
import { describe, expect, test } from 'bun:test';

// Pre-import the module once — subsequent `import()` calls return the cache.
const distMod = await import('../dist/index.js');

/** Run fn with AUDIO_STORAGE set to `value`, restore original value after. */
function withEnv<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.AUDIO_STORAGE;
  if (value === undefined) {
    delete process.env.AUDIO_STORAGE;
  } else {
    process.env.AUDIO_STORAGE = value;
  }
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.AUDIO_STORAGE;
    } else {
      process.env.AUDIO_STORAGE = original;
    }
  }
}

describe('dist build exports', () => {
  test('main entry exports all expected symbols', () => {
    // Pipeline
    expect(distMod.AudioIntelligencePipeline).toBeFunction();

    // Auto providers
    expect(distMod.AutoFreeToPaidTranscriber).toBeFunction();
    expect(distMod.AutoFreeToPaidSummarizer).toBeFunction();

    // Individual transcribers
    expect(distMod.DeepgramTranscriber).toBeFunction();
    expect(distMod.OpenAITranscriber).toBeFunction();
    expect(distMod.LocalWhisperTranscriber).toBeFunction();

    // Individual summarizers
    expect(distMod.OpenAISummarizer).toBeFunction();
    expect(distMod.OpenRouterSummarizer).toBeFunction();
    expect(distMod.GeminiSummarizer).toBeFunction();
    expect(distMod.OpenAICompatibleSummarizer).toBeFunction();

    // Storage
    expect(distMod.LocalOutputStore).toBeFunction();
    expect(distMod.SQLiteOutputStore).toBeFunction();
    expect(distMod.S3OutputStore).toBeFunction();
    expect(distMod.createStorageFromEnv).toBeFunction();

    // Errors
    expect(distMod.AudioIntelligenceError).toBeFunction();
    expect(distMod.TranscriptionError).toBeFunction();
    expect(distMod.SummarizationError).toBeFunction();

    // Utils
    expect(distMod.chunkText).toBeFunction();
    expect(distMod.estimateTokens).toBeFunction();
  });

  test('createStorageFromEnv() returns LocalOutputStore when AUDIO_STORAGE=local', () => {
    const store = withEnv('local', () => distMod.createStorageFromEnv());
    expect(store).toBeInstanceOf(distMod.LocalOutputStore);
  });

  test('createStorageFromEnv() returns SQLiteOutputStore when AUDIO_STORAGE=sqlite', () => {
    const store = withEnv('sqlite', () => distMod.createStorageFromEnv());
    expect(store).toBeInstanceOf(distMod.SQLiteOutputStore);
  });

  test('createStorageFromEnv() throws on unknown backend', () => {
    expect(() => withEnv('unknown-backend', () => distMod.createStorageFromEnv()))
      .toThrow('unknown-backend');
  });

  test('AudioIntelligencePipeline is instantiable from dist', async () => {
    const mockTranscriber = {
      name: 'mock',
      transcribe: async () => ({
        text: 'test', language: 'ar', durationSec: 5,
        usage: { durationSec: 5 }, provider: 'mock', model: 'v1',
      }),
    };

    const pipeline = new distMod.AudioIntelligencePipeline({ transcriber: mockTranscriber });
    const result   = await pipeline.process({ type: 'path', path: 'fake.mp3' });
    expect(result.transcription.text).toBe('test');
  });

  test('error classes have correct names and codes', () => {
    const te = new distMod.TranscriptionError('msg', 'deepgram');
    expect(te.name).toBe('TranscriptionError');
    expect(te.code).toBe('TRANSCRIPTION_FAILED');
    expect(te.provider).toBe('deepgram');

    const se = new distMod.SummarizationError('msg', 'gemini');
    expect(se.name).toBe('SummarizationError');
    expect(se.code).toBe('SUMMARIZATION_FAILED');
  });
});
