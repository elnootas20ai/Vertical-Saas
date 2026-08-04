import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  MessageCircle,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getFunctionRolesForBusiness, getInviteRoleDisplayLabel } from '../../../lib/inviteFunctionRoles';
import { dedupeTeamMembersByUserId } from '../../../lib/schedulesDisplay';

export type ChatPickerMember = {
  user_id: string;
  fullName: string;
  role?: string;
  email?: string;
  department?: string;
};

type WorkGroupOption = {
  id: string;
  label: string;
  kind: 'role' | 'department';
  memberIds: string[];
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SKIP_ROLE_LABELS = new Set([
  'usuario',
  'user',
  'member',
  'miembro',
  'admin',
  'owner',
]);

function buildWorkGroups(
  members: ChatPickerMember[],
  businessType?: string | null,
): WorkGroupOption[] {
  const catalog = getFunctionRolesForBusiness(businessType);
  const catalogIds = new Set(catalog.map((r) => r.id));
  const roleIds = new Set(catalogIds);
  for (const m of members) {
    const role = String(m.role || '').trim();
    if (!role) continue;
    if (SKIP_ROLE_LABELS.has(role.toLowerCase()) && !catalogIds.has(role)) continue;
    roleIds.add(role);
  }

  const roleGroups: WorkGroupOption[] = [...roleIds]
    .map((roleId) => {
      const memberIds = members
        .filter((m) => String(m.role || '').trim() === roleId)
        .map((m) => m.user_id);
      return {
        id: `role:${roleId}`,
        label: getInviteRoleDisplayLabel(roleId, businessType) || roleId,
        kind: 'role' as const,
        memberIds,
      };
    })
    .filter((g) => g.memberIds.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

  const deptMap = new Map<string, string[]>();
  for (const m of members) {
    const dept = String(m.department || '').trim();
    if (!dept) continue;
    const list = deptMap.get(dept) || [];
    list.push(m.user_id);
    deptMap.set(dept, list);
  }
  const deptGroups: WorkGroupOption[] = [...deptMap.entries()]
    .map(([label, memberIds]) => ({
      id: `dept:${label}`,
      label,
      kind: 'department' as const,
      memberIds: [...new Set(memberIds)],
    }))
    .filter((g) => g.memberIds.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return [...roleGroups, ...deptGroups];
}

export function NewChatConversationModal({
  open,
  onClose,
  onCreateDM,
  onCreateGroup,
  onInviteMember,
  members,
  userId,
  businessType,
  allowInvite = true,
}: {
  open: boolean;
  onClose: () => void;
  onCreateDM: (memberId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  onInviteMember?: () => void;
  members: ChatPickerMember[];
  userId: string;
  businessType?: string | null;
  allowInvite?: boolean;
}) {
  const [mode, setMode] = useState<'select' | 'group'>('select');
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    if (!open) {
      setMode('select');
      setGroupName('');
      setSelectedMembers([]);
      setSearchQ('');
    }
  }, [open]);

  const otherMembers = useMemo(
    () =>
      dedupeTeamMembersByUserId(members).filter(
        (m) => m.user_id && m.user_id !== userId,
      ),
    [members, userId],
  );

  const workGroups = useMemo(
    () => buildWorkGroups(otherMembers, businessType),
    [otherMembers, businessType],
  );

  const q = searchQ.trim().toLowerCase();
  const filteredPeople = otherMembers.filter(
    (m) =>
      !q
      || String(m.fullName || '').toLowerCase().includes(q)
      || String(m.email || '').toLowerCase().includes(q)
      || String(m.role || '').toLowerCase().includes(q)
      || String(m.department || '').toLowerCase().includes(q),
  );
  const filteredWorkGroups = workGroups.filter(
    (g) =>
      !q
      || g.label.toLowerCase().includes(q)
      || g.memberIds.some((id) => {
        const m = otherMembers.find((x) => x.user_id === id);
        return String(m?.fullName || '').toLowerCase().includes(q);
      }),
  );

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleWorkGroup = (group: WorkGroupOption) => {
    const ids = group.memberIds.filter(Boolean);
    if (!ids.length) return;
    setSelectedMembers((prev) => {
      const allIn = ids.every((id) => prev.includes(id));
      if (allIn) return prev.filter((id) => !ids.includes(id));
      return [...new Set([...prev, ...ids])];
    });
    if (!groupName.trim()) setGroupName(group.label);
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    onCreateGroup(groupName.trim(), [...new Set([...selectedMembers, userId])]);
    setGroupName('');
    setSelectedMembers([]);
    setMode('select');
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {mode === 'select' ? 'Nueva conversación' : 'Nuevo grupo'}
            </h3>
            <p className="mt-0.5 text-xs text-stone-500">
              {mode === 'select'
                ? 'Escribe a alguien o crea un grupo del equipo'
                : 'Elige grupos de trabajo y personas'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {mode === 'select' && allowInvite && onInviteMember ? (
              <button
                type="button"
                onClick={() => {
                  onInviteMember();
                  onClose();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300"
              >
                <UserPlus className="h-4 w-4" />
                Invitar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              <X className="h-5 w-5 text-stone-500" />
            </button>
          </div>
        </div>

        {mode === 'select' ? (
          <>
            <div className="space-y-1 border-b border-stone-100 px-5 py-3 dark:border-stone-700">
              <button
                type="button"
                onClick={() => setMode('group')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Crear un grupo
                  </p>
                  <p className="text-xs text-stone-500">
                    Cocina, reparto, un departamento… o elige personas
                  </p>
                </div>
              </button>
            </div>

            <div className="px-5 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar persona…"
                  className="w-full rounded-xl bg-stone-100 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-stone-700"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <p className="mb-2 mt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Escribir a alguien
              </p>
              {filteredPeople.map((member) => (
                <button
                  key={member.user_id}
                  type="button"
                  onClick={() => {
                    onCreateDM(member.user_id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50"
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(member.user_id)}`}
                  >
                    {getInitials(member.fullName)}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                      {member.fullName}
                    </p>
                    <p className="truncate text-[11px] text-stone-400">
                      {[member.role, member.department].filter(Boolean).join(' · ')
                        || member.email
                        || ''}
                    </p>
                  </div>
                  <MessageCircle className="h-4 w-4 shrink-0 text-stone-300" />
                </button>
              ))}
              {filteredPeople.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">
                  {otherMembers.length === 0
                    ? 'Aún no hay compañeros. Invita a alguien para chatear.'
                    : 'No hay coincidencias'}
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3 px-5 py-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-500">
                  Nombre del grupo
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ej: Cocina, Reparto, Turno tarde…"
                  className="w-full rounded-xl bg-stone-100 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-stone-700"
                  autoFocus
                />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar grupo o persona…"
                  className="w-full rounded-xl bg-stone-100 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-stone-700"
                />
              </div>
            </div>

            {selectedMembers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-5 py-1">
                {selectedMembers.map((id) => {
                  const m = otherMembers.find((x) => x.user_id === id);
                  if (!m) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      {m.fullName}
                      <button type="button" onClick={() => toggleMember(id)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {filteredWorkGroups.length > 0 ? (
                <>
                  <p className="mb-2 mt-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    Grupos de trabajo
                  </p>
                  <div className="mb-3 space-y-1">
                    {filteredWorkGroups.map((group) => {
                      const allIn = group.memberIds.every((id) =>
                        selectedMembers.includes(id),
                      );
                      const someIn =
                        !allIn && group.memberIds.some((id) => selectedMembers.includes(id));
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => toggleWorkGroup(group)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                            allIn
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:bg-stone-50 dark:hover:bg-stone-700/50'
                          }`}
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                              {group.label}
                            </p>
                            <p className="text-[11px] text-stone-400">
                              {group.kind === 'department' ? 'Departamento' : 'Función'} ·{' '}
                              {group.memberIds.length} persona
                              {group.memberIds.length !== 1 ? 's' : ''}
                              {someIn ? ' · parcial' : ''}
                            </p>
                          </div>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                              allIn
                                ? 'border-blue-600 bg-blue-600'
                                : someIn
                                  ? 'border-blue-400 bg-blue-100 dark:bg-blue-900/40'
                                  : 'border-stone-300 dark:border-stone-600'
                            }`}
                          >
                            {(allIn || someIn) && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              <p className="mb-2 mt-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Personas de la empresa
              </p>
              {filteredPeople.map((member) => {
                const selected = selectedMembers.includes(member.user_id);
                return (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => toggleMember(member.user_id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                      selected
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-stone-50 dark:hover:bg-stone-700/50'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(member.user_id)}`}
                    >
                      {getInitials(member.fullName)}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                        {member.fullName}
                      </p>
                      <p className="truncate text-[11px] text-stone-400">
                        {[member.role, member.department].filter(Boolean).join(' · ') || ''}
                      </p>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                        selected
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-stone-300 dark:border-stone-600'
                      }`}
                    >
                      {selected ? <Check className="h-3 w-3 text-white" /> : null}
                    </div>
                  </button>
                );
              })}
              {filteredPeople.length === 0 && filteredWorkGroups.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-400">No hay coincidencias</p>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  setSelectedMembers([]);
                  setGroupName('');
                  setSearchQ('');
                }}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.length === 0}
                className="flex-1 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Crear grupo ({selectedMembers.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
