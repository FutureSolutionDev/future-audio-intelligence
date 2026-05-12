import type {
  SummarizeOptions,
  Summarizer,
  SummaryResult,
} from '../types/index.js';
import { SummarizationError } from '../types/index.js';
import { OpenRouterSummarizer } from './openrouter.js';
import { GeminiSummarizer } from './gemini.js';
import { OpenAISummarizer } from './openai.js';

type Logger = (msg: string) => void;

const ts = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

export interface AutoFreeToPaidSummarizerConfig {
  /** OpenRouter — tried first (has free models available). */
  openrouterApiKey?: string;
  openrouterModel?: string;
  /** Gemini — tried second (free tier with generous quota). */
  geminiApiKey?: string;
  geminiModel?: string;
  /** OpenAI — last resort (paid). */
  openaiApiKey?: string;
  openaiModel?: string;
  /**
   * Logger for fallback diagnostics.
   * Defaults to stderr. Pass `() => {}` to silence completely.
   */
  logger?: Logger;
}

/**
 * Tries summarization providers in free-first order:
 *   1. OpenRouter  — free models available (Llama, Mistral, etc.)
 *   2. Gemini      — free tier with 1M token context
 *   3. OpenAI      — paid fallback
 *
 * Logs every attempt and failure to help diagnose fallback reasons.
 */
export class AutoFreeToPaidSummarizer implements Summarizer {
  readonly name = 'auto-free-to-paid-summarizer';

  private readonly providers: Summarizer[];
  private readonly log: Logger;

  constructor(config: AutoFreeToPaidSummarizerConfig) {
    if (!config.openrouterApiKey && !config.geminiApiKey && !config.openaiApiKey) {
      throw new Error(
        'AutoFreeToPaidSummarizer: at least one API key (openrouterApiKey, geminiApiKey, or openaiApiKey) is required',
      );
    }

    this.log = config.logger ?? ((msg) => process.stderr.write(msg + '\n'));
    this.providers = [];

    if (config.openrouterApiKey) {
      this.providers.push(
        new OpenRouterSummarizer({
          apiKey:       config.openrouterApiKey,
          defaultModel: config.openrouterModel ?? 'meta-llama/llama-3.3-70b-instruct:free',
        }),
      );
    }

    if (config.geminiApiKey) {
      this.providers.push(
        new GeminiSummarizer({
          apiKey:       config.geminiApiKey,
          defaultModel: config.geminiModel ?? 'gemini-2.5-flash',
        }),
      );
    }

    if (config.openaiApiKey) {
      this.providers.push(
        new OpenAISummarizer({
          apiKey:       config.openaiApiKey,
          defaultModel: config.openaiModel ?? 'gpt-4o-mini',
        }),
      );
    }
  }

  async summarize(text: string, options: SummarizeOptions = {}): Promise<SummaryResult> {
    const total  = this.providers.length;
    const errors: string[] = [];

    this.log(`[${ts()}] [summarizer] starting — ${text.length} chars, style=${options.style ?? 'default'}, providers=${this.providers.map(p => p.name).join(' → ')}`);

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]!;
      const attempt  = `${i + 1}/${total}`;

      this.log(`[${ts()}] [summarizer] ┌─ attempt ${attempt} → ${provider.name}`);

      try {
        const t0     = Date.now();
        const result = await provider.summarize(text, options);
        const ms     = Date.now() - t0;

        if (!result.summary.trim()) {
          const reason = 'returned empty summary';
          this.log(`[${ts()}] [summarizer] └─ ✗ skipped (${attempt}): ${provider.name} — ${reason}`);
          errors.push(`${provider.name}: ${reason}`);
          continue;
        }

        this.log(
          `[${ts()}] [summarizer] └─ ✓ success (${attempt}): ${provider.name}` +
          ` | model=${result.model}` +
          ` | tokens=${result.usage?.inputTokens ?? '?'} → ${result.usage?.outputTokens ?? '?'}` +
          ` | ${ms}ms`,
        );

        return result;

      } catch (err) {
        const ms  = '—';
        let detail: string;

        if (err instanceof Error) {
          // Extract HTTP status if present in message (e.g. "API error 402: ...")
          const statusMatch = err.message.match(/\b([4-5]\d{2})\b/);
          const status      = statusMatch ? `HTTP ${statusMatch[1]}` : null;
          detail = status ? `${status} — ${err.message}` : err.message;
        } else {
          detail = String(err);
        }

        this.log(`[${ts()}] [summarizer] └─ ✗ failed  (${attempt}): ${provider.name} — ${detail}`);
        errors.push(`${provider.name}: ${detail}`);
      }
    }

    const summary = `All ${total} summarization provider(s) failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
    this.log(`[${ts()}] [summarizer] ✗ all providers exhausted`);
    throw new SummarizationError(summary, this.name);
  }
}
