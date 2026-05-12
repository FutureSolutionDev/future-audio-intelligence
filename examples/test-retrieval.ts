/**
 * Test: getById + list for all backends.
 * Run with:  bun run examples/test-retrieval.ts <id>
 */

import { SQLiteOutputStore } from '../src/storage/sqlite.js';
import { LocalOutputStore }  from '../src/storage/local.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage: bun run examples/test-retrieval.ts <uuid>');
  process.exit(1);
}

// ── SQLite ────────────────────────────────────────────────────────────────
console.log('\n=== SQLite ===');
const sqlite = new SQLiteOutputStore({ dbPath: './audio-intelligence.db' });

const byId = await sqlite.getById(id);
if (byId) {
  console.log('getById →', {
    id:              byId.id,
    audioName:       byId.audioName,
    processedAt:     byId.processedAt.toISOString(),
    transcriptChars: byId.transcription.text.length,
    language:        byId.transcription.language,
    duration:        byId.transcription.durationSec?.toFixed(1) + 's',
    provider:        byId.transcription.provider,
    summaryProvider: byId.summary?.provider,
    summaryModel:    byId.summary?.model,
    inputTokens:     byId.summary?.usage?.inputTokens,
    outputTokens:    byId.summary?.usage?.outputTokens,
  });
} else {
  console.log('getById → NOT FOUND');
}

const list = await sqlite.list({ limit: 10 });
console.log(`\nlist() → ${list.length} records (most recent first):`);
list.forEach((r, i) =>
  console.log(`  ${i + 1}. ${r.id} | ${r.audioName} | ${r.processedAt.toISOString()} | ${r.transcription.provider}`),
);

// ── Local ─────────────────────────────────────────────────────────────────
console.log('\n=== Local ===');
const local = new LocalOutputStore({ outputDir: './outputs' });

const localById = await local.getById(id);
console.log('getById →', localById ? `Found: ${localById.audioName} (${localById.transcription.text.length} chars)` : 'NOT FOUND (run with AUDIO_STORAGE=local first)');

const localList = await local.list({ limit: 10 });
console.log(`list() → ${localList.length} records:`);
localList.forEach((r, i) =>
  console.log(`  ${i + 1}. ${r.id} | ${r.audioName} | ${r.processedAt.toISOString()}`),
);
