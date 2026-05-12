/**
 * Provider-selection example.
 *
 * Shows how to swap the LLM summarizer between OpenAI, OpenRouter,
 * Gemini, and Anthropic — same pipeline, one-line swap.
 *
 * Run with:  bun run examples/providers.ts ./audio.mp3 openai
 *            bun run examples/providers.ts ./audio.mp3 openrouter
 *            bun run examples/providers.ts ./audio.mp3 gemini
 *            bun run examples/providers.ts ./audio.mp3 anthropic
 */

import {
  AudioIntelligencePipeline,
  OpenAITranscriber,
  OpenAISummarizer,
  OpenRouterSummarizer,
  GeminiSummarizer,
  type Summarizer,
} from '../src/index.js';
import { saveOutput } from './save-output.js';

type ProviderName = 'openai' | 'openrouter' | 'gemini';

function buildSummarizer(provider: ProviderName): Summarizer {
  switch (provider) {
    case 'openai':
      return new OpenAISummarizer({
        apiKey: process.env.OPENAI_API_KEY!,
        defaultModel: 'gpt-4o-mini',
      });

    case 'openrouter':
      return new OpenRouterSummarizer({
        apiKey: process.env.OPENROUTER_API_KEY!,
        // Any model name OpenRouter exposes works here:
        defaultModel: 'anthropic/claude-sonnet-4',
        siteUrl: 'https://yourapp.com',
        appName: 'Audio Intelligence Demo',
      });

    case 'gemini':
      return new GeminiSummarizer({
        apiKey: process.env.GEMINI_API_KEY!,
        defaultModel: 'gemini-2.5-flash',
      });

  }
}

const [, , audioPath, providerArg = 'openai'] = process.argv;
if (!audioPath) {
  console.error('Usage: bun run examples/providers.ts <audio-file> [openai|openrouter|gemini|anthropic]');
  process.exit(1);
}

const provider = providerArg as ProviderName;
const pipeline = new AudioIntelligencePipeline({
  transcriber: new OpenAITranscriber({ apiKey: process.env.OPENAI_API_KEY! }),
  summarizer: buildSummarizer(provider),
});

console.log(`Using summarizer: ${provider}\n`);

const result = await pipeline.process(
  { type: 'path', path: audioPath },
  {
    transcribe: { language: 'auto' },
    summarize: { style: 'bullets' },
  },
);

console.log('--- Summary ---');
console.log(result.summary?.summary);
console.log(`\nProvider: ${result.summary?.provider}`);
console.log(`Model: ${result.summary?.model}`);
console.log(`Tokens: ${result.summary?.usage?.inputTokens} → ${result.summary?.usage?.outputTokens}`);

const outDir = saveOutput(result, audioPath);
console.log(`\n✓ Output saved → ${outDir}`);
