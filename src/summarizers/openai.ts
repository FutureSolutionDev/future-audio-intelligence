import {
  OpenAICompatibleSummarizer,
  type OpenAICompatibleConfig,
} from './openai-compatible.js';

export interface OpenAISummarizerConfig
  extends Partial<Omit<OpenAICompatibleConfig, 'apiKey'>> {
  apiKey: string;
}

/**
 * OpenAI Chat Completions summarizer.
 * Defaults to gpt-4o-mini — cheap, fast, 128K context.
 * For better quality on hard transcripts try `gpt-4o` or `gpt-4.1`.
 */
export class OpenAISummarizer extends OpenAICompatibleSummarizer {
  constructor(config: OpenAISummarizerConfig) {
    super({
      providerName: 'openai',
      baseURL: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      chunkThreshold: 80_000, // gpt-4o family = 128K tokens
      ...config,
    });
  }
}
