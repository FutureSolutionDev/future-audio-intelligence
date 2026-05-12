# audio-intelligence

> Provider-agnostic audio transcription + summarization for Bun and Node.js.
> Auto free-to-paid fallback, persistent storage (local / SQLite / S3), and strong Arabic support out of the box.

---

## Install

```bash
bun add future-audio-intelligence
# or
npm install future-audio-intelligence
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
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,   // free first
    openaiApiKey:   process.env.OPENAI_API_KEY,     // paid fallback
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
console.log(transcription.usage);   // { durationSec: 139.4 }
console.log(summary?.summary);
console.log(summary?.usage);        // { inputTokens: 221, outputTokens: 60 }
console.log(saved?.location);       // outputs/uuid.json
```

---

## Transcription Providers

| Provider | Key env var | Billing | Notes |
| -------- | ----------- | ------- | ----- |
| **Deepgram Nova-3** | `DEEPGRAM_API_KEY` | Per second | Free: 200h/month. Strong Arabic dialects |
| **OpenAI Whisper** | `OPENAI_API_KEY` | Per minute | Paid. 25 MB file limit |
| **Local Whisper** | — | Free | Needs binary + model on disk |

### Auto Free-to-Paid Transcriber

Tries providers in order. Falls back automatically on error or empty result:

```ts
new AutoFreeToPaidTranscriber({
  deepgramApiKey: '...',  // tried first
  openaiApiKey:   '...',  // fallback
})
```

---

## Summarization Providers

| Provider | Key env var | Notes |
| -------- | ----------- | ----- |
| **OpenRouter** | `OPENROUTER_API_KEY` | Free models available (Llama, Mistral, etc.) |
| **Gemini** | `GEMINI_API_KEY` | Free tier. 1M token context |
| **OpenAI** | `OPENAI_API_KEY` | Paid. Defaults to `gpt-4o-mini` |

### Auto Free-to-Paid Summarizer

```ts
new AutoFreeToPaidSummarizer({
  openrouterApiKey: '...',  // free first
  geminiApiKey:     '...',  // free fallback
  openaiApiKey:     '...',  // paid last resort
})
```

### Summary Styles

```ts
summarize: { style: 'brief' }         // 2–3 sentences
summarize: { style: 'bullets' }       // bullet points
summarize: { style: 'detailed' }      // multi-paragraph
summarize: { style: 'action_items' }  // decisions + TODOs
summarize: { style: 'meeting_notes' } // structured format
summarize: { style: 'custom', customPrompt: '...' }
```

---

## Storage Backends

Set via `AUDIO_STORAGE` env var. Default: `local`.

### Local (default)

One JSON file per operation: `outputs/{id}.json`

```bash
AUDIO_STORAGE=local
AUDIO_OUTPUT_DIR=./outputs   # optional
```

### SQLite

```bash
AUDIO_STORAGE=sqlite
SQLITE_PATH=./audio-intelligence.db   # optional
```

### S3

```bash
bun add @aws-sdk/client-s3

AUDIO_STORAGE=s3
S3_BUCKET=my-bucket
S3_REGION=us-east-1
S3_PREFIX=audio-intelligence/         # optional
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### Retrieve by ID

```ts
const store = createStorageFromEnv();

// get one
const record = await store.getById('uuid-here');

// list recent
const history = await store.list({ limit: 20 });
```

### Stored fields (default)

```json
{
  "id": "uuid-v4",
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
    "actionItems": [],
    "topics": [],
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "usage": { "inputTokens": 221, "outputTokens": 60 }
  }
}
```

`segments`, `words`, and raw provider responses are excluded by default. Enable them:

```ts
new AudioIntelligencePipeline({
  // ...
  storeOptions: {
    includeSegments: true,
    includeWords:    true,
    includeRaw:      true,
  },
});
```

---

## Environment Variables

Copy `.env.example` → `.env`:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `DEEPGRAM_API_KEY` | For Deepgram | STT — free 200h/month |
| `OPENAI_API_KEY` | For OpenAI | STT + summarization paid fallback |
| `OPENROUTER_API_KEY` | For OpenRouter | Summarization — free models |
| `GEMINI_API_KEY` | For Gemini | Summarization — free tier |
| `AUDIO_STORAGE` | No | `local` \| `sqlite` \| `s3` (default: `local`) |
| `AUDIO_OUTPUT_DIR` | No | Local output directory (default: `./outputs`) |
| `SQLITE_PATH` | No | SQLite file path (default: `./audio-intelligence.db`) |
| `S3_BUCKET` | If S3 | S3 bucket name |
| `S3_REGION` | If S3 | AWS region |
| `S3_PREFIX` | No | Key prefix in bucket |
| `AWS_ACCESS_KEY_ID` | If S3 | AWS credentials (or use IAM role) |
| `AWS_SECRET_ACCESS_KEY` | If S3 | AWS credentials |

---

## Publish to npm

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions (`.github/workflows/publish.yml`) will: install → test → build → publish automatically.

Requires `NPM_TOKEN` secret in GitHub repository settings.

---

## License

MIT
