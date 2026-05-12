/**
 * Integration test — runs against the PUBLISHED npm package with real API keys.
 *
 * Usage:
 *   bun run integration                        # uses ./audio.mp3
 *   bun run integration ./path/to/audio.mp3   # custom file
 *
 * Reads API keys from .env automatically (Bun loads it natively).
 * Results are saved to ./integration-output/ for inspection.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const PKG       = 'future-audio-intelligence';
const audioPath = resolve(process.argv[2] ?? './audio.mp3');
const outDir    = resolve('./integration-output');
const workDir   = join(tmpdir(), `integration-test-${Date.now()}`);

// ── Validate audio file ────────────────────────────────────────────────────────
if (!existsSync(audioPath)) {
  console.error(`❌  Audio file not found: ${audioPath}`);
  process.exit(1);
}

// ── Validate API keys ─────────────────────────────────────────────────────────
const keys = {
  DEEPGRAM_API_KEY:    process.env.DEEPGRAM_API_KEY,
  OPENAI_API_KEY:      process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY:  process.env.OPENROUTER_API_KEY,
  GEMINI_API_KEY:      process.env.GEMINI_API_KEY,
};

console.log('\n🔑 API Keys:');
for (const [name, val] of Object.entries(keys)) {
  console.log(`   ${val ? '✓' : '✗'} ${name}`);
}

const hasTranscriber  = keys.DEEPGRAM_API_KEY || keys.OPENAI_API_KEY;
const hasSummarizer   = keys.OPENROUTER_API_KEY || keys.GEMINI_API_KEY || keys.OPENAI_API_KEY;

if (!hasTranscriber) {
  console.error('\n❌  Need at least DEEPGRAM_API_KEY or OPENAI_API_KEY for transcription');
  process.exit(1);
}

function run(cmd: string) {
  return execSync(cmd, { stdio: 'inherit', cwd: workDir });
}

function cleanup() {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n📦 Package : ${PKG}`);
console.log(`🎵 Audio   : ${audioPath}`);
console.log(`📁 Results : ${outDir}\n`);

// ── Setup temp dir ─────────────────────────────────────────────────────────────
mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// Copy audio file into temp dir so the script can access it
const audioFilename = basename(audioPath);
copyFileSync(audioPath, join(workDir, audioFilename));

writeFileSync(join(workDir, 'package.json'), JSON.stringify({
  name: 'integration-test', version: '1.0.0', type: 'module',
}, null, 2));

// Build env string to pass to the child process
const envLines = Object.entries(keys)
  .filter(([, v]) => v)
  .map(([k, v]) => `process.env["${k}"] = ${JSON.stringify(v)};`)
  .join('\n');

// ── test.mjs ───────────────────────────────────────────────────────────────────
writeFileSync(join(workDir, 'test.mjs'), `
${envLines}

import {
  AudioIntelligencePipeline,
  AutoFreeToPaidTranscriber,
  AutoFreeToPaidSummarizer,
  LocalOutputStore,
} from '${PKG}';

const start = Date.now();

const pipeline = new AudioIntelligencePipeline({
  transcriber: new AutoFreeToPaidTranscriber({
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    openaiApiKey:   process.env.OPENAI_API_KEY,
  }),
  summarizer: ${hasSummarizer ? `new AutoFreeToPaidSummarizer({
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    geminiApiKey:     process.env.GEMINI_API_KEY,
    openaiApiKey:     process.env.OPENAI_API_KEY,
  })` : 'undefined'},
  storage: new LocalOutputStore({ outputDir: './output' }),
});

console.log('⏳ Processing ${audioFilename}...\\n');

const result = await pipeline.process(
  { type: 'path', path: './${audioFilename}' },
  {
    transcribe: { language: 'ar', diarize: true },
    summarize:  {
      style: 'meeting_notes',
      outputLanguage: 'Egyptian Arabic',
      maxTokens: 1000,
    },
  },
);

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

// ── Print results ──────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log('TRANSCRIPTION');
console.log('═'.repeat(60));
console.log('Provider  :', result.transcription.provider, '/', result.transcription.model);
console.log('Language  :', result.transcription.language);
console.log('Duration  :', result.transcription.durationSec?.toFixed(1) + 's');
console.log('Usage     :', JSON.stringify(result.transcription.usage));
console.log('Chars     :', result.transcription.text.length);
console.log('');
console.log(result.transcription.text);

if (result.summary) {
  console.log('\\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log('Provider  :', result.summary.provider, '/', result.summary.model);
  console.log('Tokens    :', result.summary.usage?.inputTokens, '→', result.summary.usage?.outputTokens);
  console.log('');
  console.log(result.summary.summary);

  if (result.summary.actionItems?.length) {
    console.log('\\nAction Items:');
    result.summary.actionItems.forEach((item, i) => console.log(' ' + (i+1) + '.', item));
  }
}

console.log('\\n' + '═'.repeat(60));
console.log('Saved to  :', result.saved?.location ?? 'not saved');
console.log('Total time:', elapsed + 's');
console.log('═'.repeat(60));

// Write result JSON for inspection
import { writeFileSync } from 'node:fs';
writeFileSync('./output/result.json', JSON.stringify({
  transcription: {
    text:        result.transcription.text,
    language:    result.transcription.language,
    durationSec: result.transcription.durationSec,
    usage:       result.transcription.usage,
    provider:    result.transcription.provider,
    model:       result.transcription.model,
  },
  summary: result.summary ? {
    summary:     result.summary.summary,
    actionItems: result.summary.actionItems,
    topics:      result.summary.topics,
    provider:    result.summary.provider,
    model:       result.summary.model,
    usage:       result.summary.usage,
  } : null,
  saved:   result.saved,
  elapsed: elapsed + 's',
}, null, 2));

console.log('\\n📄 Full result → output/result.json');
`);

// ── Install + Run ──────────────────────────────────────────────────────────────
try {
  console.log(`⬇️  Installing ${PKG}...\n`);
  run('npm install future-audio-intelligence --silent');

  run('node test.mjs');

  // Copy output to project dir for inspection
  const resultSrc  = join(workDir, 'output', 'result.json');
  if (existsSync(resultSrc)) {
    const destFile = join(outDir, `result-${Date.now()}.json`);
    copyFileSync(resultSrc, destFile);
    console.log(`\n✅  Saved to: ${destFile}`);
  }

} catch {
  console.error('\n❌  Integration test failed');
  process.exit(1);
} finally {
  cleanup();
}
