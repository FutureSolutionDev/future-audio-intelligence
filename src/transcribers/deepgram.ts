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

export interface DeepgramTranscriberConfig {
  apiKey: string;
  defaultModel?: string; // e.g. 'nova-3'
  baseURL?: string;
  fetch?: typeof fetch;
}

/**
 * Deepgram-based transcriber. Defaults to Nova-3 which has strong
 * multi-dialect Arabic support and ~300ms latency for streaming.
 *
 * Supports URL transcription natively — pass an AudioSource of type 'url'
 * and Deepgram fetches the file itself (no upload from our server).
 */
export class DeepgramTranscriber implements Transcriber {
  readonly name = 'deepgram';
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: DeepgramTranscriberConfig) {
    if (!config.apiKey) throw new Error('DeepgramTranscriber: apiKey is required');
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel ?? 'nova-3';
    this.baseURL = config.baseURL ?? 'https://api.deepgram.com/v1';
    this.fetchImpl = config.fetch ?? fetch;
  }

  async transcribe(
    source: AudioSource,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const params = new URLSearchParams();
    params.set('model', options.model ?? this.defaultModel);
    params.set('smart_format', 'true');
    params.set('punctuate', 'true');

    if (options.language && options.language !== 'auto') {
      params.set('language', options.language);
    } else {
      params.set('detect_language', 'true');
    }
    if (options.diarize) params.set('diarize', 'true');
    if (options.vocabulary?.length) {
      // Deepgram calls this 'keyterm' on Nova-3, 'keywords' on older models.
      for (const term of options.vocabulary) params.append('keyterm', term);
    }

    const url = `${this.baseURL}/listen?${params.toString()}`;

    // URL sources: pass through, Deepgram fetches directly.
    let body: BodyInit;
    let contentType: string;

    if (source.type === 'url') {
      body = JSON.stringify({ url: source.url });
      contentType = 'application/json';
    } else {
      const audio = await resolveAudio(source);
      // Use Blob to avoid shared ArrayBuffer offset issues with Node.js Buffer slices.
      // Explicitly copy into a clean ArrayBuffer to avoid SharedArrayBuffer type conflicts.
      const ab = audio.data.buffer.slice(audio.data.byteOffset, audio.data.byteOffset + audio.data.byteLength) as ArrayBuffer;
      body = new Blob([ab], { type: audio.mimeType });
      contentType = audio.mimeType;
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': contentType,
        },
        body,
      });
    } catch (err) {
      throw new TranscriptionError('Network error calling Deepgram', this.name, err);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new TranscriptionError(
        `Deepgram returned ${res.status}: ${errBody.slice(0, 500)}`,
        this.name,
      );
    }

    const data: any = await res.json();
    const channel = data?.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];

    if (!alt) {
      throw new TranscriptionError('Deepgram returned no transcription', this.name, data);
    }

    const words: TranscriptWord[] | undefined = Array.isArray(alt.words)
      ? alt.words.map((w: any) => ({
          word: w.punctuated_word ?? w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: w.speaker,
        }))
      : undefined;

    const paragraphs = alt.paragraphs?.paragraphs;
    const segments: TranscriptSegment[] | undefined = Array.isArray(paragraphs)
      ? paragraphs.flatMap((p: any) =>
          (p.sentences ?? []).map((s: any) => ({
            text: s.text,
            start: s.start,
            end: s.end,
            speaker: p.speaker,
          })),
        )
      : undefined;

    const durationSec = data?.metadata?.duration;
    return {
      text:        alt.transcript ?? '',
      language:    channel?.detected_language ?? options.language,
      durationSec,
      usage:       { durationSec },
      segments,
      words,
      provider:    this.name,
      model:       options.model ?? this.defaultModel,
      raw:         data,
    };
  }
}
