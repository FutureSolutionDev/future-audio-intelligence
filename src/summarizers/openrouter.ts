import {
  OpenAICompatibleSummarizer,
  type OpenAICompatibleConfig,
} from './openai-compatible.js';

export interface OpenRouterSummarizerConfig
  extends Partial<Omit<OpenAICompatibleConfig, 'apiKey' | 'extraHeaders'>> {
  apiKey: string;
  /** Your site URL — OpenRouter uses it for analytics and abuse prevention. */
  siteUrl?: string;
  /** Your app name — appears in OpenRouter dashboards. */
  appName?: string;
}

/**
 * OpenRouter summarizer.
 *
 * OpenRouter is a single API gateway in front of hundreds of LLMs
 * (Claude, GPT, Gemini, Llama, Mistral, DeepSeek, etc). One key, one API,
 * any model. Useful when you want to A/B-test models without integrating
 * each vendor separately, or to fall back to a cheaper model on overflow.
 *
 * Pass any supported model name via `defaultModel` or `options.model`:
 *   - 'openai/gpt-4o-mini'
 *   - 'google/gemini-2.5-flash'
 *   - 'meta-llama/llama-3.3-70b-instruct'
 *
 * See https://openrouter.ai/models for the full list.
 */
export class OpenRouterSummarizer extends OpenAICompatibleSummarizer {
  constructor(config: OpenRouterSummarizerConfig) {
    const { siteUrl, appName, ...rest } = config;

    const extraHeaders: Record<string, string> = {};
    if (siteUrl) extraHeaders['HTTP-Referer'] = siteUrl;
    if (appName) extraHeaders['X-Title'] = appName;

    super({
      providerName: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      defaultModel: 'anthropic/claude-sonnet-4',
      chunkThreshold: 150_000, // assume long-context model by default
      extraHeaders,
      ...rest,
    });
  }
}
