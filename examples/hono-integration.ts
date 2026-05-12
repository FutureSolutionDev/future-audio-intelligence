/**
 * Hono integration example.
 * Exposes the pipeline as HTTP endpoints — file upload or URL.
 *
 * Run with:  bun run examples/hono-integration.ts
 *
 * Endpoints:
 *   POST /api/transcribe       multipart: audio file upload
 *   POST /api/transcribe-url   JSON: { url, language? }
 *   GET  /api/records          list saved operations
 *   GET  /api/records/:id      get one operation by UUID
 */

import { Hono } from 'hono';
import {
  AudioIntelligencePipeline,
  AutoFreeToPaidTranscriber,
  AutoFreeToPaidSummarizer,
  createStorageFromEnv,
  TranscriptionError,
  SummarizationError,
} from '../src/index.js';

// ── Pipeline (created once, shared across all requests) ───────────────────────

const storage = createStorageFromEnv();

const pipeline = new AudioIntelligencePipeline({
  transcriber: new AutoFreeToPaidTranscriber({
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    openaiApiKey:   process.env.OPENAI_API_KEY,
  }),
  summarizer: new AutoFreeToPaidSummarizer({
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    geminiApiKey:     process.env.GEMINI_API_KEY,
    openaiApiKey:     process.env.OPENAI_API_KEY,
  }),
  storage,
});

// ── Routes ────────────────────────────────────────────────────────────────────

const app = new Hono();

/**
 * POST /api/transcribe
 * Body: multipart/form-data with an `audio` file field.
 */
app.post('/api/transcribe', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['audio'];

    if (!(file instanceof File)) {
      return c.json({ error: 'audio field is required (multipart upload)' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await pipeline.process(
      { type: 'buffer', data: buffer, filename: file.name, mimeType: file.type },
      {
        transcribe: { language: 'ar', diarize: true },
        summarize:  { style: 'meeting_notes' },
      },
    );

    return c.json({
      id:          result.saved?.id,
      transcript:  result.transcription.text,
      language:    result.transcription.language,
      usage: {
        transcription: result.transcription.usage,
        summarization: result.summary?.usage,
      },
      summary:     result.summary?.summary,
      actionItems: result.summary?.actionItems,
      topics:      result.summary?.topics,
      providers: {
        transcription: result.transcription.provider,
        summarization: result.summary?.provider,
      },
    });

  } catch (err) {
    return handleError(c, err);
  }
});

/**
 * POST /api/transcribe-url
 * Body: { url: string, language?: string, style?: string }
 */
app.post('/api/transcribe-url', async (c) => {
  try {
    const { url, language, style } = await c.req.json<{
      url: string;
      language?: string;
      style?: string;
    }>();

    if (!url) return c.json({ error: 'url is required' }, 400);

    const result = await pipeline.process(
      { type: 'url', url },
      {
        transcribe: { language: language ?? 'ar' },
        summarize:  { style: (style as any) ?? 'bullets' },
      },
    );

    return c.json({
      id:          result.saved?.id,
      transcript:  result.transcription.text,
      language:    result.transcription.language,
      usage: {
        transcription: result.transcription.usage,
        summarization: result.summary?.usage,
      },
      summary:     result.summary?.summary,
      providers: {
        transcription: result.transcription.provider,
        summarization: result.summary?.provider,
      },
    });

  } catch (err) {
    return handleError(c, err);
  }
});

/**
 * GET /api/records?limit=20
 * Returns list of saved operations (most recent first).
 */
app.get('/api/records', async (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  const records = await storage.list({ limit });

  return c.json(
    records.map((r) => ({
      id:          r.id,
      audioName:   r.audioName,
      processedAt: r.processedAt,
      language:    r.transcription.language,
      durationSec: r.transcription.durationSec,
      transcriber: r.transcription.provider,
      summarizer:  r.summary?.provider,
    })),
  );
});

/**
 * GET /api/records/:id
 * Returns full record by UUID.
 */
app.get('/api/records/:id', async (c) => {
  const record = await storage.getById(c.req.param('id'));
  if (!record) return c.json({ error: 'not found' }, 404);
  return c.json(record);
});

// ── Error handler ─────────────────────────────────────────────────────────────

function handleError(c: any, err: unknown) {
  if (err instanceof TranscriptionError) {
    return c.json({ error: 'transcription_failed', detail: err.message }, 502);
  }
  if (err instanceof SummarizationError) {
    return c.json({ error: 'summarization_failed', detail: err.message }, 502);
  }
  console.error('[hono-integration]', err);
  return c.json({ error: 'internal_error' }, 500);
}

// ── Start server ──────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000);

Bun.serve({ fetch: app.fetch, port: PORT });
console.log(`audio-intelligence API running on http://localhost:${PORT}`);
console.log('  POST /api/transcribe       — multipart file upload');
console.log('  POST /api/transcribe-url   — { url, language?, style? }');
console.log('  GET  /api/records          — list saved operations');
console.log('  GET  /api/records/:id      — get by UUID');
