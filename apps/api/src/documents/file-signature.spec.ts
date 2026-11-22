import { matchesFileSignature } from './documents.service';

describe('upload file signature check', () => {
  it('accepts real PDF and Office files', () => {
    expect(matchesFileSignature(Buffer.from('%PDF-1.7\n...'), 'pdf')).toBe(true);
    expect(matchesFileSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), 'docx')).toBe(true);
  });

  it('rejects files whose contents do not match the declared type', () => {
    expect(matchesFileSignature(Buffer.from('<html><script>alert(1)</script>'), 'pdf')).toBe(false);
    expect(matchesFileSignature(Buffer.from('MZ\x90\x00 executable'), 'xlsx')).toBe(false);
    expect(matchesFileSignature(Buffer.from('<!DOCTYPE html><html></html>'), 'txt')).toBe(false);
    expect(matchesFileSignature(Buffer.from([0x68, 0x00, 0x69]), 'csv')).toBe(false);
    expect(matchesFileSignature(Buffer.alloc(0), 'md')).toBe(false);
  });

  it('accepts ordinary text, CSV and markdown, including a UTF-8 BOM', () => {
    expect(matchesFileSignature(Buffer.from('name,amount\nAcme,10\n'), 'csv')).toBe(true);
    expect(matchesFileSignature(Buffer.from('﻿# Plan\nShip on Monday.'), 'md')).toBe(true);
  });
});
