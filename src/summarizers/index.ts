export { AutoFreeToPaidSummarizer } from './auto-free-to-paid.js';
export type { AutoFreeToPaidSummarizerConfig } from './auto-free-to-paid.js';

export { OpenAISummarizer } from './openai.js';
export type { OpenAISummarizerConfig } from './openai.js';

export { OpenRouterSummarizer } from './openrouter.js';
export type { OpenRouterSummarizerConfig } from './openrouter.js';

export { GeminiSummarizer } from './gemini.js';
export type { GeminiSummarizerConfig } from './gemini.js';

// Base class — extend this to add any OpenAI-compatible provider
// (Groq, Together AI, DeepSeek, Fireworks, your own gateway, etc).
export { OpenAICompatibleSummarizer } from './openai-compatible.js';
export type { OpenAICompatibleConfig } from './openai-compatible.js';
