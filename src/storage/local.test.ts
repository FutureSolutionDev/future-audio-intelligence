import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LocalOutputStore } from './local.js';
import type { OutputRecord } from './types.js';

const TEST_DIR = join(import.meta.dir, '../../.test-outputs-local');

function makeRecord(overrides: Partial<OutputRecord> = {}): OutputRecord {
  return {
    id:          'test-uuid-1234',
    audioName:   'test-audio',
    processedAt: new Date('2026-01-01T10:00:00.000Z'),
    transcription: {
      text:        'مرحباً بالعالم',
      language:    'ar',
      durationSec: 10.5,
      usage:       { durationSec: 10.5 },
      provider:    'deepgram',
      model:       'nova-3',
    },
    summary: {
      summary:  'نص قصير للاختبار',
      provider: 'gemini',
      model:    'gemini-2.5-flash',
      usage:    { inputTokens: 50, outputTokens: 20 },
    },
    ...overrides,
  };
}

describe('LocalOutputStore', () => {
  let store: LocalOutputStore;

  beforeEach(() => {
    store = new LocalOutputStore({ outputDir: TEST_DIR });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test('save() creates a JSON file named by ID', async () => {
    const record = makeRecord();
    const result = await store.save(record);

    expect(result.backend).toBe('local');
    expect(result.id).toBe(record.id);
    expect(existsSync(join(TEST_DIR, `${record.id}.json`))).toBe(true);
  });

  test('getById() returns the saved record', async () => {
    const record = makeRecord();
    await store.save(record);

    const found = await store.getById(record.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(record.id);
    expect(found!.audioName).toBe(record.audioName);
    expect(found!.transcription.text).toBe(record.transcription.text);
    expect(found!.transcription.usage?.durationSec).toBe(10.5);
    expect(found!.summary?.usage?.inputTokens).toBe(50);
  });

  test('getById() returns null for unknown ID', async () => {
    const result = await store.getById('non-existent-id');
    expect(result).toBeNull();
  });

  test('list() returns all saved records sorted by date descending', async () => {
    await store.save(makeRecord({ id: 'id-1', processedAt: new Date('2026-01-01T08:00:00Z') }));
    await store.save(makeRecord({ id: 'id-2', processedAt: new Date('2026-01-01T10:00:00Z') }));
    await store.save(makeRecord({ id: 'id-3', processedAt: new Date('2026-01-01T09:00:00Z') }));

    const all = await store.list();
    expect(all.length).toBe(3);
    expect(all[0]!.id).toBe('id-2'); // most recent first
    expect(all[1]!.id).toBe('id-3');
    expect(all[2]!.id).toBe('id-1');
  });

  test('list() respects limit and offset', async () => {
    for (let i = 1; i <= 5; i++) {
      await store.save(makeRecord({ id: `id-${i}`, processedAt: new Date(`2026-01-0${i}T00:00:00Z`) }));
    }

    const page1 = await store.list({ limit: 2, offset: 0 });
    const page2 = await store.list({ limit: 2, offset: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0]!.id).not.toBe(page2[0]!.id);
  });

  test('list() returns empty array when dir does not exist', async () => {
    const empty = new LocalOutputStore({ outputDir: TEST_DIR + '-nonexistent' });
    const result = await empty.list();
    expect(result).toEqual([]);
  });

  test('processedAt is restored as a Date object', async () => {
    const record = makeRecord();
    await store.save(record);
    const found = await store.getById(record.id);
    expect(found!.processedAt).toBeInstanceOf(Date);
    expect(found!.processedAt.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });

  test('record without summary saves and retrieves correctly', async () => {
    const record = makeRecord({ summary: undefined });
    await store.save(record);
    const found = await store.getById(record.id);
    expect(found!.summary).toBeUndefined();
  });
});
