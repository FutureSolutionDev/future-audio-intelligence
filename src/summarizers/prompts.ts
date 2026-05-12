import type { SummarizeOptions, SummaryStyle } from '../types/index.js';

const STYLE_PROMPTS: Record<Exclude<SummaryStyle, 'custom'>, string> = {
  brief:
    'Summarize the following transcript in 2-3 concise sentences. ' +
    'Capture only the main point — no filler, no preamble.',

  bullets:
    'Summarize the following transcript as a list of 5-8 bullet points. ' +
    'Each bullet must be self-contained, factual, and ordered by importance. ' +
    'No preamble like "Here is the summary".',

  detailed:
    'Write a detailed multi-paragraph summary of the transcript below. ' +
    'Cover all major themes, decisions, and noteworthy details. ' +
    'Preserve the speaker\'s intent and any nuance. Do not invent information.',

  action_items:
    'Read the transcript and extract a clean list of action items, decisions, and follow-ups. ' +
    'Return your response as JSON with this exact shape, and nothing else:\n' +
    '{"summary": "<2-3 sentence overview>", "actionItems": ["<item 1>", "<item 2>"], "topics": ["<topic 1>"]}\n' +
    'If there are no action items, return an empty array. Do not wrap the JSON in markdown fences.',

  meeting_notes:
    'Format the transcript below as structured meeting notes. Use these sections:\n' +
    '## Overview\n## Key Decisions\n## Action Items\n## Open Questions\n## Topics Discussed\n' +
    'Be concise; omit a section entirely if there is nothing to put in it.',
};

export function buildSummaryPrompt(text: string, options: SummarizeOptions): string {
  const style = options.style ?? 'brief';
  let instruction =
    style === 'custom'
      ? options.customPrompt ?? STYLE_PROMPTS.brief
      : STYLE_PROMPTS[style];

  if (options.outputLanguage) {
    instruction += `\n\nWrite the summary in ${options.outputLanguage}.`;
  }
  if (options.context) {
    instruction += `\n\nAdditional context to consider:\n${options.context}`;
  }

  return `${instruction}\n\n---\nTranscript:\n${text}`;
}

/**
 * Prompt used when recursively summarizing a list of chunk summaries
 * into one final summary.
 */
export function buildReducePrompt(
  chunkSummaries: string[],
  options: SummarizeOptions,
): string {
  const style = options.style ?? 'brief';
  const baseInstruction =
    style === 'custom'
      ? options.customPrompt ?? STYLE_PROMPTS.brief
      : STYLE_PROMPTS[style];

  const langClause = options.outputLanguage
    ? `\n\nWrite the final summary in ${options.outputLanguage}.`
    : '';

  const joined = chunkSummaries
    .map((s, i) => `--- Chunk ${i + 1} ---\n${s}`)
    .join('\n\n');

  return (
    `You will receive multiple partial summaries of consecutive sections of ` +
    `the same long transcript. Merge them into one coherent final summary ` +
    `following this instruction:\n\n${baseInstruction}${langClause}\n\n` +
    `Do not repeat yourself. Eliminate redundancy. Maintain temporal order ` +
    `where it matters.\n\n${joined}`
  );
}

export interface ParsedSummary {
  summary: string;
  actionItems?: string[];
  topics?: string[];
}

/**
 * Try to parse a JSON summary (used for action_items style).
 * Falls back to plain text on failure.
 */
export function tryParseJsonSummary(raw: string): ParsedSummary {
  // Strip common markdown fences just in case.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed && typeof parsed.summary === 'string') {
      return {
        summary: parsed.summary,
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : undefined,
        topics: Array.isArray(parsed.topics) ? parsed.topics : undefined,
      };
    }
  } catch {
    // fall through
  }
  return { summary: raw };
}
