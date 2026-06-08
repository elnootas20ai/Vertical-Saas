import type { AuthUser } from './authApi';

export type PayrollMatchResult = {
  workerId: string;
  workerName: string;
  score: number;
  reason: string;
};

export type PayrollManifestHint = {
  fileName?: string;
  name?: string;
  dni?: string;
  email?: string;
};

function normalizeMatchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeDni(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

function extractDniFromText(text: string): string | null {
  const match = text.match(/\b(\d{8}[A-Z]|\d{7}[A-Z]|[XYZ]\d{7}[A-Z]|[A-Z]\d{7}[A-Z0-9])\b/i);
  return match ? normalizeDni(match[1]) : null;
}

function stripFileNameForMatch(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return normalizeMatchText(
    base
      .replace(/\b(nomina|nominas|recibo|salario|payroll|payslip)\b/gi, ' ')
      .replace(/\b(20\d{2}[-_/]?(0[1-9]|1[0-2])|[0-3]?\d[-_/](0[1-9]|1[0-2])[-_/]20\d{2})\b/g, ' ')
      .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/gi, ' '),
  );
}

function memberDisplayName(member: AuthUser): string {
  return member.fullName?.trim() || `${member.firstName || ''} ${member.lastName || ''}`.trim();
}

function memberTokens(member: AuthUser): string[] {
  const tokens = new Set<string>();
  const add = (v?: string) => {
    const n = normalizeMatchText(v || '');
    if (n.length >= 2) tokens.add(n);
  };
  add(member.fullName);
  add(`${member.firstName || ''} ${member.lastName || ''}`);
  add(member.firstName);
  add(member.lastName);
  const emailLocal = (member.email || '').split('@')[0];
  add(emailLocal.replace(/[._-]+/g, ' '));
  return Array.from(tokens);
}

function scoreNameAgainstHaystack(haystack: string, token: string): PayrollMatchResult | null {
  if (token.length < 2) return null;
  if (haystack === token) {
    return { workerId: '', workerName: '', score: 100, reason: 'Nombre exacto en el archivo' };
  }
  if (token.length >= 4 && haystack.includes(token)) {
    return {
      workerId: '',
      workerName: '',
      score: token.split(' ').length >= 2 ? 90 : 65,
      reason: token.split(' ').length >= 2 ? 'Nombre completo en el archivo' : 'Nombre en el archivo',
    };
  }
  if (token.split(' ').length >= 2) {
    const parts = token.split(' ').filter(Boolean);
    if (parts.every((p) => p.length >= 2 && haystack.includes(p))) {
      return { workerId: '', workerName: '', score: 80, reason: 'Nombre y apellido en el archivo' };
    }
  }
  return null;
}

function parseDelimitedManifest(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(';') ? ';' : ',';
  return lines.map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, '')),
  );
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => normalizeHeader(h));
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parsePayrollManifestCsv(text: string): Map<string, PayrollManifestHint> {
  const rows = parseDelimitedManifest(text);
  if (rows.length < 2) return new Map();

  const headers = rows[0];
  const fileIdx = headerIndex(headers, ['archivo', 'fichero', 'file', 'filename', 'documento', 'pdf', 'nombre_archivo']);
  const nameIdx = headerIndex(headers, ['nombre', 'trabajador', 'empleado', 'employee', 'name', 'nombre_completo', 'full_name']);
  const dniIdx = headerIndex(headers, ['dni', 'nie', 'nif', 'documento', 'documento_identidad', 'id']);
  const emailIdx = headerIndex(headers, ['email', 'correo', 'mail']);

  const map = new Map<string, PayrollManifestHint>();
  for (const row of rows.slice(1)) {
    const fileName = (fileIdx >= 0 ? row[fileIdx] : row[0] || '').trim();
    if (!fileName) continue;
    const key = fileName.split(/[/\\]/).pop()?.toLowerCase() || fileName.toLowerCase();
    map.set(key, {
      fileName: key,
      name: nameIdx >= 0 ? row[nameIdx]?.trim() : undefined,
      dni: dniIdx >= 0 ? row[dniIdx]?.trim() : undefined,
      email: emailIdx >= 0 ? row[emailIdx]?.trim() : undefined,
    });
  }
  return map;
}

