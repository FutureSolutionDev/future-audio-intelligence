import { describe, expect, test, mock } from 'bun:test';
import { AudioIntelligencePipeline } from './pipeline.js';
import { LocalOutputStore } from './storage/local.js';
import { rmSync, existsSync } from 'node:fs';
import type { Transcriber, TranscriptionResult, Summarizer, SummaryResult } from './types/index.js';

const TEST_DIR = import.meta.dir + '/../.test-outputs-pipeline';

// ── Stubs ─────────────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT: TranscriptionResult = {
  text:        'هذا نص تجريبي للاختبار',
  language:    'ar',
  durationSec: 15.0,
  usage:       { durationSec: 15.0 },
  provider:    'mock-transcriber',
  model:       'mock-v1',
  segments:    [{ text: 'هذا نص', start: 0, end: 5 }],
  words:       [{ word: 'هذا', start: 0, end: 1 }],
  raw:         { _raw: true },
};

const MOCK_SUMMARY: SummaryResult = {
  summary:     'ملخص تجريبي',
  actionItems: ['بند 1', 'بند 2'],
  topics:      ['موضوع رئيسي'],
  provider:    'mock-summarizer',
  model:       'mock-lm-v1',
  usage:       { inputTokens: 30, outputTokens: 10 },
  raw:         { _raw: true },
};

function makeTranscriber(result = MOCK_TRANSCRIPT): Transcriber {
  return { name: 'mock', transcribe: async () => result };
}

