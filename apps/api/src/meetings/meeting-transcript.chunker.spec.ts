import { buildMeetingTranscriptChunks } from './meeting-transcript.chunker';

describe('buildMeetingTranscriptChunks', () => {
  it('preserves Whisper segment time ranges and supported speaker labels', () => {
    const chunks = buildMeetingTranscriptChunks(
      'We need a decision. Alice will prepare the report.',
      [
        { start: 1.25, end: 2.4, text: 'We need a decision.', speaker: 'Speaker 1' },
        { start: 2.5, end: 4.75, text: 'Alice will prepare the report.', speaker: 'Speaker 1' },
      ],
      3000,
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('We need a decision. Alice will prepare the report.');
    expect(chunks[0].startMs).toBe(1250);
    expect(chunks[0].endMs).toBe(4750);
    expect(chunks[0].speakerLabel).toBe('Speaker 1');
  });

  it('does not invent timestamps or speaker labels for plain transcript imports', () => {
    const chunks = buildMeetingTranscriptChunks('First statement. Second statement.', [], 3000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startMs).toBeNull();
    expect(chunks[0].endMs).toBeNull();
    expect(chunks[0].speakerLabel).toBeNull();
  });

  it('does not convert null segment timestamps into zero', () => {
    const chunks = buildMeetingTranscriptChunks('No reliable timing.', [
      { start: null as unknown as number, end: null as unknown as number, text: 'No reliable timing.' },
    ]);
    expect(chunks[0].startMs).toBeNull();
    expect(chunks[0].endMs).toBeNull();
  });

  it('does not assign one speaker to a chunk containing an unattributed segment', () => {
    const chunks = buildMeetingTranscriptChunks(
      'Alice speaks. Someone responds.',
      [
        { start: 1, end: 2, text: 'Alice speaks.', speaker: 'Speaker 1' },
        { start: 2, end: 3, text: 'Someone responds.' },
      ],
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].speakerLabel).toBeNull();
    expect(chunks[0].speakerConfidence).toBeNull();
  });

  it('does not assign a complete timestamp interval when any merged segment is untimed', () => {
    const chunks = buildMeetingTranscriptChunks(
      'Timed statement. Untimed statement.',
      [
        { start: 1, end: 2, text: 'Timed statement.' },
        { start: null as unknown as number, end: null as unknown as number, text: 'Untimed statement.' },
      ],
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startMs).toBeNull();
    expect(chunks[0].endMs).toBeNull();
  });

  it('splits long segments without exceeding the configured character limit', () => {
    const text = ('A sufficiently long sentence with useful meeting evidence. ').repeat(20);
    const chunks = buildMeetingTranscriptChunks(text, [{ start: 0, end: 60, text }], 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 300)).toBe(true);
    expect(chunks.every((chunk) => chunk.startMs === 0 && chunk.endMs === 60000)).toBe(true);
  });

  it('rejects unsafe chunk sizes', () => {
    expect(() => buildMeetingTranscriptChunks('text', [], 100)).toThrow();
  });
});