export function analyzePayrollBulkRows(rows: Array<{ workerId?: string }>): {
  unmatchedCount: number;
  duplicateWorkerIds: string[];
  canAutoPublish: boolean;
} {
  const unmatchedCount = rows.filter((r) => !r.workerId).length;
  const seen = new Set<string>();
  const duplicateWorkerIds: string[] = [];
  for (const row of rows) {
    if (!row.workerId) continue;
    if (seen.has(row.workerId)) duplicateWorkerIds.push(row.workerId);
    seen.add(row.workerId);
  }
  return {
    unmatchedCount,
    duplicateWorkerIds,
    canAutoPublish: rows.length > 0 && unmatchedCount === 0 && duplicateWorkerIds.length === 0,
  };
}

export function matchWorkerFromPayrollHints(
  members: AuthUser[],
  hints: PayrollManifestHint,
): PayrollMatchResult | null {
  const dniHint = hints.dni ? normalizeDni(hints.dni) : '';
  const emailHint = (hints.email || '').trim().toLowerCase();
  const nameHint = normalizeMatchText(hints.name || '');

  for (const member of members) {
    if (member.status === 'inactive') continue;
    const name = memberDisplayName(member);
    if (!name && !member.personalData?.dni) continue;

    const memberDni = member.personalData?.dni ? normalizeDni(member.personalData.dni) : '';
    if (dniHint && memberDni && dniHint === memberDni) {
      return { workerId: member.user_id, workerName: name, score: 100, reason: 'DNI en índice CSV' };
    }
    if (emailHint && (member.email || '').trim().toLowerCase() === emailHint) {
      return { workerId: member.user_id, workerName: name, score: 100, reason: 'Email en índice CSV' };
    }
    if (nameHint) {
      for (const token of memberTokens(member)) {
        const scored = scoreNameAgainstHaystack(nameHint, token);
        if (scored && scored.score >= 80) {
          return { ...scored, workerId: member.user_id, workerName: name, reason: 'Nombre en índice CSV' };
        }
      }
    }
  }
  return null;
}

export function suggestWorkerForPayrollFile(
  fileName: string,
  members: AuthUser[],
  manifestHint?: PayrollManifestHint,
): PayrollMatchResult | null {
  if (manifestHint) {
    const fromManifest = matchWorkerFromPayrollHints(members, manifestHint);
    if (fromManifest) return fromManifest;
  }

  const rawBase = fileName.replace(/\.[^.]+$/, '');
  const dniInName = extractDniFromText(rawBase);
  if (dniInName) {
    for (const member of members) {
      if (member.status === 'inactive') continue;
      const memberDni = member.personalData?.dni ? normalizeDni(member.personalData.dni) : '';
      if (memberDni && memberDni === dniInName) {
        return {
          workerId: member.user_id,
          workerName: memberDisplayName(member),
          score: 100,
          reason: 'DNI/NIE en el nombre del archivo',
        };
      }
    }
  }

  const haystack = stripFileNameForMatch(fileName);
  if (!haystack) return null;

  let best: PayrollMatchResult | null = null;

  for (const member of members) {
    if (member.status === 'inactive') continue;
    const name = memberDisplayName(member);
    if (!name) continue;

    for (const token of memberTokens(member)) {
      const scored = scoreNameAgainstHaystack(haystack, token);
      if (!scored) continue;
      if (scored.score > (best?.score ?? 0)) {
        best = { ...scored, workerId: member.user_id, workerName: name };
      }
    }
  }

  if (!best || best.score < 65) return null;
  return best;
}