function makeSummarizer(result = MOCK_SUMMARY): Summarizer {
  return { name: 'mock', summarize: async () => result };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AudioIntelligencePipeline', () => {
  test('process() returns transcription and summary', async () => {
    const pipeline = new AudioIntelligencePipeline({
      transcriber: makeTranscriber(),
      summarizer:  makeSummarizer(),
    });

    const result = await pipeline.process({ type: 'path', path: 'fake.mp3' });

    expect(result.transcription.text).toBe(MOCK_TRANSCRIPT.text);
    expect(result.summary?.summary).toBe(MOCK_SUMMARY.summary);
    expect(result.saved).toBeUndefined(); // no storage configured
  });

  test('process() skips summary when skipSummary is true', async () => {
    const pipeline = new AudioIntelligencePipeline({
      transcriber: makeTranscriber(),
      summarizer:  makeSummarizer(),
    });

    const result = await pipeline.process(
      { type: 'path', path: 'fake.mp3' },
      { skipSummary: true },
    );

    expect(result.transcription.text).toBe(MOCK_TRANSCRIPT.text);
    expect(result.summary).toBeUndefined();
  });

  test('process() skips summary when transcript is empty', async () => {
    const pipeline = new AudioIntelligencePipeline({
      transcriber: makeTranscriber({ ...MOCK_TRANSCRIPT, text: '  ' }),
      summarizer:  makeSummarizer(),
    });

    const result = await pipeline.process({ type: 'path', path: 'fake.mp3' });
    expect(result.summary).toBeUndefined();
  });

  test('process() works without a summarizer', async () => {
    const pipeline = new AudioIntelligencePipeline({ transcriber: makeTranscriber() });
    const result = await pipeline.process({ type: 'path', path: 'fake.mp3' });
    expect(result.transcription).toBeDefined();
    expect(result.summary).toBeUndefined();
  });

  test('process() saves to storage and returns saved result', async () => {
    const storage = new LocalOutputStore({ outputDir: TEST_DIR });
    const pipeline = new AudioIntelligencePipeline({
      transcriber: makeTranscriber(),
      summarizer:  makeSummarizer(),
      storage,
    });

    const result = await pipeline.process({ type: 'path', path: 'meeting.mp3' });

    expect(result.saved).toBeDefined();
    expect(result.saved!.backend).toBe('local');
    expect(result.saved!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ); // uuid v4

    // verify it's actually retrievable
    const record = await storage.getById(result.saved!.id);
    expect(record).not.toBeNull();
    expect(record!.audioName).toBe('meeting'); // stripped extension

    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('storeOptions', () => {
    test('strips segments, words, raw by default', async () => {
      const storage = new LocalOutputStore({ outputDir: TEST_DIR });
      const pipeline = new AudioIntelligencePipeline({
        transcriber: makeTranscriber(),
        summarizer:  makeSummarizer(),
        storage,
      });

      const result = await pipeline.process({ type: 'path', path: 'a.mp3' });
      const record = await storage.getById(result.saved!.id);

      expect(record!.transcription.segments).toBeUndefined();
      expect(record!.transcription.words).toBeUndefined();
      expect(record!.transcription.raw).toBeUndefined();
      expect(record!.summary?.raw).toBeUndefined();

      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    test('includeSegments stores segments', async () => {
      const storage = new LocalOutputStore({ outputDir: TEST_DIR });
      const pipeline = new AudioIntelligencePipeline({
        transcriber:  makeTranscriber(),
        summarizer:   makeSummarizer(),
        storage,
        storeOptions: { includeSegments: true },
      });

      const result = await pipeline.process({ type: 'path', path: 'a.mp3' });
      const record = await storage.getById(result.saved!.id);

      expect(record!.transcription.segments).toBeDefined();
      expect(record!.transcription.segments!.length).toBe(1);

      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    test('includeRaw stores raw responses', async () => {
      const storage = new LocalOutputStore({ outputDir: TEST_DIR });
      const pipeline = new AudioIntelligencePipeline({
        transcriber:  makeTranscriber(),
        summarizer:   makeSummarizer(),
        storage,
        storeOptions: { includeRaw: true },
      });

      const result = await pipeline.process({ type: 'path', path: 'a.mp3' });
      const record = await storage.getById(result.saved!.id);

      expect(record!.transcription.raw).toBeDefined();
      expect(record!.summary?.raw).toBeDefined();

      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });
  });

  describe('audio source name extraction', () => {
    test('extracts name from path source', async () => {
      const storage = new LocalOutputStore({ outputDir: TEST_DIR });
      const pipeline = new AudioIntelligencePipeline({
        transcriber: makeTranscriber(),
        storage,
      });

      const result = await pipeline.process({ type: 'path', path: '/data/my-meeting.mp3' });
      const record = await storage.getById(result.saved!.id);
      expect(record!.audioName).toBe('my-meeting');

      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    test('extracts name from URL source', async () => {
      const storage = new LocalOutputStore({ outputDir: TEST_DIR });
      const pipeline = new AudioIntelligencePipeline({
        transcriber: makeTranscriber(),
        storage,
      });

      const result = await pipeline.process({ type: 'url', url: 'https://cdn.example.com/calls/weekly.mp3?v=1' });
      const record = await storage.getById(result.saved!.id);
      expect(record!.audioName).toBe('weekly');

      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    test('extracts name from buffer source', async () => {
      const storage = new LocalOutputStore({ outputDir: TEST_DIR });
      const pipeline = new AudioIntelligencePipeline({
        transcriber: makeTranscriber(),
        storage,
      });

      const result = await pipeline.process({
        type: 'buffer',
        data: Buffer.from(''),
        filename: 'upload.wav',
      });
      const record = await storage.getById(result.saved!.id);
      expect(record!.audioName).toBe('upload');

      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });
  });
});

describe('AutoFreeToPaidTranscriber constructor', () => {
  test('throws when no keys provided', async () => {
    const { AutoFreeToPaidTranscriber } = await import('./transcribers/auto-free-to-paid.js');
    expect(() => new AutoFreeToPaidTranscriber({})).toThrow();
  });

  test('accepts deepgramApiKey only', async () => {
    const { AutoFreeToPaidTranscriber } = await import('./transcribers/auto-free-to-paid.js');
    expect(() => new AutoFreeToPaidTranscriber({ deepgramApiKey: 'key' })).not.toThrow();
  });

  test('accepts openaiApiKey only', async () => {
    const { AutoFreeToPaidTranscriber } = await import('./transcribers/auto-free-to-paid.js');
    expect(() => new AutoFreeToPaidTranscriber({ openaiApiKey: 'key' })).not.toThrow();
  });
});

describe('AutoFreeToPaidSummarizer constructor', () => {
  test('throws when no keys provided', async () => {
    const { AutoFreeToPaidSummarizer } = await import('./summarizers/auto-free-to-paid.js');
    expect(() => new AutoFreeToPaidSummarizer({})).toThrow();
  });

  test('accepts single key', async () => {
    const { AutoFreeToPaidSummarizer } = await import('./summarizers/auto-free-to-paid.js');
    expect(() => new AutoFreeToPaidSummarizer({ openaiApiKey: 'key' })).not.toThrow();
  });

  test('fallback chain logs and tries next on failure', async () => {
    const { AutoFreeToPaidSummarizer } = await import('./summarizers/auto-free-to-paid.js');
    const logs: string[] = [];

    const summarizer = new AutoFreeToPaidSummarizer({
      openrouterApiKey: 'fake-key',
      geminiApiKey:     'fake-key',
      logger: (msg) => logs.push(msg),
    });

    // Both will fail (fake keys) — should throw SummarizationError after exhausting all
    await expect(summarizer.summarize('test text')).rejects.toThrow();

    // Should have logged attempts
    expect(logs.some((l) => l.includes('attempt 1'))).toBe(true);
    expect(logs.some((l) => l.includes('attempt 2'))).toBe(true);
    expect(logs.some((l) => l.includes('failed'))).toBe(true);
  });
});
