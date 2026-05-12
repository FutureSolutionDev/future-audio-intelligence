/**
 * Split long text into overlapping chunks that respect sentence boundaries
 * as much as possible. Used by summarizers when a transcript exceeds the
 * context window (or the user-defined threshold).
 *
 * Strategy: prefer paragraph breaks, then sentence breaks, then hard cut.
 * A small overlap preserves context across chunk boundaries.
 */
export function chunkText(
  text: string,
  options: { maxChars: number; overlapChars?: number } = { maxChars: 60_000 },
): string[] {
  const { maxChars, overlapChars = 500 } = options;

  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.length - cursor;
    if (remaining <= maxChars) {
      chunks.push(text.slice(cursor));
      break;
    }

    // Aim for cursor + maxChars, but try to find a clean break point.
    const idealEnd = cursor + maxChars;
    const window = text.slice(cursor, idealEnd);

    // Prefer paragraph break, then sentence break, then whitespace.
    const breakIdx =
      lastIndexOfAny(window, ['\n\n']) ??
      lastIndexOfAny(window, ['. ', '? ', '! ', '。', '؟ ', '. ', '\n']) ??
      lastIndexOfAny(window, [' ']) ??
      window.length;

    const chunkEnd = cursor + breakIdx;
    chunks.push(text.slice(cursor, chunkEnd).trim());

    // Move cursor forward with a small overlap for continuity.
    cursor = Math.max(chunkEnd - overlapChars, chunkEnd);
  }

  return chunks.filter((c) => c.length > 0);
}

function lastIndexOfAny(haystack: string, needles: string[]): number | null {
  let best = -1;
  for (const needle of needles) {
    const idx = haystack.lastIndexOf(needle);
    if (idx > best) best = idx;
  }
  return best > 0 ? best + 1 : null;
}

/**
 * Rough token estimator. Real tokenization differs per model; this is
 * intentionally generous to avoid overflow.
 */
export function estimateTokens(text: string): number {
  // ~4 chars/token for English, ~2-3 for Arabic. Use 3 as a safe middle ground.
  return Math.ceil(text.length / 3);
}
