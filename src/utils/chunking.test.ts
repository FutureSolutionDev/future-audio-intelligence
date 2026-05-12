import { describe, expect, test } from 'bun:test';
import { chunkText, estimateTokens } from './chunking.js';

describe('chunkText', () => {
  test('returns single chunk when text is small', () => {
    const result = chunkText('Hello world', { maxChars: 1000 });
    expect(result).toEqual(['Hello world']);
  });

  test('splits long text into multiple chunks', () => {
    const longText = 'Sentence one. Sentence two. '.repeat(1000);
    const result = chunkText(longText, { maxChars: 500 });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  test('prefers sentence boundaries', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth one.';
    const result = chunkText(text, { maxChars: 35 });
    // Each chunk should end with a sentence terminator (no mid-word cuts).
    for (const chunk of result.slice(0, -1)) {
      expect(chunk).toMatch(/[.!?]$/);
    }
  });

  test('respects paragraph breaks first', () => {
    const text = 'Para one is here.\n\nPara two starts here. It continues.';
    const result = chunkText(text, { maxChars: 25 });
    expect(result[0]).toContain('Para one');
  });

  test('handles Arabic punctuation', () => {
    const text = 'الجملة الأولى. الجملة الثانية؟ الجملة الثالثة! والجملة الرابعة.';
    const result = chunkText(text, { maxChars: 30 });
    expect(result.length).toBeGreaterThan(1);
  });

  test('produces no empty chunks', () => {
    const result = chunkText('A. B. C. D. E. F. G.', { maxChars: 5 });
    for (const chunk of result) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });
});

describe('estimateTokens', () => {
  test('returns a positive integer', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
    expect(Number.isInteger(estimateTokens('hello world'))).toBe(true);
  });

  test('scales with length', () => {
    const short = estimateTokens('hi');
    const long = estimateTokens('hi'.repeat(1000));
    expect(long).toBeGreaterThan(short);
  });
});
