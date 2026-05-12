import {
  OpenAICompatibleSummarizer,
  type OpenAICompatibleConfig,
} from './openai-compatible.js';

export interface GeminiSummarizerConfig
  extends Partial<Omit<OpenAICompatibleConfig, 'apiKey'>> {
  apiKey: string;
}

/**
 * Google Gemini summarizer via the OpenAI-compatible endpoint.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/openai/
 * Auth:     standard `Authorization: Bearer <GEMINI_API_KEY>`.
 *
 * Gemini 2.5 Flash has a 1M token context window — the largest in this
 * module — so the chunk threshold is set high. Useful for very long
 * podcasts or hour-long meetings that you want summarized in a single
 * pass.
 *
 * Pass model names like:
 *   - 'gemini-2.5-flash'  (default, fast + cheap)
 *   - 'gemini-2.5-pro'    (best reasoning)
 */
export class GeminiSummarizer extends OpenAICompatibleSummarizer {
  constructor(config: GeminiSummarizerConfig) {
    super({
      providerName: 'gemini',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      defaultModel: 'gemini-2.5-flash',
      chunkThreshold: 500_000, // 1M token context; still chunk huge transcripts
      ...config,
    });
  }
}
