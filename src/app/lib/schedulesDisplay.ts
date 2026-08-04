import { ROLE_BADGE } from './clockinsDisplay';

export { ROLE_BADGE };

export function isDemoTeamMember(member: { fullName?: string; email?: string }): boolean {
  const email = String(member.email || '').trim().toLowerCase();
  const name = String(member.fullName || '').trim();
  if (email.endsWith('@test.local')) return true;
  if (/^demo(\s|$)/i.test(name)) return true;
  return false;
}

export function filterRealTeamMembers<T extends { user_id?: string; fullName?: string; email?: string }>(
  members: T[],
): T[] {
  return members.filter((m) => m.user_id && !isDemoTeamMember(m));
}

export function mergeBusinessMembers(
  businessMembers: { user_id: string; fullName?: string; email?: string; role?: string; employment?: unknown }[],
  apiMembers: { user_id: string; fullName?: string; role?: string; employment?: unknown }[],
): { user_id: string; fullName: string; role: string; employment?: unknown; email?: string }[] {
  const byId = new Map<string, { user_id: string; fullName: string; role: string; employment?: unknown; email?: string }>();

  for (const m of businessMembers) {
    if (!m.user_id || isDemoTeamMember(m)) continue;
    byId.set(m.user_id, {
      user_id: m.user_id,
      fullName: String(m.fullName || m.email || 'Miembro').trim(),
      role: m.role || 'Usuario',
      employment: m.employment,
      email: m.email,
    });
  }

  for (const m of apiMembers) {
    if (!m.user_id || isDemoTeamMember(m)) continue;
    const prev = byId.get(m.user_id);
    byId.set(m.user_id, {
      user_id: m.user_id,
      fullName: String(m.fullName || prev?.fullName || 'Miembro').trim(),
      role: m.role || prev?.role || 'Usuario',
      employment: m.employment ?? prev?.employment,
      email: (m as { email?: string }).email ?? prev?.email,
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
}

/** Quita duplicados por user_id (p. ej. business.members con filas repetidas en el chat). */
export function dedupeTeamMembersByUserId<T extends { user_id?: string; fullName?: string; email?: string; role?: string }>(
  members: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const m of members || []) {
    const id = String(m?.user_id || '').trim();
    if (!id || isDemoTeamMember(m)) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, m);
      continue;
    }
    byId.set(id, {
      ...prev,
      ...m,
      fullName: String(m.fullName || prev.fullName || '').trim() || prev.fullName,
      email: m.email || prev.email,
      role: m.role || prev.role,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.fullName || '').localeCompare(String(b.fullName || ''), 'es'),
  );
}
