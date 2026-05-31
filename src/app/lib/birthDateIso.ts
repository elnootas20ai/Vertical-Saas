/** Normaliza fechas guardadas al formato yyyy-mm-dd (almacenamiento interno). */
export function normalizeBirthDateIso(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const isoDateTime = /^(\d{4}-\d{2}-\d{2})T/.exec(raw);
  if (isoDateTime) return isoDateTime[1];

  const parsed = parseBirthDateDisplay(raw);
  if (parsed) return parsed;

  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(raw);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

/** ISO → dd/mm/aaaa para mostrar al usuario. */
export function birthDateIsoToDisplay(iso: string): string {
  const normalized = normalizeBirthDateIso(iso);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

/** Parsea dd/mm/aaaa → ISO yyyy-mm-dd. */
export function parseBirthDateDisplay(value: string): string | null {
  const raw = String(value || '').trim().replace(/-/g, '/');
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
    return null;
  }

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T12:00:00`);
  if (
    check.getFullYear() !== year
    || check.getMonth() + 1 !== month
    || check.getDate() !== day
  ) {
    return null;
  }

  return iso;
}

/**
 * Formatea mientras escribes: día / mes / año (español).
 * 15061995 → 15/06/1995. El primer bloque es el DÍA (máx. 31), no el mes.
 */
export function formatBirthDateAsTyping(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';

  let day = digits.slice(0, 2);
  let month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (day.length === 2) {
    const d = Number(day);
    if (d === 0) day = '01';
    else if (d > 31) day = '31';
  }

  if (month.length === 2) {
    const m = Number(month);
    if (m === 0) month = '01';
    else if (m > 12) month = '12';
  }

  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

export function isCompleteBirthDateDisplay(value: string): boolean {
  return parseBirthDateDisplay(value) !== null;
}
