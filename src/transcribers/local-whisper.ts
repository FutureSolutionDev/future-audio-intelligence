import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AudioSource,
  TranscribeOptions,
  Transcriber,
  TranscriptionResult,
  TranscriptSegment,
} from '../types/index.js';
import { TranscriptionError } from '../types/index.js';
import { resolveAudio } from '../utils/audio-source.js';

export interface LocalWhisperConfig {
  /** Path to the whisper.cpp `main` binary. */
  binaryPath: string;
  /** Path to the .bin model file (e.g. ggml-large-v3.bin). */
  modelPath: string;
  /** Threads to use. Defaults to 4. */
  threads?: number;
  /** Default language. 'auto' lets whisper detect. */
  defaultLanguage?: string;
}

/**
 * Local Whisper provider — wraps the whisper.cpp CLI.
 * Use this when you need zero per-call cost, full data privacy,
 * or offline operation. Trade-off: slower than cloud APIs, no
 * native diarization, requires GPU for real-time-ish performance
 * on large models.
 *
 * Setup outside this module:
 *   git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp && make
 *   bash ./models/download-ggml-model.sh large-v3
 */
export class LocalWhisperTranscriber implements Transcriber {
  readonly name = 'local-whisper';
  constructor(private readonly config: LocalWhisperConfig) {
    if (!config.binaryPath) throw new Error('LocalWhisperTranscriber: binaryPath is required');
    if (!config.modelPath) throw new Error('LocalWhisperTranscriber: modelPath is required');
  }

  async transcribe(
    source: AudioSource,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const audio = await resolveAudio(source);
    const workDir = await mkdtemp(join(tmpdir(), 'whisper-'));
    const inputFile = join(workDir, audio.filename);
    const outputBase = join(workDir, 'out');

    await writeFile(inputFile, audio.data);

    const language = options.language ?? this.config.defaultLanguage ?? 'auto';
    const args = [
      '-m', this.config.modelPath,
      '-f', inputFile,
      '-of', outputBase,
      '-oj', // JSON output
      '-t', String(this.config.threads ?? 4),
      '-l', language,
    ];
    if (options.prompt) args.push('--prompt', options.prompt);

    try {
      await this.runBinary(args);
      const jsonPath = `${outputBase}.json`;
      const json = JSON.parse(await readFile(jsonPath, 'utf-8'));

      const segments: TranscriptSegment[] = (json.transcription ?? []).map((t: any) => ({
        text: t.text?.trim() ?? '',
        start: parseTimestamp(t.offsets?.from ?? t.timestamps?.from),
        end: parseTimestamp(t.offsets?.to ?? t.timestamps?.to),
      }));

      const text = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();

      return {
        text,
        language: json.result?.language ?? (language === 'auto' ? undefined : language),
        segments,
        provider: this.name,
        model: this.config.modelPath.split('/').pop(),
        raw: json,
      };
    } catch (err) {
      throw new TranscriptionError(
        `Local whisper failed: ${err instanceof Error ? err.message : String(err)}`,
        this.name,
        err,
      );
    } finally {
      // Best-effort cleanup; ignore errors.
      await Promise.allSettled([
        unlink(inputFile),
        unlink(`${outputBase}.json`),
      ]);
    }
  }

  private runBinary(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.binaryPath, args, { stdio: 'pipe' });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`whisper exited ${code}: ${stderr.slice(0, 500)}`));
      });
    });
  }
}

/** whisper.cpp timestamps are either ms (number) or "HH:MM:SS,mmm" strings. */
function parseTimestamp(ts: unknown): number {
  if (typeof ts === 'number') return ts / 1000;
  if (typeof ts !== 'string') return 0;
  const m = ts.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
  if (!m) return 0;
  const [, h, min, sec, ms] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(sec) + Number(ms) / 1000;
}
