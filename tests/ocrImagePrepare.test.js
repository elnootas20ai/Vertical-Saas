import { describe, expect, it } from 'vitest';
import { estimateBase64Bytes } from '../src/app/lib/ocrImagePrepare.ts';

describe('ocrImagePrepare', () => {
  it('estima bytes de base64', () => {
    // "AAAA" → 3 bytes
    expect(estimateBase64Bytes('AAAA')).toBe(3);
    expect(estimateBase64Bytes('AAA=')).toBe(2);
    expect(estimateBase64Bytes('AA==')).toBe(1);
    expect(estimateBase64Bytes('')).toBe(0);
  });
});
