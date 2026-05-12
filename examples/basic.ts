/**
 * Basic example: transcribe an audio file and summarize it.
 * Run with:  bun run examples/basic.ts ./path/to/audio.mp3
 */

import {
  AudioIntelligencePipeline,
  AnthropicSummarizer,
  DeepgramTranscriber,
} from '../src/index.js';
import { saveOutput } from './save-output.js';

const audioPath = process.argv[2];
if (!audioPath) {
  console.error('Usage: bun run examples/basic.ts <audio-file>');
  process.exit(1);
}

const pipeline = new AudioIntelligencePipeline({
  transcriber: new DeepgramTranscriber({ apiKey: process.env.DEEPGRAM_API_KEY! }),
  summarizer: new AnthropicSummarizer({ apiKey: process.env.ANTHROPIC_API_KEY! }),
});

const result = await pipeline.process(
  { type: 'path', path: audioPath },
  {
    transcribe: { language: 'ar' }, // or 'auto' to detect
    summarize: { style: 'bullets' },
  },
);

console.log('--- Transcript ---');
console.log(result.transcription.text);
console.log(`\nDetected language: ${result.transcription.language}`);
console.log(`Duration: ${result.transcription.durationSec?.toFixed(1)}s`);

console.log('\n--- Summary ---');
console.log(result.summary?.summary);

const outDir = saveOutput(result, audioPath);
console.log(`\n✓ Output saved → ${outDir}`);
