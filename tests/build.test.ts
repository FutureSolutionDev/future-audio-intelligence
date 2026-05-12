/**
 * Build verification test.
 * Imports from dist/ to confirm the compiled output is valid and all exports are present.
 * Run AFTER `bun run build`.
 */
import { describe, expect, test } from 'bun:test';

describe('dist build exports', () => {
  test('main entry exports all expected symbols', async () => {
    const mod = await import('../dist/index.js');

    // Pipeline
    expect(mod.AudioIntelligencePipeline).toBeFunction();

    // Auto providers
    expect(mod.AutoFreeToPaidTranscriber).toBeFunction();
    expect(mod.AutoFreeToPaidSummarizer).toBeFunction();

    // Individual transcribers
    expect(mod.DeepgramTranscriber).toBeFunction();
    expect(mod.OpenAITranscriber).toBeFunction();
    expect(mod.LocalWhisperTranscriber).toBeFunction();

    // Individual summarizers
    expect(mod.OpenAISummarizer).toBeFunction();
    expect(mod.OpenRouterSummarizer).toBeFunction();
    expect(mod.GeminiSummarizer).toBeFunction();
    expect(mod.OpenAICompatibleSummarizer).toBeFunction();

    // Storage
    expect(mod.LocalOutputStore).toBeFunction();
    expect(mod.SQLiteOutputStore).toBeFunction();
    expect(mod.S3OutputStore).toBeFunction();
    expect(mod.createStorageFromEnv).toBeFunction();

    // Errors
    expect(mod.AudioIntelligenceError).toBeFunction();
    expect(mod.TranscriptionError).toBeFunction();
    expect(mod.SummarizationError).toBeFunction();

    // Utils
    expect(mod.chunkText).toBeFunction();
    expect(mod.estimateTokens).toBeFunction();
  });

  test('createStorageFromEnv() returns LocalOutputStore by default', async () => {
    const { createStorageFromEnv, LocalOutputStore } = await import('../dist/index.js');
    const store = createStorageFromEnv();
    expect(store).toBeInstanceOf(LocalOutputStore);
  });

  test('createStorageFromEnv() returns SQLiteOutputStore when AUDIO_STORAGE=sqlite', async () => {
    process.env.AUDIO_STORAGE = 'sqlite';
    // Re-import won't re-run the factory, so call directly
    const { createStorageFromEnv, SQLiteOutputStore } = await import('../dist/index.js');
    const store = createStorageFromEnv();
    expect(store).toBeInstanceOf(SQLiteOutputStore);
    delete process.env.AUDIO_STORAGE;
  });

  test('createStorageFromEnv() throws on unknown backend', async () => {
    process.env.AUDIO_STORAGE = 'unknown-backend';
    const { createStorageFromEnv } = await import('../dist/index.js');
    expect(() => createStorageFromEnv()).toThrow('unknown-backend');
    delete process.env.AUDIO_STORAGE;
  });

  test('AudioIntelligencePipeline is instantiable from dist', async () => {
    const { AudioIntelligencePipeline } = await import('../dist/index.js');

    const mockTranscriber = {
      name: 'mock',
      transcribe: async () => ({
        text: 'test', language: 'ar', durationSec: 5,
        usage: { durationSec: 5 }, provider: 'mock', model: 'v1',
      }),
    };

    const pipeline = new AudioIntelligencePipeline({ transcriber: mockTranscriber });
    expect(pipeline).toBeDefined();

    const result = await pipeline.process({ type: 'path', path: 'fake.mp3' });
    expect(result.transcription.text).toBe('test');
  });

  test('error classes have correct names and codes', async () => {
    const { TranscriptionError, SummarizationError } = await import('../dist/index.js');

    const te = new TranscriptionError('msg', 'deepgram');
    expect(te.name).toBe('TranscriptionError');
    expect(te.code).toBe('TRANSCRIPTION_FAILED');
    expect(te.provider).toBe('deepgram');

    const se = new SummarizationError('msg', 'gemini');
    expect(se.name).toBe('SummarizationError');
    expect(se.code).toBe('SUMMARIZATION_FAILED');
  });
});
