# audio-intelligence

> Provider-agnostic audio transcription + summarization for Bun and Node.js.
> Auto free-to-paid fallback, persistent storage (local / SQLite / S3), and strong Arabic support out of the box.

---

## Table of Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick Start](#quick-start)
- [Audio Sources](#audio-sources)
- [Transcription Providers](#transcription-providers)
- [Summarization Providers](#summarization-providers)
- [Storage Backends](#storage-backends)
- [Logging & Diagnostics](#logging--diagnostics)
- [What Gets Stored](#what-gets-stored)
- [HTTP Integration (Hono)](#http-integration-hono)
- [Environment Variables](#environment-variables)
- [Node.js Compatibility](#nodejs-compatibility)
- [CI/CD — Publish to npm](#cicd--publish-to-npm)

---

## Requirements

| Runtime | Minimum version | Notes |
| ------- | --------------- | ----- |
| **Bun** | 1.0.0+ | Recommended. SQLite built-in. |
| **Node.js** | 18.0.0+ | Requires native `fetch`. SQLite needs `better-sqlite3`. |

---

## Install

```bash
# Bun
bun add future-audio-intelligence

# Node.js
npm install future-audio-intelligence
```

### Optional peer packages

Install only what you need:

```bash
# S3 storage backend
bun add @aws-sdk/client-s3

# SQLite on Node.js (Bun has built-in bun:sqlite — no package needed)
npm install better-sqlite3
```

---

## Quick Start

```ts
import {
  AudioIntelligencePipeline,
  AutoFreeToPaidTranscriber,
  AutoFreeToPaidSummarizer,
  createStorageFromEnv,
} from 'future-audio-intelligence';

const pipeline = new AudioIntelligencePipeline({
  transcriber: new AutoFreeToPaidTranscriber({
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,    // free first
    openaiApiKey:   process.env.OPENAI_API_KEY,      // paid fallback
  }),
  summarizer: new AutoFreeToPaidSummarizer({
    openrouterApiKey: process.env.OPENROUTER_API_KEY, // free first
    geminiApiKey:     process.env.GEMINI_API_KEY,     // free fallback
    openaiApiKey:     process.env.OPENAI_API_KEY,     // paid last resort
  }),
  storage: createStorageFromEnv(), // reads AUDIO_STORAGE env var
});

const { transcription, summary, saved } = await pipeline.process(
  { type: 'path', path: './meeting.mp3' },
  {
    transcribe: { language: 'ar' },
    summarize:  { style: 'bullets' },
  },
);

console.log(transcription.text);
console.log(transcription.usage);  // { durationSec: 139.4 }
console.log(summary?.summary);
console.log(summary?.usage);       // { inputTokens: 221, outputTokens: 60 }
console.log(saved?.id);            // uuid-v4
console.log(saved?.location);      // outputs/uuid.json
```

---

## Audio Sources

Four source types are supported — providers handle conversion internally:

```ts
// Local file
{ type: 'path', path: './audio.mp3' }

// Remote URL (Deepgram fetches it directly — no upload from your server)
{ type: 'url', url: 'https://example.com/audio.mp3' }

// In-memory Buffer (e.g. from a file upload)
{ type: 'buffer', data: buffer, filename: 'audio.mp3', mimeType: 'audio/mpeg' }

// Blob (e.g. from browser File input)
{ type: 'blob', data: blob }
```

---

## Transcription Providers

### Available providers

| Provider | Env var | Billing | Limit | Notes |
| -------- | ------- | ------- | ----- | ----- |
| **Deepgram Nova-3** | `DEEPGRAM_API_KEY` | Per second | — | Free: 200h/month. Best Arabic dialect support |
| **OpenAI Whisper** | `OPENAI_API_KEY` | Per minute | 25 MB | Paid. `whisper-1` / `gpt-4o-transcribe` |
| **Local Whisper** | — | Free | — | Requires Whisper binary + model file on disk |

### AutoFreeToPaidTranscriber

Tries providers in order. Falls back automatically on error **or** empty transcript:

```ts
new AutoFreeToPaidTranscriber({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,  // tried first
  openaiApiKey:   process.env.OPENAI_API_KEY,    // fallback if Deepgram fails
  // deepgramModel: 'nova-3',   // optional override
  // openaiModel:   'whisper-1',
})
```

### Use a single provider directly

```ts
import { DeepgramTranscriber, OpenAITranscriber } from 'future-audio-intelligence';

new DeepgramTranscriber({ apiKey: '...', defaultModel: 'nova-3' })
new OpenAITranscriber({ apiKey: '...', defaultModel: 'whisper-1' })
```

### Transcribe options

```ts
transcribe: {
  language:        'ar',    // ISO 639-1 code, or 'auto' to detect
  diarize:         true,    // speaker separation (Deepgram)
  wordTimestamps:  true,    // word-level timestamps
  vocabulary:      ['اسم خاص', 'مصطلح'],  // boost domain terms
}
```

---

## Summarization Providers

### Supported summarization providers

| Provider | Env var | Billing | Default model | Notes |
| -------- | ------- | ------- | ------------- | ----- |
| **OpenRouter** | `OPENROUTER_API_KEY` | Free models available | `llama-3.3-70b-instruct:free` | Gateway to 300+ models |
| **Gemini** | `GEMINI_API_KEY` | Free tier | `gemini-2.5-flash` | 1M token context |
| **OpenAI** | `OPENAI_API_KEY` | Paid | `gpt-4o-mini` | 128K context |

### AutoFreeToPaidSummarizer

Tries providers in order. Falls back on error or empty response:

```ts
new AutoFreeToPaidSummarizer({
  openrouterApiKey: process.env.OPENROUTER_API_KEY, // free first
  geminiApiKey:     process.env.GEMINI_API_KEY,     // free fallback
  openaiApiKey:     process.env.OPENAI_API_KEY,     // paid last resort
  // openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  // geminiModel:     'gemini-2.5-flash',
  // openaiModel:     'gpt-4o-mini',
})
```

### Single provider usage

```ts
import { OpenRouterSummarizer, GeminiSummarizer, OpenAISummarizer } from 'future-audio-intelligence';

new OpenRouterSummarizer({ apiKey: '...', defaultModel: 'anthropic/claude-sonnet-4' })
new GeminiSummarizer({ apiKey: '...', defaultModel: 'gemini-2.5-pro' })
new OpenAISummarizer({ apiKey: '...', defaultModel: 'gpt-4o' })
```

### Summary styles

```ts
summarize: { style: 'brief' }          // 2–3 sentences
summarize: { style: 'bullets' }        // bullet points
summarize: { style: 'detailed' }       // multi-paragraph
summarize: { style: 'action_items' }   // decisions + TODOs (structured JSON)
summarize: { style: 'meeting_notes' }  // structured meeting format
summarize: {
  style:        'custom',
  customPrompt: 'Summarize this in Egyptian Arabic with 3 bullet points.',
  outputLanguage: 'Egyptian Arabic',
  maxTokens:    500,
}
```

---

## Storage Backends

### Local (default)

One JSON file per operation: `{outputDir}/{id}.json`

```bash
AUDIO_STORAGE=local
AUDIO_OUTPUT_DIR=./outputs   # optional, default: ./outputs
```

### SQLite

Single queryable database file. Auto-detects runtime:

- **Bun** → uses built-in `bun:sqlite` (no package needed)
- **Node.js** → requires `better-sqlite3`:

```bash
npm install better-sqlite3     # Node.js only
```

```bash
AUDIO_STORAGE=sqlite
SQLITE_PATH=./audio-intelligence.db   # optional
```

### S3

Requires `@aws-sdk/client-s3`:

```bash
bun add @aws-sdk/client-s3
# or
npm install @aws-sdk/client-s3
```

```bash
AUDIO_STORAGE=s3
S3_BUCKET=my-bucket
S3_REGION=us-east-1
S3_PREFIX=audio-intelligence/    # optional key prefix
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Or use an IAM role — credentials are optional if role is attached
```

Each operation is stored under: `s3://{bucket}/{prefix}{id}/result.json`

### Retrieve by ID

```ts
const store = createStorageFromEnv();

// Get a single record by UUID
const record = await store.getById('550e8400-e29b-41d4-a716-446655440000');
if (record) {
  console.log(record.transcription.text);
  console.log(record.summary?.summary);
}

// List recent operations (most recent first)
const history = await store.list({ limit: 20, offset: 0 });
```

### Use a backend directly (without env var)

```ts
import {
  LocalOutputStore,
  SQLiteOutputStore,
  S3OutputStore,
} from 'future-audio-intelligence';

const store = new SQLiteOutputStore({ dbPath: './my.db' });
const store = new LocalOutputStore({ outputDir: './data' });
const store = new S3OutputStore({ bucket: 'my-bucket', region: 'us-east-1' });
```

---

## Logging & Diagnostics

`AutoFreeToPaidTranscriber` and `AutoFreeToPaidSummarizer` log every attempt and fallback to **stderr** by default:

```text
[16:46:15.641] [transcriber] starting — source=path, lang=ar, providers=deepgram → openai
[16:46:15.652] [transcriber] ┌─ attempt 1/2 → deepgram
[16:46:22.618] [transcriber] └─ ✓ success (1/2): deepgram | model=nova-3 | lang=ar | chars=498 | 6966ms

[16:46:22.619] [summarizer] starting — 498 chars, style=bullets, providers=openrouter → gemini → openai
[16:46:22.619] [summarizer] ┌─ attempt 1/3 → openrouter
[16:47:44.633] [summarizer] └─ ✗ failed  (1/3): openrouter — HTTP 429 — Provider returned error
[16:47:44.633] [summarizer] ┌─ attempt 2/3 → gemini
[16:47:52.126] [summarizer] └─ ✓ success (2/3): gemini | model=gemini-2.5-flash | tokens=221→60 | 7493ms
```

**Silence logs:**

```ts
new AutoFreeToPaidSummarizer({
  // ...
  logger: () => {},  // no-op
})
```

**Custom logger (e.g. pipe to your app logger):**

```ts
new AutoFreeToPaidTranscriber({
  // ...
  logger: (msg) => myLogger.debug(msg),
})
```

---

## What Gets Stored

### Default (minimal set)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "audioName": "meeting",
  "processedAt": "2026-05-12T17:00:00.000Z",
  "transcription": {
    "text": "...",
    "language": "ar",
    "durationSec": 139.4,
    "usage": { "durationSec": 139.4 },
    "provider": "deepgram",
    "model": "nova-3"
  },
  "summary": {
    "summary": "...",
    "actionItems": ["..."],
    "topics": ["..."],
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "usage": { "inputTokens": 221, "outputTokens": 60 }
  }
}
```

### Excluded by default (enable via `storeOptions`)

| Field | Why excluded | How to enable |
| ----- | ------------ | ------------- |
| `transcription.segments` | Timestamps per sentence — large, rarely needed after processing | `includeSegments: true` |
| `transcription.words` | Word-level timestamps — very large, for subtitle generation only | `includeWords: true` |
| `transcription.raw` | Raw provider response — for debugging only | `includeRaw: true` |
| `summary.raw` | Raw LLM response — for debugging only | `includeRaw: true` |

```ts
new AudioIntelligencePipeline({
  transcriber,
  summarizer,
  storage,
  storeOptions: {
    includeSegments: true,   // default: false
    includeWords:    true,   // default: false
    includeRaw:      true,   // default: false
  },
});
```

---

## HTTP Integration (Hono)

See `examples/hono-integration.ts` for a full example. Key endpoints:

```text
POST /api/transcribe          multipart file upload → transcript + summary
POST /api/transcribe-url      { url, language?, style? } → transcript + summary
GET  /api/records             list saved operations (most recent first)
GET  /api/records/:id         get one operation by UUID
```

Response shape:

```json
{
  "id": "uuid-v4",
  "transcript": "...",
  "language": "ar",
  "usage": {
    "transcription": { "durationSec": 139.4 },
    "summarization": { "inputTokens": 221, "outputTokens": 60 }
  },
  "summary": "...",
  "actionItems": ["..."],
  "topics": ["..."],
  "providers": {
    "transcription": "deepgram",
    "summarization": "gemini"
  }
}
```

---

## Environment Variables

Copy `.env.example` → `.env`.

### Where to get each key

#### `DEEPGRAM_API_KEY` — Speech-to-Text (free tier)

1. Go to [console.deepgram.com](https://console.deepgram.com)
2. Sign up → create a project
3. **API Keys** → **Create a new API key**
4. Free tier: **200 hours/month** — no credit card required

#### `OPENAI_API_KEY` — STT fallback + summarization fallback (paid)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in → **Create new secret key**
3. Add billing at [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing)
4. Used as: Whisper transcription (`whisper-1`) + `gpt-4o-mini` summarization

#### `OPENROUTER_API_KEY` — Summarization (free models available)

1. Go to [openrouter.ai](https://openrouter.ai) → Sign in with GitHub
2. **Keys** → **Create Key**
3. Many models are free (Llama, Mistral, Gemma). No credit card needed for free models.
4. Default model used: `meta-llama/llama-3.3-70b-instruct:free`

#### `GEMINI_API_KEY` — Summarization fallback (free tier)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with a Google account
3. Click **Get API key** → **Create API key**
4. Free tier is generous (1,500 requests/day for `gemini-2.5-flash`)

#### AWS credentials — S3 storage only

> Only needed if `AUDIO_STORAGE=s3`

1. Go to [console.aws.amazon.com/iam](https://console.aws.amazon.com/iam)
2. **Users** → **Create user** → attach policy `AmazonS3FullAccess` (or a scoped policy)
3. **Security credentials** → **Create access key** → choose "Application running outside AWS"
4. Copy `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
5. Create a bucket at [console.aws.amazon.com/s3](https://console.aws.amazon.com/s3) → set `S3_BUCKET` and `S3_REGION`

> **Tip:** On EC2 / ECS / Lambda, attach an IAM role instead — omit `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` entirely.

---

### Full variable reference

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `DEEPGRAM_API_KEY` | For Deepgram | — | STT — free 200h/month |
| `OPENAI_API_KEY` | For OpenAI | — | STT + summarization paid fallback |
| `OPENROUTER_API_KEY` | For OpenRouter | — | Summarization — free models available |
| `GEMINI_API_KEY` | For Gemini | — | Summarization — free tier |
| `AUDIO_STORAGE` | No | `local` | `local` \| `sqlite` \| `s3` |
| `AUDIO_OUTPUT_DIR` | No | `./outputs` | Local storage directory |
| `SQLITE_PATH` | No | `./audio-intelligence.db` | SQLite file path |
| `S3_BUCKET` | If S3 | — | S3 bucket name |
| `S3_REGION` | If S3 | — | AWS region (e.g. `us-east-1`) |
| `S3_PREFIX` | No | `audio-intelligence/` | Key prefix inside the bucket |
| `AWS_ACCESS_KEY_ID` | If S3, no IAM | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | If S3, no IAM | — | AWS secret key |

---

## Node.js Compatibility

The library targets **Node.js 18+** and **Bun 1+**.

| Feature | Bun | Node.js 18+ | Notes |
| ------- | --- | ----------- | ----- |
| `fetch` (global) | ✅ | ✅ | Node 18 added native fetch |
| SQLite | ✅ built-in | ⚠️ needs `better-sqlite3` | Auto-detected at runtime |
| S3 | ✅ | ✅ | Needs `@aws-sdk/client-s3` |
| ESM (`type: module`) | ✅ | ✅ | Uses `createRequire` — no bare `require()` |
| `FormData` / `Blob` | ✅ | ✅ | Node 18+ has both |

---

## CI/CD — Publish to npm

Push a version tag to trigger the GitHub Actions workflow:

```bash
# 1. Bump version in package.json
bun version patch   # or minor / major

# 2. Tag and push
git tag v1.0.1
git push origin v1.0.1
```

The workflow (`.github/workflows/publish.yml`) runs:

1. `bun install`
2. `bun test`
3. `bun run build`
4. `npm publish --access public --provenance`

**Required secret:** Add `NPM_TOKEN` in your GitHub repository → Settings → Secrets → Actions.

---

## Community

Want to take part — ideas, testing, or just following along?

Join the Discord: **<https://discord.gg/v4ACAn5CKf>**

---

## License

MIT
