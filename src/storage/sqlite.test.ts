import { describe, expect, test } from 'bun:test';
import { SQLiteOutputStore } from './sqlite.js';
import type { OutputRecord } from './types.js';

// Use in-memory SQLite — no file, no lock issues, fully isolated per test.
function makeStore() {
  return new SQLiteOutputStore({ dbPath: ':memory:' });
}

function makeRecord(overrides: Partial<OutputRecord> = {}): OutputRecord {
  return {
    id:          `id-${Math.random().toString(36).slice(2)}`,
    audioName:   'test-audio',
    processedAt: new Date('2026-01-01T10:00:00.000Z'),
    transcription: {
      text:        'اختبار قاعدة البيانات',
      language:    'ar',
      durationSec: 30.0,
      usage:       { durationSec: 30.0 },
      provider:    'deepgram',
      model:       'nova-3',
    },
    summary: {
      summary:  'ملخص الاختبار',
      provider: 'gemini',
      model:    'gemini-2.5-flash',
      usage:    { inputTokens: 100, outputTokens: 40 },
    },
    ...overrides,
  };
}

describe('SQLiteOutputStore', () => {
  test('save() persists a record and returns correct SaveResult', async () => {
    const store  = makeStore();
    const record = makeRecord();
    const result = await store.save(record);

    expect(result.backend).toBe('sqlite');
    expect(result.id).toBe(record.id);
    expect(result.location).toContain(record.id);
  });

  test('getById() returns the saved record', async () => {
    const store  = makeStore();
    const record = makeRecord();
    await store.save(record);

    const found = await store.getById(record.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(record.id);
    expect(found!.transcription.text).toBe(record.transcription.text);
    expect(found!.transcription.usage?.durationSec).toBe(30.0);
    expect(found!.summary?.usage?.inputTokens).toBe(100);
  });

  test('getById() returns null for unknown ID', async () => {
    const result = await makeStore().getById('does-not-exist');
    expect(result).toBeNull();
  });

  test('list() returns records sorted by date descending', async () => {
    const store = makeStore();
    await store.save(makeRecord({ id: 'a', processedAt: new Date('2026-01-01T08:00:00Z') }));
    await store.save(makeRecord({ id: 'b', processedAt: new Date('2026-01-01T12:00:00Z') }));
    await store.save(makeRecord({ id: 'c', processedAt: new Date('2026-01-01T10:00:00Z') }));

    const all = await store.list({ limit: 10 });
    expect(all.length).toBe(3);
    expect(all[0]!.id).toBe('b');
    expect(all[1]!.id).toBe('c');
    expect(all[2]!.id).toBe('a');
  });

  test('list() respects limit', async () => {
    const store = makeStore();
    for (let i = 0; i < 5; i++) await store.save(makeRecord());
    const result = await store.list({ limit: 3 });
    expect(result.length).toBe(3);
  });

  test('list() respects offset', async () => {
    const store = makeStore();
    for (let i = 0; i < 4; i++) {
      await store.save(makeRecord({ processedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`) }));
    }
    const page1 = await store.list({ limit: 2, offset: 0 });
    const page2 = await store.list({ limit: 2, offset: 2 });
    expect(page1[0]!.id).not.toBe(page2[0]!.id);
  });

  test('processedAt is restored as a Date object', async () => {
    const store  = makeStore();
    const record = makeRecord();
    await store.save(record);
    const found = await store.getById(record.id);
    expect(found!.processedAt).toBeInstanceOf(Date);
    expect(found!.processedAt.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });

  test('record without summary saves and retrieves correctly', async () => {
    const store  = makeStore();
    const record = makeRecord({ summary: undefined });
    await store.save(record);
    const found = await store.getById(record.id);
    expect(found!.summary).toBeUndefined();
  });
});
