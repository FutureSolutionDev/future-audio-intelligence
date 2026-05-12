import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AudioSource } from '../types/index.js';

export interface ResolvedAudio {
  data: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

const EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mpga: 'audio/mpeg',
  mpeg: 'audio/mpeg',
};

function guessMime(filename: string, fallback = 'audio/mpeg'): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? fallback;
}

/**
 * Resolves any AudioSource to an in-memory Buffer + metadata.
 * Note: for very large files prefer providers that accept streams/URLs
 * directly to avoid loading everything into RAM.
 */
export async function resolveAudio(source: AudioSource): Promise<ResolvedAudio> {
  switch (source.type) {
    case 'path': {
      const data = await readFile(source.path);
      const filename = basename(source.path);
      return {
        data,
        filename,
        mimeType: guessMime(filename),
        sizeBytes: data.byteLength,
      };
    }
    case 'url': {
      const res = await fetch(source.url);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status} ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();
      const data = Buffer.from(arrayBuffer);
      const filename = source.url.split('/').pop()?.split('?')[0] ?? 'audio.mp3';
      return {
        data,
        filename,
        mimeType: res.headers.get('content-type') ?? guessMime(filename),
        sizeBytes: data.byteLength,
      };
    }
    case 'buffer': {
      const filename = source.filename ?? 'audio.mp3';
      return {
        data: source.data,
        filename,
        mimeType: source.mimeType ?? guessMime(filename),
        sizeBytes: source.data.byteLength,
      };
    }
    case 'blob': {
      const data = Buffer.from(await source.data.arrayBuffer());
      const filename = 'audio.mp3';
      return {
        data,
        filename,
        mimeType: source.data.type || guessMime(filename),
        sizeBytes: data.byteLength,
      };
    }
  }
}

/**
 * Cheap existence check used by local-only providers.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
