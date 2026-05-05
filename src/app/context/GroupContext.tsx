import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  type BusinessGroup,
  type CreateGroupPayload,
  type GroupAdmin,
  type GroupKpisData,
  type UpdateGroupPayload,
  type CreateBranchPayload,
  type UpdateBranchPayload,
  addBusinessToGroupRequest,
  addBranchRequest,
  addGroupAdminRequest,
  createGroupRequest,
  deleteBranchRequest,
  deleteGroupRequest,
  getGroupKpisRequest,
  listGroupsRequest,
  removeBusinessFromGroupRequest,
  removeGroupAdminRequest,
  updateBranchRequest,
  updateGroupRequest,
} from '../lib/groupApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupContextType {
  groups: BusinessGroup[];
  currentGroup: BusinessGroup | null;
  groupKpis: GroupKpisData | null;
  isLoading: boolean;
  isLoadingKpis: boolean;

  switchGroup: (groupId: string) => void;

  createGroup: (
    data: CreateGroupPayload,
  ) => Promise<{ success: boolean; group?: BusinessGroup; error?: string }>;
  updateGroup: (
    groupId: string,
    data: UpdateGroupPayload,
  ) => Promise<{ success: boolean; group?: BusinessGroup; error?: string }>;
  deleteGroup: (groupId: string) => Promise<{ success: boolean; error?: string }>;

  addBusinessToGroup: (
    groupId: string,
    businessId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  removeBusinessFromGroup: (
    groupId: string,
    businessId: string,
  ) => Promise<{ success: boolean; error?: string }>;

  addGroupAdmin: (
    groupId: string,
    admin: Omit<GroupAdmin, 'joinedAt'>,
  ) => Promise<{ success: boolean; error?: string }>;
  removeGroupAdmin: (
    groupId: string,
    adminId: string,
  ) => Promise<{ success: boolean; error?: string }>;

  addBranch: (
    businessId: string,
    data: CreateBranchPayload,
  ) => Promise<{ success: boolean; error?: string }>;
  updateBranch: (
    businessId: string,
    branchId: string,
    data: UpdateBranchPayload,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteBranch: (
    businessId: string,
    branchId: string,
  ) => Promise<{ success: boolean; error?: string }>;

  loadGroupKpis: (groupId: string) => Promise<void>;
  reloadGroups: () => Promise<void>;

  /** Devuelve true si el usuario es admin/gerente del grupo dado */
  isGroupAdmin: (groupId: string) => boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GroupContext = createContext<GroupContextType | undefined>(undefined);

function getStoredGroupId(userId: string): string | null {
  try {
    return localStorage.getItem(`vertial_current_group:${userId}`);
  } catch {
    return null;
  }
}

function storeGroupId(userId: string, groupId: string | null) {
  try {
    if (groupId) {
      localStorage.setItem(`vertial_current_group:${userId}`, groupId);
    } else {
      localStorage.removeItem(`vertial_current_group:${userId}`);
    }
  } catch {
    // ignore
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [groups, setGroups] = useState<BusinessGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<BusinessGroup | null>(null);
  const [groupKpis, setGroupKpis] = useState<GroupKpisData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingKpis, setIsLoadingKpis] = useState(false);

  const reloadGroups = useCallback(async () => {
    if (!user?.user_id) {
      setGroups([]);
      setCurrentGroup(null);
      return;
    }
    setIsLoading(true);
    try {
      const response = await listGroupsRequest(user.user_id);
      const list = response.groups || [];
      setGroups(list);

      if (list.length > 0) {
        const storedId = getStoredGroupId(user.user_id);
        const found = storedId ? list.find((g) => g.group_id === storedId) : null;
        const resolved = found || list[0];
        setCurrentGroup(resolved);
        storeGroupId(user.user_id, resolved.group_id);
      } else {
        setCurrentGroup(null);
      }
    } catch {
      setGroups([]);
      setCurrentGroup(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    void reloadGroups();
  }, [reloadGroups]);

  const switchGroup = useCallback(
    (groupId: string) => {
      const found = groups.find((g) => g.group_id === groupId);
      if (!found) return;
      setCurrentGroup(found);
      setGroupKpis(null);
      if (user?.user_id) storeGroupId(user.user_id, groupId);
    },
    [groups, user?.user_id],
  );

  const loadGroupKpis = useCallback(async (groupId: string) => {
    setIsLoadingKpis(true);
    try {
      const data = await getGroupKpisRequest(groupId);
      setGroupKpis(data);
    } catch {
      setGroupKpis(null);
    } finally {
      setIsLoadingKpis(false);
    }
  }, []);

  const createGroup = useCallback(
    async (data: CreateGroupPayload) => {
      if (!user?.user_id) return { success: false, error: 'No hay usuario autenticado' };
      try {
        const response = await createGroupRequest(user.user_id, data);
        if (!response.group) return { success: false, error: 'No se recibió grupo desde el servidor' };
        const newList = [...groups, response.group];
        setGroups(newList);
        if (!currentGroup) {
          setCurrentGroup(response.group);
          storeGroupId(user.user_id, response.group.group_id);
        }
        return { success: true, group: response.group };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al crear el grupo' };
      }
    },
    [groups, currentGroup, user?.user_id],
  );

  const updateGroup = useCallback(
    async (groupId: string, data: UpdateGroupPayload) => {
      try {
        const response = await updateGroupRequest(groupId, data);
        if (!response.group) return { success: false, error: 'No se recibió grupo actualizado' };
        const updatedList = groups.map((g) => (g.group_id === groupId ? response.group! : g));
        setGroups(updatedList);
        if (currentGroup?.group_id === groupId) setCurrentGroup(response.group);
        return { success: true, group: response.group };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al actualizar el grupo' };
      }
    },
    [groups, currentGroup],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      try {
        await deleteGroupRequest(groupId);
        const newList = groups.filter((g) => g.group_id !== groupId);
        setGroups(newList);
        if (currentGroup?.group_id === groupId) {
          const next = newList[0] || null;
          setCurrentGroup(next);
          if (user?.user_id) storeGroupId(user.user_id, next?.group_id || null);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al eliminar el grupo' };
      }
    },
    [groups, currentGroup, user?.user_id],
  );

  const addBusinessToGroup = useCallback(
    async (groupId: string, businessId: string) => {
      try {
        const response = await addBusinessToGroupRequest(groupId, businessId);
        if (response.group) {
          setGroups((prev) => prev.map((g) => (g.group_id === groupId ? response.group! : g)));
          if (currentGroup?.group_id === groupId) setCurrentGroup(response.group);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al añadir empresa' };
      }
    },
    [currentGroup],
  );

  const removeBusinessFromGroup = useCallback(
    async (groupId: string, businessId: string) => {
      try {
        const response = await removeBusinessFromGroupRequest(groupId, businessId);
        if (response.group) {
          setGroups((prev) => prev.map((g) => (g.group_id === groupId ? response.group! : g)));
          if (currentGroup?.group_id === groupId) setCurrentGroup(response.group);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al quitar empresa' };
      }
    },
    [currentGroup],
  );

  const addGroupAdmin = useCallback(
    async (groupId: string, admin: Omit<GroupAdmin, 'joinedAt'>) => {
      try {
        const response = await addGroupAdminRequest(groupId, admin);
        if (response.group) {
          setGroups((prev) => prev.map((g) => (g.group_id === groupId ? response.group! : g)));
          if (currentGroup?.group_id === groupId) setCurrentGroup(response.group);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al añadir administrador' };
      }
    },
    [currentGroup],
  );

  const removeGroupAdmin = useCallback(
    async (groupId: string, adminId: string) => {
      try {
        const response = await removeGroupAdminRequest(groupId, adminId);
        if (response.group) {
          setGroups((prev) => prev.map((g) => (g.group_id === groupId ? response.group! : g)));
          if (currentGroup?.group_id === groupId) setCurrentGroup(response.group);
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al eliminar administrador' };
      }
    },
    [currentGroup],
  );

  const addBranch = useCallback(
    async (businessId: string, data: CreateBranchPayload) => {
      try {
        await addBranchRequest(businessId, data);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al crear la sede' };
      }
    },
    [],
  );

  const updateBranch = useCallback(
    async (businessId: string, branchId: string, data: UpdateBranchPayload) => {
      try {
        await updateBranchRequest(businessId, branchId, data);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al actualizar la sede' };
      }
    },
    [],
  );

  const deleteBranch = useCallback(
    async (businessId: string, branchId: string) => {
      try {
        await deleteBranchRequest(businessId, branchId);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error al eliminar la sede' };
      }
    },
    [],
  );

  const isGroupAdmin = useCallback(
    (groupId: string) => {
      if (!user?.user_id) return false;
      const group = groups.find((g) => g.group_id === groupId);
      if (!group) return false;
      return (
        group.owner_user_id === user.user_id ||
        group.admins.some((a) => a.user_id === user.user_id)
      );
    },
    [groups, user?.user_id],
  );

  return (
    <GroupContext.Provider
      value={{
        groups,
        currentGroup,
        groupKpis,
        isLoading,
        isLoadingKpis,
        switchGroup,
        createGroup,
        updateGroup,
        deleteGroup,
        addBusinessToGroup,
        removeBusinessFromGroup,
        addGroupAdmin,
        removeGroupAdmin,
        addBranch,
        updateBranch,
        deleteBranch,
        loadGroupKpis,
        reloadGroups,
        isGroupAdmin,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  const context = useContext(GroupContext);
  if (context === undefined) {
    throw new Error('useGroup must be used within a GroupProvider');
  }
  return context;
}
