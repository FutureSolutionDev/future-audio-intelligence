/**
 * Smoke test for the published GitHub Package.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx bun run scripts/smoke-test.ts
 *
 * What it does:
 *   1. Creates a temp directory
 *   2. Installs @FutureSolutionDev/future-audio-intelligence from GitHub Packages
 *   3. Runs import + functional checks
 *   4. Cleans up
 *
 * Requires GITHUB_TOKEN with at least read:packages scope.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join }    from 'node:path';
import { tmpdir }  from 'node:os';
import { execSync } from 'node:child_process';

const PKG   = '@FutureSolutionDev/future-audio-intelligence';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('❌  GITHUB_TOKEN is required');
  console.error('    export GITHUB_TOKEN=ghp_your_token_here');
  process.exit(1);
}

const workDir = join(tmpdir(), `smoke-test-${Date.now()}`);

function run(cmd: string, opts: { cwd?: string } = {}) {
  return execSync(cmd, { stdio: 'inherit', cwd: opts.cwd ?? workDir });
}

function cleanup() {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n📦 Smoke test — ${PKG}`);
console.log(`📁 Working dir: ${workDir}\n`);

// ── Setup ──────────────────────────────────────────────────────────────────────
mkdirSync(workDir, { recursive: true });

writeFileSync(join(workDir, 'package.json'), JSON.stringify({
  name:    'smoke-test',
  version: '1.0.0',
  type:    'module',
}, null, 2));

// .npmrc — authenticate with GitHub Packages
writeFileSync(join(workDir, '.npmrc'), [
  '@FutureSolutionDev:registry=https://npm.pkg.github.com',
  `//npm.pkg.github.com/:_authToken=${TOKEN}`,
].join('\n'));

// smoke.mjs — the actual test script
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

console.log('\\n── Exports ──────────────────────────────────');

check('AudioIntelligencePipeline is a class',  () => { if (typeof AudioIntelligencePipeline !== 'function') throw new Error('not a function'); });
check('AutoFreeToPaidTranscriber is a class',  () => { if (typeof AutoFreeToPaidTranscriber !== 'function') throw new Error('not a function'); });
check('AutoFreeToPaidSummarizer is a class',   () => { if (typeof AutoFreeToPaidSummarizer !== 'function') throw new Error('not a function'); });
check('LocalOutputStore is a class',           () => { if (typeof LocalOutputStore !== 'function') throw new Error('not a function'); });
check('SQLiteOutputStore is a class',          () => { if (typeof SQLiteOutputStore !== 'function') throw new Error('not a function'); });
check('S3OutputStore is a class',              () => { if (typeof S3OutputStore !== 'function') throw new Error('not a function'); });
check('createStorageFromEnv is a function',    () => { if (typeof createStorageFromEnv !== 'function') throw new Error('not a function'); });
check('chunkText is a function',               () => { if (typeof chunkText !== 'function') throw new Error('not a function'); });
check('estimateTokens is a function',          () => { if (typeof estimateTokens !== 'function') throw new Error('not a function'); });

console.log('\\n── Functional ───────────────────────────────');

check('chunkText splits text correctly', () => {
  const chunks = chunkText('A. B. C. D. E.'.repeat(100), { maxChars: 200 });
  if (chunks.length < 2) throw new Error('expected multiple chunks');
  for (const c of chunks) if (c.length > 200) throw new Error('chunk too large');
});

check('estimateTokens returns positive integer', () => {
  const n = estimateTokens('hello world');
  if (typeof n !== 'number' || n <= 0) throw new Error('expected positive number');
});

check('TranscriptionError has correct code', () => {
  const e = new TranscriptionError('test', 'deepgram');
  if (e.code !== 'TRANSCRIPTION_FAILED') throw new Error('wrong code: ' + e.code);
  if (e.provider !== 'deepgram') throw new Error('wrong provider');
});

check('SummarizationError has correct code', () => {
  const e = new SummarizationError('test', 'gemini');
  if (e.code !== 'SUMMARIZATION_FAILED') throw new Error('wrong code: ' + e.code);
});

check('AutoFreeToPaidTranscriber throws on empty config', () => {
  try { new AutoFreeToPaidTranscriber({}); throw new Error('should have thrown'); }
  catch (e) { if (e.message === 'should have thrown') throw e; }
});

check('AutoFreeToPaidSummarizer throws on empty config', () => {
  try { new AutoFreeToPaidSummarizer({}); throw new Error('should have thrown'); }
  catch (e) { if (e.message === 'should have thrown') throw e; }
});

check('createStorageFromEnv returns LocalOutputStore by default', () => {
  const old = process.env.AUDIO_STORAGE;
  process.env.AUDIO_STORAGE = 'local';
  try {
    const store = createStorageFromEnv();
    if (!(store instanceof LocalOutputStore)) throw new Error('expected LocalOutputStore, got ' + store.constructor.name);
  } finally {
    if (old === undefined) delete process.env.AUDIO_STORAGE;
    else process.env.AUDIO_STORAGE = old;
  }
});

check('createStorageFromEnv returns SQLiteOutputStore', () => {
  const old = process.env.AUDIO_STORAGE;
  process.env.AUDIO_STORAGE = 'sqlite';
  try {
    const store = createStorageFromEnv();
    if (!(store instanceof SQLiteOutputStore)) throw new Error('expected SQLiteOutputStore, got ' + store.constructor.name);
  } finally {
    if (old === undefined) delete process.env.AUDIO_STORAGE;
    else process.env.AUDIO_STORAGE = old;
  }
});

check('pipeline instantiates and processes with mock transcriber', async () => {
  const mock = { name: 'mock', transcribe: async () => ({
    text: 'مرحبا', language: 'ar', durationSec: 5,
    usage: { durationSec: 5 }, provider: 'mock', model: 'v1',
  })};
  const p = new AudioIntelligencePipeline({ transcriber: mock });
  const r = await p.process({ type: 'path', path: 'fake.mp3' });
  if (r.transcription.text !== 'مرحبا') throw new Error('wrong text: ' + r.transcription.text);
}).then?.(() => {});  // handle async

// Wait for async check
await new Promise(r => setTimeout(r, 500));

console.log('\\n─────────────────────────────────────────────');
console.log(\`  \${pass} passed  \${fail} failed\`);
if (fail > 0) process.exit(1);
`);

// ── Install ────────────────────────────────────────────────────────────────────
try {
  console.log(`⬇️  Installing ${PKG}...`);
  run(`npm install ${PKG} --legacy-peer-deps`);

  console.log('\n🧪 Running smoke tests...');
  run('node smoke.mjs');

  console.log('\n✅  All smoke tests passed\n');
} catch (err) {
  console.error('\n❌  Smoke test failed\n');
  cleanup();
  process.exit(1);
} finally {
  cleanup();
}
