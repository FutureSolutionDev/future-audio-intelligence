import OpenAI from 'openai';
import type {
  SummarizeOptions,
  Summarizer,
  SummaryResult,
} from '../types/index.js';
import { SummarizationError } from '../types/index.js';
import { chunkText } from '../utils/chunking.js';
import {
  buildReducePrompt,
  buildSummaryPrompt,
  tryParseJsonSummary,
  type ParsedSummary,
} from './prompts.js';

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  providerName?: string;
  /** Extra headers (e.g. OpenRouter site/app identifiers). */
  extraHeaders?: Record<string, string>;
  chunkThreshold?: number;
  /** Max retries on 429 / 5xx. Default: 3. */
  maxRetries?: number;
}

/**
 * Generic summarizer for any OpenAI Chat Completions–compatible API.
 * Uses the official `openai` SDK — gets automatic retry/backoff,
 * typed errors, and unified handling across OpenAI, OpenRouter, Gemini, etc.
 */
export class OpenAICompatibleSummarizer implements Summarizer {
  readonly name: string;
  protected readonly client: OpenAI;
  protected readonly defaultModel: string;
  protected readonly chunkThreshold: number;

  constructor(config: OpenAICompatibleConfig) {
    if (!config.apiKey)       throw new Error('apiKey is required');
    if (!config.baseURL)      throw new Error('baseURL is required');
    if (!config.defaultModel) throw new Error('defaultModel is required');

    this.name          = config.providerName ?? 'openai-compatible';
    this.defaultModel  = config.defaultModel;
    this.chunkThreshold = config.chunkThreshold ?? 80_000;

    this.client = new OpenAI({
      apiKey:         config.apiKey,
      baseURL:        config.baseURL,
      defaultHeaders: config.extraHeaders ?? {},
      maxRetries:     config.maxRetries ?? 3,
    });
  }

  async summarize(text: string, options: SummarizeOptions = {}): Promise<SummaryResult> {
    if (!text?.trim()) throw new SummarizationError('Empty transcript', this.name);

    const threshold = options.chunkThreshold ?? this.chunkThreshold;
    if (text.length <= threshold) {
      return this.summarizeOnce(text, options);
    }

    // Map-reduce for long transcripts.
    const chunks = chunkText(text, { maxChars: threshold });
    const chunkSummaries: string[] = [];
    for (const chunk of chunks) {
      const { summary } = await this.summarizeOnce(chunk, { ...options, style: 'detailed' });
      chunkSummaries.push(summary);
    }

    return this.callApi(buildReducePrompt(chunkSummaries, options), options);
  }

  protected async summarizeOnce(text: string, options: SummarizeOptions): Promise<SummaryResult> {
    return this.callApi(buildSummaryPrompt(text, options), options);
  }

  protected async callApi(prompt: string, options: SummarizeOptions): Promise<SummaryResult> {
    const model = options.model ?? this.defaultModel;

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create({
        model,
        max_tokens: options.maxTokens ?? 2048,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        throw new SummarizationError(
          `${this.name} API error ${err.status}: ${err.message}`,
          this.name,
          err,
        );
      }
      throw new SummarizationError(`Unexpected error calling ${this.name}`, this.name, err);
    }

    const rawText = response.choices[0]?.message?.content?.trim() ?? '';
    if (!rawText) {
      throw new SummarizationError(`${this.name} returned empty response`, this.name, response);
    }

    const parsed: ParsedSummary =
      options.style === 'action_items'
        ? tryParseJsonSummary(rawText)
        : { summary: rawText };

    return {
      summary:     parsed.summary,
      actionItems: parsed.actionItems,
      topics:      parsed.topics,
      provider:    this.name,
      model:       response.model,
      usage: {
        inputTokens:  response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
      raw: response,
    };
  }
}
