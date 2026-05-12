/**
 * Custom provider example.
 *
 * Any OpenAI-compatible Chat Completions API can be added by extending
 * the base class. This example wires up Groq and DeepSeek — but the same
 * pattern works for Together AI, Fireworks, Anyscale, your own gateway,
 * or any locally-hosted vLLM/Ollama instance.
 */

import {
  OpenAICompatibleSummarizer,
  type OpenAICompatibleConfig,
} from '../src/index.js';

// --- Groq (very fast LPU inference) ---
class GroqSummarizer extends OpenAICompatibleSummarizer {
  constructor(config: { apiKey: string; defaultModel?: string }) {
    super({
      providerName: 'groq',
      baseURL: 'https://api.groq.com/openai/v1',
      defaultModel: config.defaultModel ?? 'llama-3.3-70b-versatile',
      apiKey: config.apiKey,
    });
  }
}

// --- DeepSeek (cheap, strong on reasoning) ---
class DeepSeekSummarizer extends OpenAICompatibleSummarizer {
  constructor(config: { apiKey: string; defaultModel?: string }) {
    super({
      providerName: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      defaultModel: config.defaultModel ?? 'deepseek-chat',
      apiKey: config.apiKey,
    });
  }
}

// --- Local Ollama server (zero cost, full privacy) ---
class OllamaSummarizer extends OpenAICompatibleSummarizer {
  constructor(config: { baseURL?: string; defaultModel?: string }) {
    super({
      providerName: 'ollama',
      baseURL: config.baseURL ?? 'http://localhost:11434/v1',
      defaultModel: config.defaultModel ?? 'llama3.2',
      apiKey: 'ollama', // Ollama ignores the key but our base class requires one
    });
  }
}

// Usage:
const groq = new GroqSummarizer({ apiKey: process.env.GROQ_API_KEY! });
const deepseek = new DeepSeekSummarizer({ apiKey: process.env.DEEPSEEK_API_KEY! });
const ollama = new OllamaSummarizer({});

const text = 'A long transcript here...';
const summary = await groq.summarize(text, { style: 'bullets' });
console.log(summary.summary);

// Each new provider = ~10 lines. Same for Together AI, Fireworks, Anyscale,
// or any vendor that implements /chat/completions.
