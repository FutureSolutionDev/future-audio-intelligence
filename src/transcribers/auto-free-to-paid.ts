import type {
  AudioSource,
  TranscribeOptions,
  Transcriber,
  TranscriptionResult,
} from '../types/index.js';
import { TranscriptionError } from '../types/index.js';
import { DeepgramTranscriber } from './deepgram.js';
import { OpenAITranscriber } from './openai.js';

type Logger = (msg: string) => void;

const ts = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

export interface AutoFreeToPaidTranscriberConfig {
  /** Deepgram — tried first (free tier available). */
  deepgramApiKey?: string;
  deepgramModel?: string;
  /** OpenAI Whisper — fallback (paid). */
  openaiApiKey?: string;
  openaiModel?: string;
  /**
   * Logger for fallback diagnostics.
   * Defaults to stderr. Pass `() => {}` to silence completely.
   */
  logger?: Logger;
}

/**
 * Tries transcription providers in free-first order:
 *   1. Deepgram (nova-3)   — free tier, fast, strong Arabic support
 *   2. OpenAI Whisper      — paid fallback
 *
 * Logs every attempt, empty-transcript soft-failures, and hard errors.
 */
export class AutoFreeToPaidTranscriber implements Transcriber {
  readonly name = 'auto-free-to-paid-transcriber';

  private readonly providers: Transcriber[];
  private readonly log: Logger;

  constructor(config: AutoFreeToPaidTranscriberConfig) {
    if (!config.deepgramApiKey && !config.openaiApiKey) {
      throw new Error(
        'AutoFreeToPaidTranscriber: at least one of deepgramApiKey or openaiApiKey is required',
      );
    }

    this.log = config.logger ?? ((msg) => process.stderr.write(msg + '\n'));
    this.providers = [];

    if (config.deepgramApiKey) {
      this.providers.push(
        new DeepgramTranscriber({
          apiKey:       config.deepgramApiKey,
          defaultModel: config.deepgramModel ?? 'nova-3',
        }),
      );
    }

    if (config.openaiApiKey) {
      this.providers.push(
        new OpenAITranscriber({
          apiKey:       config.openaiApiKey,
          defaultModel: config.openaiModel ?? 'whisper-1',
        }),
      );
    }
  }

  async transcribe(
    source: AudioSource,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const total  = this.providers.length;
    const errors: string[] = [];

    this.log(`[${ts()}] [transcriber] starting — source=${source.type}, lang=${options.language ?? 'auto'}, providers=${this.providers.map(p => p.name).join(' → ')}`);

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]!;
      const attempt  = `${i + 1}/${total}`;

      this.log(`[${ts()}] [transcriber] ┌─ attempt ${attempt} → ${provider.name}`);

      try {
        const t0     = Date.now();
        const result = await provider.transcribe(source, options);
        const ms     = Date.now() - t0;

        // Empty transcript = soft failure — try next provider.
        if (!result.text.trim()) {
          const reason = `empty transcript (confidence=0, detected_lang=${result.language ?? '?'})`;
          this.log(`[${ts()}] [transcriber] └─ ✗ skipped (${attempt}): ${provider.name} — ${reason}`);
          errors.push(`${provider.name}: ${reason}`);
          continue;
        }

        this.log(
          `[${ts()}] [transcriber] └─ ✓ success (${attempt}): ${provider.name}` +
          ` | model=${result.model}` +
          ` | lang=${result.language ?? '?'}` +
          ` | chars=${result.text.length}` +
          ` | duration=${result.durationSec != null ? result.durationSec.toFixed(1) + 's' : '?'}` +
          ` | ${ms}ms`,
        );

        return result;

      } catch (err) {
        let detail: string;

        if (err instanceof Error) {
          const statusMatch = err.message.match(/\b([4-5]\d{2})\b/);
          const status      = statusMatch ? `HTTP ${statusMatch[1]}` : null;
          detail = status ? `${status} — ${err.message}` : err.message;
        } else {
          detail = String(err);
        }

        this.log(`[${ts()}] [transcriber] └─ ✗ failed  (${attempt}): ${provider.name} — ${detail}`);
        errors.push(`${provider.name}: ${detail}`);
      }
    }

    const summary = `All ${total} transcription provider(s) failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
    this.log(`[${ts()}] [transcriber] ✗ all providers exhausted`);
    throw new TranscriptionError(summary, this.name);
  }
}
