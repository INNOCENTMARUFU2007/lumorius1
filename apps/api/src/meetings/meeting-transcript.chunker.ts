import { createHash } from 'crypto';

export interface MeetingTranscriptSegmentInput {
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
  speaker_label?: string;
  speaker_confidence?: number;
}

export interface MeetingTranscriptChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  startMs: number | null;
  endMs: number | null;
  speakerLabel: string | null;
  speakerConfidence: number | null;
  sourceHash: string;
  charStart: number | null;
  charEnd: number | null;
}

interface ChunkPart {
  text: string;
  startMs: number | null;
  endMs: number | null;
  speakerLabel: string | null;
  speakerConfidence: number | null;
}

function validSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function makeChunk(
  chunkIndex: number,
  content: string,
  startMs: number | null,
  endMs: number | null,
  speakerLabel: string | null,
  speakerConfidence: number | null,
  charStart: number | null,
  charEnd: number | null,
): MeetingTranscriptChunk {
  const safeEnd = endMs !== null && startMs === null ? null : endMs;
  const orderedEnd = safeEnd !== null && startMs !== null && safeEnd < startMs
    ? null
    : safeEnd;
  return {
    chunkIndex,
    content,
    tokenCount: Math.ceil(content.length / 4),
    startMs,
    endMs: orderedEnd,
    speakerLabel,
    speakerConfidence,
    sourceHash: createHash('sha256').update(content, 'utf8').digest('hex'),
    charStart,
    charEnd,
  };
}

function splitRawText(text: string, maxChars: number): MeetingTranscriptChunk[] {
  const chunks: MeetingTranscriptChunk[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + maxChars);
    if (end < text.length) {
      const preferred = text.lastIndexOf(' ', end);
      const minimum = cursor + Math.floor(maxChars * 0.65);
      if (preferred >= minimum) end = preferred;
    }

    const raw = text.slice(cursor, end);
    const leading = raw.length - raw.trimStart().length;
    const trailingTrimmed = raw.trimEnd();
    const content = trailingTrimmed.trimStart();
    const actualStart = cursor + leading;
    const actualEnd = actualStart + content.length;

    if (content) {
      chunks.push(makeChunk(chunks.length, content, null, null, null, null, actualStart, actualEnd));
    }

    cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  }

  return chunks;
}

/**
 * Splits source material without normalising or rewriting its text. Whisper
 * segment boundaries are retained; plain imports deliberately receive null
 * timestamps rather than invented timing information.
 */
export function buildMeetingTranscriptChunks(
  transcript: string,
  rawSegments: unknown = [],
  maxChars = 3000,
): MeetingTranscriptChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 256 || maxChars > 7000) {
    throw new Error('Meeting transcript chunk size must be between 256 and 7000 characters.');
  }

  const source = typeof transcript === 'string' ? transcript : '';
  if (!source.trim()) return [];

  const segments = Array.isArray(rawSegments)
    ? (rawSegments as MeetingTranscriptSegmentInput[]).filter(
        (segment) => segment && typeof segment.text === 'string' && segment.text.trim().length > 0,
      )
    : [];

  if (segments.length === 0) return splitRawText(source, maxChars);
  const segmentText = segments.map((segment) => String(segment.text ?? '').trim()).filter(Boolean).join(' ');
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  if (normalize(segmentText) !== normalize(source)) return splitRawText(source, maxChars);

  const parts: ChunkPart[] = [];
  for (const segment of segments) {
    const text = String(segment.text ?? '').trim();
    if (!text) continue;
    const startSeconds = validSeconds(segment.start);
    const endSeconds = validSeconds(segment.end);
    const startMs = startSeconds === null ? null : Math.round(startSeconds * 1000);
    let endMs = endSeconds === null ? null : Math.round(endSeconds * 1000);
    if (endMs !== null && startMs === null) endMs = null;
    if (endMs !== null && startMs !== null && endMs < startMs) endMs = null;

    const rawSpeaker = typeof segment.speaker_label === 'string'
      ? segment.speaker_label
      : typeof segment.speaker === 'string'
        ? segment.speaker
        : null;
    const speakerLabel = rawSpeaker?.trim() || null;
    const confidence = Number(segment.speaker_confidence);
    const speakerConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? confidence
      : null;

    let cursor = 0;
    while (cursor < text.length) {
      let end = Math.min(text.length, cursor + maxChars);
      if (end < text.length) {
        const preferred = text.lastIndexOf(' ', end);
        if (preferred >= cursor + Math.floor(maxChars * 0.65)) end = preferred;
      }
      const piece = text.slice(cursor, end).trim();
      if (piece) parts.push({ text: piece, startMs, endMs, speakerLabel, speakerConfidence });
      cursor = end;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    }
  }

  const chunks: MeetingTranscriptChunk[] = [];
  let current: ChunkPart[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = current.map((part) => part.text).join(' ').trim();
    const starts = current.map((part) => part.startMs);
    const ends = current.map((part) => part.endMs);
    const speakers = Array.from(new Set(current.map((part) => part.speakerLabel).filter((value): value is string => Boolean(value))));
    const confidences = current.map((part) => part.speakerConfidence).filter((value): value is number => value !== null);
    const hasCompleteTiming = starts.every((value) => value !== null) && ends.every((value) => value !== null);
    const startMs = hasCompleteTiming ? Math.min(...starts as number[]) : null;
    const endMs = hasCompleteTiming ? Math.max(...ends as number[]) : null;
    const hasConsistentSpeaker = current.every((part) => part.speakerLabel !== null) && speakers.length === 1;
    const speakerLabel = hasConsistentSpeaker ? speakers[0] : null;
    const speakerConfidence = speakerLabel && confidences.length === current.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null;
    chunks.push(makeChunk(chunks.length, content, startMs, endMs, speakerLabel, speakerConfidence, null, null));
    current = [];
    currentLength = 0;
  };

  for (const part of parts) {
    const nextLength = currentLength + (current.length ? 1 : 0) + part.text.length;
    if (current.length && nextLength > maxChars) flush();
    current.push(part);
    currentLength += (current.length > 1 ? 1 : 0) + part.text.length;
  }
  flush();
  return chunks;
}