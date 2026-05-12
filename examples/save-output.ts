/**
 * Shared output-saving helper for all examples.
 *
 * Creates:  outputs/<timestamp>-<audioName>/
 *   ├── result.json        ← full raw object (everything)
 *   ├── transcript.txt     ← نص الـ transcription كاملاً
 *   ├── summary.txt        ← الملخص فقط
 *   ├── segments.json      ← timestamps لكل segment (لو متاح)
 *   ├── words.json         ← word-level timestamps (لو متاح)
 *   └── report.md          ← تقرير مقروء يجمع كل حاجة
 */

import { mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { ProcessResult } from '../src/pipeline.js';

export function saveOutput(result: ProcessResult, audioPath: string): string {
  const audioName = basename(audioPath, audioPath.includes('.') ? '.' + audioPath.split('.').pop() : '');
  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir     = join(process.cwd(), 'outputs', `${timestamp}-${audioName}`);

  mkdirSync(outDir, { recursive: true });

  const { transcription, summary } = result;

  // 1. Full JSON — كل حاجة خاماً
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8');

  // 2. Transcript plain text
  writeFileSync(join(outDir, 'transcript.txt'), transcription.text, 'utf8');

  // 3. Summary plain text
  if (summary) {
    const summaryLines = [summary.summary];

    if (summary.actionItems?.length) {
      summaryLines.push('\n--- Action Items ---');
      summary.actionItems.forEach((item, i) => summaryLines.push(`${i + 1}. ${item}`));
    }

    if (summary.topics?.length) {
      summaryLines.push('\n--- Topics ---');
      summary.topics.forEach((t) => summaryLines.push(`• ${t}`));
    }

    writeFileSync(join(outDir, 'summary.txt'), summaryLines.join('\n'), 'utf8');
  }

  // 4. Segments with timestamps
  if (transcription.segments?.length) {
    writeFileSync(join(outDir, 'segments.json'), JSON.stringify(transcription.segments, null, 2), 'utf8');
  }

  // 5. Word-level timestamps
  if (transcription.words?.length) {
    writeFileSync(join(outDir, 'words.json'), JSON.stringify(transcription.words, null, 2), 'utf8');
  }

  // 6. Human-readable markdown report
  const report = buildReport(result, audioPath);
  writeFileSync(join(outDir, 'report.md'), report, 'utf8');

  return outDir;
}

function buildReport(result: ProcessResult, audioPath: string): string {
  const { transcription, summary } = result;
  const now = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  const lines: string[] = [
    '# Audio Intelligence Report',
    '',
    `**Generated:** ${now}`,
    `**Audio file:** \`${audioPath}\``,
    '',
    '---',
    '',
    '## Transcription',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Provider | ${transcription.provider} |`,
    `| Model | ${transcription.model ?? '—'} |`,
    `| Language | ${transcription.language ?? 'unknown'} |`,
    `| Duration | ${transcription.durationSec != null ? transcription.durationSec.toFixed(1) + 's' : '—'} |`,
    `| Characters | ${transcription.text.length.toLocaleString()} |`,
    `| Segments | ${transcription.segments?.length ?? 0} |`,
    `| Words (timestamped) | ${transcription.words?.length ?? 0} |`,
    '',
    '### Full Transcript',
    '',
    transcription.text || '*(empty)*',
    '',
  ];

  // Segments table (first 20 only to keep the report readable)
  if (transcription.segments?.length) {
    lines.push('### Segments (first 20)');
    lines.push('');
    lines.push('| # | Start | End | Speaker | Text |');
    lines.push('|---|-------|-----|---------|------|');
    transcription.segments.slice(0, 20).forEach((seg, i) => {
      const speaker = seg.speaker != null ? String(seg.speaker) : '—';
      const text = seg.text.replace(/\|/g, '\\|').slice(0, 80);
      lines.push(`| ${i + 1} | ${seg.start.toFixed(2)}s | ${seg.end.toFixed(2)}s | ${speaker} | ${text} |`);
    });
    if (transcription.segments.length > 20) {
      lines.push(`\n*... و ${transcription.segments.length - 20} segment أخرى في \`segments.json\`*`);
    }
    lines.push('');
  }

  lines.push('---', '');

  if (summary) {
    lines.push(
      '## Summary',
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| Provider | ${summary.provider} |`,
      `| Model | ${summary.model ?? '—'} |`,
      `| Input tokens | ${summary.usage?.inputTokens?.toLocaleString() ?? '—'} |`,
      `| Output tokens | ${summary.usage?.outputTokens?.toLocaleString() ?? '—'} |`,
      '',
      '### Content',
      '',
      summary.summary,
      '',
    );

    if (summary.actionItems?.length) {
      lines.push('### Action Items', '');
      summary.actionItems.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
      lines.push('');
    }

    if (summary.topics?.length) {
      lines.push('### Topics', '');
      summary.topics.forEach((t) => lines.push(`- ${t}`));
      lines.push('');
    }
  } else {
    lines.push('## Summary', '', '*(not requested or skipped)*', '');
  }

  lines.push('---', '', '*Generated by audio-intelligence/002*');

  return lines.join('\n');
}
