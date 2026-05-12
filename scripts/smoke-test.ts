/**
 * Smoke test for the published npm package.
 *
 * Usage:
 *   bun run smoke
 *
 * What it does:
 *   1. Creates a temp directory
 *   2. Installs future-audio-intelligence from npm (no token needed)
 *   3. Runs import + functional checks
 *   4. Cleans up automatically
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join }     from 'node:path';
import { tmpdir }   from 'node:os';
import { execSync } from 'node:child_process';

const PKG     = 'future-audio-intelligence';
const workDir = join(tmpdir(), `smoke-test-${Date.now()}`);

function run(cmd: string) {
  return execSync(cmd, { stdio: 'inherit', cwd: workDir });
}

function cleanup() {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n📦 Smoke test — ${PKG}`);
console.log(`📁 Temp dir: ${workDir}\n`);

// ── Setup ──────────────────────────────────────────────────────────────────────
mkdirSync(workDir, { recursive: true });

writeFileSync(join(workDir, 'package.json'), JSON.stringify({
  name:    'smoke-test',
  version: '1.0.0',
  type:    'module',
}, null, 2));

// ── smoke.mjs — test script that runs inside the temp dir ─────────────────────
writeFileSync(join(workDir, 'smoke.mjs'), `
import {
  AudioIntelligencePipeline,
  AutoFreeToPaidTranscriber,
  AutoFreeToPaidSummarizer,
  LocalOutputStore,
  SQLiteOutputStore,
  S3OutputStore,
  createStorageFromEnv,
  DeepgramTranscriber,
  OpenAITranscriber,
  OpenAISummarizer,
  OpenRouterSummarizer,
  GeminiSummarizer,
  OpenAICompatibleSummarizer,
  chunkText,
  estimateTokens,
  TranscriptionError,
  SummarizationError,
  AudioIntelligenceError,
} from '${PKG}';

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    fn();
    console.log('  ✓', label);
    pass++;
  } catch (err) {
    console.error('  ✗', label);
    console.error('   ', err.message);
    fail++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log('  ✓', label);
    pass++;
  } catch (err) {
    console.error('  ✗', label);
    console.error('   ', err.message);
    fail++;
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
console.log('\\n── Exports ──────────────────────────────────');

check('AudioIntelligencePipeline',    () => { if (typeof AudioIntelligencePipeline    !== 'function') throw new Error('missing'); });
check('AutoFreeToPaidTranscriber',    () => { if (typeof AutoFreeToPaidTranscriber    !== 'function') throw new Error('missing'); });
check('AutoFreeToPaidSummarizer',     () => { if (typeof AutoFreeToPaidSummarizer     !== 'function') throw new Error('missing'); });
check('DeepgramTranscriber',          () => { if (typeof DeepgramTranscriber          !== 'function') throw new Error('missing'); });
check('OpenAITranscriber',            () => { if (typeof OpenAITranscriber            !== 'function') throw new Error('missing'); });
check('OpenAISummarizer',             () => { if (typeof OpenAISummarizer             !== 'function') throw new Error('missing'); });
check('OpenRouterSummarizer',         () => { if (typeof OpenRouterSummarizer         !== 'function') throw new Error('missing'); });
check('GeminiSummarizer',             () => { if (typeof GeminiSummarizer             !== 'function') throw new Error('missing'); });
check('OpenAICompatibleSummarizer',   () => { if (typeof OpenAICompatibleSummarizer   !== 'function') throw new Error('missing'); });
check('LocalOutputStore',             () => { if (typeof LocalOutputStore             !== 'function') throw new Error('missing'); });
check('SQLiteOutputStore',            () => { if (typeof SQLiteOutputStore            !== 'function') throw new Error('missing'); });
check('S3OutputStore',                () => { if (typeof S3OutputStore                !== 'function') throw new Error('missing'); });
check('createStorageFromEnv',         () => { if (typeof createStorageFromEnv         !== 'function') throw new Error('missing'); });
check('chunkText',                    () => { if (typeof chunkText                    !== 'function') throw new Error('missing'); });
check('estimateTokens',               () => { if (typeof estimateTokens              !== 'function') throw new Error('missing'); });
check('TranscriptionError',           () => { if (typeof TranscriptionError           !== 'function') throw new Error('missing'); });
check('SummarizationError',           () => { if (typeof SummarizationError           !== 'function') throw new Error('missing'); });
check('AudioIntelligenceError',       () => { if (typeof AudioIntelligenceError       !== 'function') throw new Error('missing'); });

// ── Functional ────────────────────────────────────────────────────────────────
console.log('\\n── Functional ───────────────────────────────');

check('chunkText splits long text', () => {
  const chunks = chunkText('A. B. C. '.repeat(200), { maxChars: 200 });
  if (chunks.length < 2) throw new Error('expected multiple chunks, got ' + chunks.length);
  for (const c of chunks) if (c.length > 200) throw new Error('chunk too large: ' + c.length);
});

check('estimateTokens returns positive integer', () => {
  const n = estimateTokens('hello world');
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) throw new Error('got: ' + n);
});

check('TranscriptionError — code and provider', () => {
  const e = new TranscriptionError('test', 'deepgram');
  if (e.code     !== 'TRANSCRIPTION_FAILED') throw new Error('wrong code: '     + e.code);
  if (e.provider !== 'deepgram')             throw new Error('wrong provider: ' + e.provider);
  if (!(e instanceof AudioIntelligenceError)) throw new Error('not instance of AudioIntelligenceError');
});

check('SummarizationError — code and provider', () => {
  const e = new SummarizationError('test', 'gemini');
  if (e.code     !== 'SUMMARIZATION_FAILED') throw new Error('wrong code: '     + e.code);
  if (e.provider !== 'gemini')               throw new Error('wrong provider: ' + e.provider);
});

check('AutoFreeToPaidTranscriber — throws on empty config', () => {
  try   { new AutoFreeToPaidTranscriber({}); throw new Error('should have thrown'); }
  catch (e) { if (e.message === 'should have thrown') throw e; }
});

check('AutoFreeToPaidSummarizer — throws on empty config', () => {
  try   { new AutoFreeToPaidSummarizer({}); throw new Error('should have thrown'); }
  catch (e) { if (e.message === 'should have thrown') throw e; }
});

check('createStorageFromEnv — local', () => {
  const prev = process.env.AUDIO_STORAGE;
  process.env.AUDIO_STORAGE = 'local';
  try {
    const s = createStorageFromEnv();
    if (!(s instanceof LocalOutputStore))
      throw new Error('expected LocalOutputStore, got ' + s.constructor.name);
  } finally {
    prev === undefined ? delete process.env.AUDIO_STORAGE : (process.env.AUDIO_STORAGE = prev);
  }
});

check('createStorageFromEnv — sqlite', () => {
  const prev = process.env.AUDIO_STORAGE;
  process.env.AUDIO_STORAGE = 'sqlite';
  try {
    const s = createStorageFromEnv();
    if (!(s instanceof SQLiteOutputStore))
      throw new Error('expected SQLiteOutputStore, got ' + s.constructor.name);
  } finally {
    prev === undefined ? delete process.env.AUDIO_STORAGE : (process.env.AUDIO_STORAGE = prev);
  }
});

check('createStorageFromEnv — throws on unknown backend', () => {
  const prev = process.env.AUDIO_STORAGE;
  process.env.AUDIO_STORAGE = 'unknown';
  try {
    try   { createStorageFromEnv(); throw new Error('should have thrown'); }
    catch (e) { if (e.message === 'should have thrown') throw e; }
  } finally {
    prev === undefined ? delete process.env.AUDIO_STORAGE : (process.env.AUDIO_STORAGE = prev);
  }
});

await checkAsync('pipeline — process with mock transcriber', async () => {
  const mock = {
    name: 'mock',
    transcribe: async () => ({
      text: 'مرحبا', language: 'ar', durationSec: 5,
      usage: { durationSec: 5 }, provider: 'mock', model: 'v1',
    }),
  };
  const pipeline = new AudioIntelligencePipeline({ transcriber: mock });
  const result   = await pipeline.process({ type: 'path', path: 'fake.mp3' });
  if (result.transcription.text !== 'مرحبا')
    throw new Error('wrong text: ' + result.transcription.text);
  if (result.saved !== undefined)
    throw new Error('should not save without storage configured');
});

await checkAsync('LocalOutputStore — save + getById + list', async () => {
  const { mkdirSync, rmSync } = await import('node:fs');
  const { join }  = await import('node:path');
  const { tmpdir } = await import('node:os');

  const dir   = join(tmpdir(), 'pkg-smoke-' + Date.now());
  const store  = new LocalOutputStore({ outputDir: dir });
  const record = {
    id: 'smoke-id-1', audioName: 'test', processedAt: new Date(),
    transcription: { text: 'hello', provider: 'mock', model: 'v1' },
  };

  try {
    await store.save(record);
    const found = await store.getById('smoke-id-1');
    if (!found)                        throw new Error('getById returned null');
    if (found.id !== 'smoke-id-1')     throw new Error('wrong id: ' + found.id);
    const list = await store.list();
    if (list.length !== 1)             throw new Error('expected 1 record, got ' + list.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Result ────────────────────────────────────────────────────────────────────
console.log('\\n─────────────────────────────────────────────');
console.log(\`  \${pass} passed  \${fail > 0 ? fail + ' FAILED' : '0 failed'}\`);
if (fail > 0) process.exit(1);
`);

// ── Install + Run ──────────────────────────────────────────────────────────────
try {
  console.log(`⬇️  Installing ${PKG} from npm...`);
  run(`npm install ${PKG}`);

  console.log('\n🧪 Running smoke tests...\n');
  run('node smoke.mjs');

  console.log('\n✅  All smoke tests passed\n');
} catch {
  console.error('\n❌  Smoke test failed\n');
  process.exit(1);
} finally {
  cleanup();
}
