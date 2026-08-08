/**
 * Agentes inmobiliaria = miembros del Equipo (RRHH core).
 * Un solo origen de verdad: business.members (+ nombre de cuenta si hace falta).
 */

export type TeamAgentOption = {
  userId: string;
  name: string;
  role?: string;
};

type MemberLike = {
  user_id?: string;
  userId?: string;
  fullName?: string;
  name?: string;
  email?: string;
  role?: string;
};

type AccountLike = {
  user_id?: string;
  userId?: string;
  id?: string;
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function normalizeUserId(id: unknown): string {
  return String(id || '').trim().replace(/^account:/, '');
}

export function teamAgentDisplayName(member: MemberLike | AccountLike | null | undefined): string {
  if (!member) return '';
  const full = String((member as MemberLike).fullName || (member as AccountLike).fullName || '').trim();
  if (full) return full;
  const name = String((member as MemberLike).name || (member as AccountLike).name || '').trim();
  if (name) return name;
  const first = String((member as AccountLike).firstName || '').trim();
  const last = String((member as AccountLike).lastName || '').trim();
  const composed = `${first} ${last}`.trim();
  if (composed) return composed;
  return String((member as MemberLike).email || (member as AccountLike).email || '').trim();
}

/** Lista de agentes del negocio (Equipo), ordenada por nombre. */
export function listTeamAgentOptions(
  members: MemberLike[] | null | undefined,
  accounts?: AccountLike[] | null,
): TeamAgentOption[] {
  const accountById = new Map<string, AccountLike>();
  for (const a of accounts || []) {
    const id = normalizeUserId(a.user_id || a.userId || a.id);
    if (id) accountById.set(id, a);
  }

  const out: TeamAgentOption[] = [];
  const seen = new Set<string>();
  for (const m of members || []) {
    const userId = normalizeUserId(m.user_id || m.userId);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const account = accountById.get(userId);
    const name =
      teamAgentDisplayName(m)
      || teamAgentDisplayName(account)
      || userId;
    out.push({
      userId,
      name,
      role: String(m.role || '').trim() || undefined,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  return out;
}

/** Resuelve agente por userId o por nombre (import / legado). */
export function resolveTeamAgent(
  agents: TeamAgentOption[],
  opts: { userId?: string; name?: string },
): TeamAgentOption | null {
  const uid = normalizeUserId(opts.userId);
  if (uid) {
    const byId = agents.find((a) => a.userId === uid);
    if (byId) return byId;
  }
  const rawName = String(opts.name || '').trim().toLowerCase();
  if (!rawName) return null;
  const exact = agents.find((a) => a.name.toLowerCase() === rawName);
  if (exact) return exact;
  const partial = agents.find(
    (a) => a.name.toLowerCase().includes(rawName) || rawName.includes(a.name.toLowerCase()),
  );
  return partial || null;
}

export function visitBelongsToAgent(
  visit: { agenteUserId?: string; agente?: string },
  agentUserId: string,
): boolean {
  const mid = normalizeUserId(agentUserId);
  if (!mid) return false;
  const vid = normalizeUserId(visit.agenteUserId);
  if (vid) return vid === mid;
  return false;
}

/** Cliente CRM asignado a un agente (responsibleUserId; fallback por nombre). */
export function clientBelongsToAgent(
  client: { responsibleUserId?: string; responsible?: string },
  agentUserId: string,
  agentName?: string,
): boolean {
  const mid = normalizeUserId(agentUserId);
  if (!mid) return false;
  const cid = normalizeUserId(client.responsibleUserId);
  if (cid) return cid === mid;
  const name = String(agentName || '').trim().toLowerCase();
  const responsible = String(client.responsible || '').trim().toLowerCase();
  if (!name || !responsible || responsible === 'sin asignar') return false;
  return responsible === name;
}
