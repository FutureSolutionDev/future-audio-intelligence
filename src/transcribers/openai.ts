import OpenAI, { toFile } from 'openai';
import type {
  AudioSource,
  TranscribeOptions,
  Transcriber,
  TranscriptionResult,
  TranscriptSegment,
  TranscriptWord,
} from '../types/index.js';
import { TranscriptionError } from '../types/index.js';
import { resolveAudio } from '../utils/audio-source.js';

export interface OpenAITranscriberConfig {
  apiKey: string;
  defaultModel?: string;
  baseURL?: string;
  maxRetries?: number;
}

/**
 * OpenAI-based transcriber using the official SDK.
 * Supports Whisper (`whisper-1`) and the newer `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`.
 * File size limit: 25 MB.
 */
export class OpenAITranscriber implements Transcriber {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(config: OpenAITranscriberConfig) {
    if (!config.apiKey) throw new Error('OpenAITranscriber: apiKey is required');

    this.defaultModel = config.defaultModel ?? 'whisper-1';
    this.client = new OpenAI({
      apiKey:     config.apiKey,
      baseURL:    config.baseURL,
      maxRetries: config.maxRetries ?? 3,
    });
  }

  async transcribe(
    source: AudioSource,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const audio = await resolveAudio(source);

    if (audio.sizeBytes > 25 * 1024 * 1024) {
      throw new TranscriptionError(
        `Audio too large (${(audio.sizeBytes / 1024 / 1024).toFixed(1)} MB). OpenAI limit is 25 MB.`,
        this.name,
      );
    }

    const model = options.model ?? this.defaultModel;
    const file  = await toFile(audio.data, audio.filename, { type: audio.mimeType });

    const granularities: ('word' | 'segment')[] = options.wordTimestamps
      ? ['word', 'segment']
      : ['segment'];

    let response: OpenAI.Audio.Transcription;
    try {
      response = await this.client.audio.transcriptions.create({
        file,
        model,
        response_format:           'verbose_json',
        timestamp_granularities:   granularities,
        language: options.language && options.language !== 'auto' ? options.language : undefined,
        prompt:   options.prompt,
      });
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        throw new TranscriptionError(
          `OpenAI API error ${err.status}: ${err.message}`,
          this.name,
          err,
        );
      }
      throw new TranscriptionError('Unexpected error calling OpenAI', this.name, err);
    }

    const data = response as any;

    const segments: TranscriptSegment[] | undefined = Array.isArray(data.segments)
      ? data.segments.map((s: any) => ({ text: s.text, start: s.start, end: s.end }))
      : undefined;

    const words: TranscriptWord[] | undefined = Array.isArray(data.words)
      ? data.words.map((w: any) => ({ word: w.word, start: w.start, end: w.end }))
      : undefined;

    const durationSec = data.duration;
    return {
      text:        data.text ?? '',
      language:    data.language,
      durationSec,
      usage:       { durationSec },
      segments,
      words,
      provider:    this.name,
      model,
      raw:         data,
    };
  }
}
