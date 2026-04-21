export function parseLocaleNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.\-+]/g, '');

  if (!raw) return Number.NaN;

  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/^[+-]/, '');
  const commaCount = (unsigned.match(/,/g) || []).length;
  const dotCount = (unsigned.match(/\./g) || []).length;

  let normalized = unsigned;

  if (commaCount > 0 && dotCount > 0) {
    const decimalIsComma = unsigned.lastIndexOf(',') > unsigned.lastIndexOf('.');
    if (decimalIsComma) {
      normalized = unsigned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = unsigned.replace(/,/g, '');
    }
  } else if (commaCount > 0) {
    const commaThousandsPattern = /^\d{1,3}(,\d{3})+$/;
    if (commaThousandsPattern.test(unsigned)) {
      normalized = unsigned.replace(/,/g, '');
    } else {
      const parts = unsigned.split(',');
      const decimals = parts.pop() || '';
      const integer = parts.join('');
      normalized = `${integer}.${decimals}`;
    }
  } else if (dotCount > 0) {
    const dotThousandsPattern = /^\d{1,3}(\.\d{3})+$/;
    if (dotThousandsPattern.test(unsigned)) {
      normalized = unsigned.replace(/\./g, '');
    }
  }

  const parsed = Number(`${sign}${normalized}`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
