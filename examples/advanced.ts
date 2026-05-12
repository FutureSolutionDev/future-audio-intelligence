/**
 * Advanced usage: auto free-to-paid fallback, custom prompts,
 * and persistent output via storage backend (local / s3 / sqlite).
 *
 * Run with:  bun run examples/advanced.ts ./long-meeting.mp3
 *
 * Control storage via env:
 *   AUDIO_STORAGE=local    (default, saves to ./outputs/)
 *   AUDIO_STORAGE=sqlite   (saves to ./audio-intelligence.db)
 *   AUDIO_STORAGE=s3       (needs S3_BUCKET + S3_REGION)
 */

import {
  AudioIntelligencePipeline,
  AutoFreeToPaidTranscriber,
  AutoFreeToPaidSummarizer,
  createStorageFromEnv,
} from '../src/index.js';

const audioPath = process.argv[2];
if (!audioPath) {
  console.error('Usage: bun run examples/advanced.ts <audio-file>');
  process.exit(1);
}

const pipeline = new AudioIntelligencePipeline({
  transcriber: new AutoFreeToPaidTranscriber({
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    openaiApiKey:   process.env.OPENAI_API_KEY,
  }),
  summarizer: new AutoFreeToPaidSummarizer({
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    geminiApiKey:     process.env.GEMINI_API_KEY,
    openaiApiKey:     process.env.OPENAI_API_KEY,
  }),
  storage: createStorageFromEnv(),
});

const result = await pipeline.process(
  { type: 'path', path: audioPath },
  {
    transcribe: { language: 'ar', diarize: true },
    summarize: {
      style: 'custom',
      customPrompt:
        'Read this meeting transcript and produce a one-paragraph summary, ' +
        'then list the top 3 risks discussed and the top 3 opportunities. ' +
        'Use markdown headings.',
      outputLanguage: 'Egyptian Arabic',
      maxTokens: 1500,
    },
  },
);

console.log(`\nTranscript (${result.transcription.text.length} chars from ${result.transcription.provider}):`);
console.log(result.transcription.text);

if (result.summary) {
  console.log('\n=== Summary ===\n');
  console.log(result.summary.summary);
  console.log(`\n(${result.summary.usage?.inputTokens} → ${result.summary.usage?.outputTokens} tokens via ${result.summary.provider} / ${result.summary.model})`);
}

if (result.saved) {
  console.log(`\n✓ Saved [${result.saved.backend}] → ${result.saved.location}`);
}
