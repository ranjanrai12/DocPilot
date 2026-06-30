import { describe, it, expect } from 'vitest';
import { isSupportedMime } from './extract.js';

describe('isSupportedMime', () => {
  it('accepts the allow-listed types (pdf, docx, txt)', () => {
    expect(isSupportedMime('application/pdf')).toBe(true);
    expect(
      isSupportedMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true);
    expect(isSupportedMime('text/plain')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isSupportedMime('image/png')).toBe(false);
    expect(isSupportedMime('application/octet-stream')).toBe(false);
    expect(isSupportedMime('')).toBe(false);
  });
});
