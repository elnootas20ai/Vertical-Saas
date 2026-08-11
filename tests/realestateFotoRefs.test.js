import { describe, expect, it } from 'vitest';

/**
 * Copia de la lógica de filtrado de refs (el factory no exporta helpers).
 * Si cambia toClientFotoRefs, actualizar este espejo.
 */
function attachmentNameFromFotoRef(value) {
  const s = String(value || '').trim();
  if (!s || /^data:image\//i.test(s)) return '';
  if (s.startsWith('att:')) return s.slice(4);
  const marker = '/foto/';
  const idx = s.lastIndexOf(marker);
  if (idx >= 0) return decodeURIComponent(s.slice(idx + marker.length).split('?')[0]);
  if (s.includes('/')) {
    const last = s.split('/').pop() || '';
    return decodeURIComponent(last.split('?')[0]);
  }
  return s;
}

function toClientFotoRefs(verticalName, entityKey, userId, docId, fotos, attachments) {
  const list = Array.isArray(fotos) ? fotos : [];
  const hasAttRefs = list.some((f) => {
    const s = String(f || '');
    return s.startsWith('att:') || s.includes('/foto/');
  });
  const attKeys = (attachments && typeof attachments === 'object')
    ? new Set(Object.keys(attachments))
    : (hasAttRefs ? new Set() : null);
  return list.map((f) => {
    const s = String(f || '').trim();
    if (!s) return '';
    if (/^data:image\//i.test(s)) {
      if (s.length > 1_200_000) return '';
      return s;
    }
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('blob:')) {
      return s;
    }
    const name = attachmentNameFromFotoRef(s);
    if (!name) return s;
    if (attKeys && !attKeys.has(name)) return '';
    return `/api/${verticalName}/${entityKey}/${encodeURIComponent(userId)}/${encodeURIComponent(docId)}/foto/${encodeURIComponent(name)}`;
  }).filter(Boolean);
}

describe('realestate foto refs', () => {
  it('builds authenticated foto URL from att: ref', () => {
    const urls = toClientFotoRefs(
      'realestate',
      'properties',
      'user1',
      'rep-1',
      ['att:foto-abc.jpg'],
      { 'foto-abc.jpg': { stub: true } },
    );
    expect(urls).toEqual(['/api/realestate/properties/user1/rep-1/foto/foto-abc.jpg']);
  });

  it('drops orphan att refs without attachments', () => {
    const urls = toClientFotoRefs(
      'realestate',
      'properties',
      'user1',
      'rep-1',
      ['att:foto-missing.jpg'],
      {},
    );
    expect(urls).toEqual([]);
  });

  it('drops att refs when _attachments is missing', () => {
    const urls = toClientFotoRefs(
      'realestate',
      'properties',
      'user1',
      'rep-1',
      ['att:foto-missing.jpg'],
      undefined,
    );
    expect(urls).toEqual([]);
  });

  it('parses name from absolute api path', () => {
    expect(
      attachmentNameFromFotoRef('/api/realestate/properties/u/rep-1/foto/foto-xyz.png'),
    ).toBe('foto-xyz.png');
  });
});
