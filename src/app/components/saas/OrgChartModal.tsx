import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type NodeProps,
  type Node,
  type Edge,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from 'react-i18next';
import {
  X,
  Save,
  Plus,
  Trash2,
  Users,
  UserPlus,
  ChevronDown,
  GripVertical,
  Loader2,
  Printer,
} from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import type { AuthUser } from '../../lib/authApi';
import {
  getOrgChartRequest,
  saveOrgChartRequest,
  type OrgChartNode,
  type OrgChartEdge,
} from '../../lib/orgchartApi';

interface OrgChartModalProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
  members: AuthUser[];
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Gerente: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Comercial: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Administración: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Taller: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Usuario: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function getRoleColor(role?: string) {
  return ROLE_COLORS[role || ''] || ROLE_COLORS.Usuario;
}

function OrgNodeComponent({ data, id }: NodeProps) {
  const nodeData = data as OrgChartNode['data'] & { onDelete?: (id: string) => void };
  return (
    <div className="relative group min-w-[180px]">
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-600 shadow-lg hover:shadow-xl transition-shadow p-4">
        <div className="flex items-center gap-3">
          {nodeData.avatar ? (
            <img src={nodeData.avatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-700" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
              {getInitials(nodeData.label)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{nodeData.label}</p>
            {nodeData.role && (
              <span className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-bold rounded-full ${getRoleColor(nodeData.role)}`}>
                {nodeData.role}
              </span>
            )}
          </div>
        </div>
        {nodeData.email && (
          <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 truncate">{nodeData.email}</p>
        )}
        {nodeData.onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); nodeData.onDelete!(id); }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

const nodeTypes = { orgNode: OrgNodeComponent };

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#6366f1', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
};

function autoLayout(nodes: OrgChartNode[], edges: OrgChartEdge[]): OrgChartNode[] {
  if (nodes.length === 0) return nodes;

  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    const list = children.get(e.source) || [];
    list.push(e.target);
    children.set(e.source, list);
    hasParent.add(e.target);
  }

  const roots = nodes.filter((n) => !hasParent.has(n.id));
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 120;
  const HORIZONTAL_GAP = 40;
  const VERTICAL_GAP = 80;

  function getSubtreeWidth(nodeId: string): number {
    const kids = children.get(nodeId) || [];
    if (kids.length === 0) return NODE_WIDTH;
    let total = 0;
    for (const kid of kids) {
      total += getSubtreeWidth(kid);
    }
    total += (kids.length - 1) * HORIZONTAL_GAP;
    return Math.max(NODE_WIDTH, total);
  }

  function layoutSubtree(nodeId: string, x: number, y: number) {
    const kids = children.get(nodeId) || [];
    const totalWidth = getSubtreeWidth(nodeId);
    positions.set(nodeId, { x: x + totalWidth / 2 - NODE_WIDTH / 2, y });

    if (kids.length === 0) return;

    let offsetX = x;
    for (const kid of kids) {
      const kidWidth = getSubtreeWidth(kid);
      layoutSubtree(kid, offsetX, y + NODE_HEIGHT + VERTICAL_GAP);
      offsetX += kidWidth + HORIZONTAL_GAP;
    }
  }

  let startX = 0;
  for (const root of roots) {
    layoutSubtree(root.id, startX, 0);
    startX += getSubtreeWidth(root.id) + HORIZONTAL_GAP * 2;
  }

  const orphans = nodes.filter((n) => !positions.has(n.id));
  let orphanY = (roots.length > 0 ? 600 : 0);
  for (const orphan of orphans) {
    positions.set(orphan.id, { x: startX, y: orphanY });
    orphanY += NODE_HEIGHT + VERTICAL_GAP;
  }

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) || n.position,
  }));
}

function OrgChartInner({ businessId, members, onClose }: Omit<OrgChartModalProps, 'open'>) {
  const { t } = useTranslation();
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const flowContainerRef = useRef<HTMLDivElement>(null);

  const usedMemberIds = useMemo(
    () => new Set(nodes.map((n) => (n.data as OrgChartNode['data']).user_id).filter(Boolean)),
    [nodes],
  );

  const availableMembers = useMemo(
    () => members.filter((m) => !usedMemberIds.has(m.user_id)),
    [members, usedMemberIds],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setDirty(true);
    },
    [setNodes, setEdges],
  );

  const toFlowNodes = useCallback(
    (orgNodes: OrgChartNode[]): Node[] =>
      orgNodes.map((n) => ({
        id: n.id,
        type: 'orgNode',
        position: n.position,
        data: { ...n.data, onDelete: handleDeleteNode },
      })),
    [handleDeleteNode],
  );

  const toFlowEdges = useCallback(
    (orgEdges: OrgChartEdge[]): Edge[] =>
      orgEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
      })),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getOrgChartRequest(businessId);
        if (cancelled) return;
        const chart = res.orgchart;
        if (chart && chart.nodes.length > 0) {
          setNodes(toFlowNodes(chart.nodes));
          setEdges(toFlowEdges(chart.edges));
        }
      } catch {
        // empty chart is fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  useEffect(() => {
    if (!loading && nodes.length > 0) {
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    }
  }, [loading]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' } }, eds));
      setDirty(true);
    },
    [setEdges],
  );

  const handleAddMember = useCallback(
    (member: AuthUser) => {
      const id = `node_${member.user_id}`;
      const existingCount = nodes.length;
      const newNode: Node = {
        id,
        type: 'orgNode',
        position: { x: (existingCount % 4) * 260, y: Math.floor(existingCount / 4) * 200 },
        data: {
          user_id: member.user_id,
          label: member.fullName || member.email,
          role: member.role || 'Usuario',
          avatar: member.avatar || '',
          email: member.email,
          onDelete: handleDeleteNode,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setDirty(true);
      setShowAddMenu(false);
    },
    [nodes.length, setNodes, handleDeleteNode],
  );

  const handleAddCustomNode = useCallback(() => {
    const id = `custom_${Date.now()}`;
    const existingCount = nodes.length;
    const newNode: Node = {
      id,
      type: 'orgNode',
      position: { x: (existingCount % 4) * 260, y: Math.floor(existingCount / 4) * 200 },
      data: {
        label: t('team.orgchart.newPosition'),
        role: '',
        onDelete: handleDeleteNode,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setDirty(true);
    setShowAddMenu(false);
  }, [nodes.length, setNodes, handleDeleteNode, t]);

  const handleAutoLayout = useCallback(() => {
    const orgNodes: OrgChartNode[] = nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: n.data as OrgChartNode['data'],
    }));
    const orgEdges: OrgChartEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    const layouted = autoLayout(orgNodes, orgEdges);
    setNodes(toFlowNodes(layouted));
    setDirty(true);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [nodes, edges, setNodes, toFlowNodes, fitView]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const orgNodes: OrgChartNode[] = nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: {
          user_id: (n.data as OrgChartNode['data']).user_id,
          label: (n.data as OrgChartNode['data']).label,
          role: (n.data as OrgChartNode['data']).role,
          avatar: (n.data as OrgChartNode['data']).avatar,
          email: (n.data as OrgChartNode['data']).email,
        },
      }));
      const orgEdges: OrgChartEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

      await saveOrgChartRequest(businessId, orgNodes, orgEdges);
      setDirty(false);
    } catch {
      // silently fail, user can retry
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, businessId]);

  const handlePrint = useCallback(async () => {
    const container = flowContainerRef.current;
    if (!container) return;

    setPrinting(true);
    try {
      await fitView({ padding: 0.3, duration: 300 });
      await new Promise((r) => setTimeout(r, 400));

      const viewport = container.querySelector('.react-flow__viewport') as HTMLElement | null;
      const target = viewport || container;

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const win = window.open('', '_blank');
      if (!win) return;

      win.document.write(`<!DOCTYPE html><html><head><title>${t('team.orgchart.title')}</title><style>
        @media print { @page { size: landscape; margin: 10mm; } }
        body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; }
        img { max-width: 100%; max-height: 95vh; object-fit: contain; }
        h1 { position: absolute; top: 10px; left: 20px; font-family: system-ui, sans-serif; font-size: 18px; color: #111; }
      </style></head><body>
        <h1>${t('team.orgchart.title')}</h1>
        <img src="${dataUrl}" />
      </body></html>`);
      win.document.close();

      setTimeout(() => { win.print(); }, 400);
    } catch {
      // fallback: plain window.print
      window.print();
    } finally {
      setPrinting(false);
    }
  }, [fitView, t]);

  const handleAddAllMembers = useCallback(() => {
    const newNodes: Node[] = availableMembers.map((member, i) => ({
      id: `node_${member.user_id}`,
      type: 'orgNode',
      position: {
        x: ((nodes.length + i) % 4) * 260,
        y: Math.floor((nodes.length + i) / 4) * 200,
      },
      data: {
        user_id: member.user_id,
        label: member.fullName || member.email,
        role: member.role || 'Usuario',
        avatar: member.avatar || '',
        email: member.email,
        onDelete: handleDeleteNode,
      },
    }));
    setNodes((nds) => [...nds, ...newNodes]);
    setDirty(true);
    setShowAddMenu(false);
  }, [availableMembers, nodes.length, setNodes, handleDeleteNode]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as globalThis.Node)) {
        setShowAddMenu(false);
      }
    }
    if (showAddMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAddMenu]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('team.orgchart.title')}</h2>
            <p className="text-xs text-gray-400">{t('team.orgchart.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto layout */}
          <button
            type="button"
            onClick={handleAutoLayout}
            disabled={nodes.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
          >
            <GripVertical className="w-4 h-4" />
            {t('team.orgchart.autoLayout')}
          </button>

          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={nodes.length === 0 || printing}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-40"
          >
            {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {t('team.orgchart.print')}
          </button>

          {/* Add member dropdown */}
          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              {t('team.orgchart.addNode')}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showAddMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-hidden">
                <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('team.orgchart.addFromTeam')}</p>
                </div>

                {availableMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAddAllMembers}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border-b border-gray-100 dark:border-gray-700"
                  >
                    <Users className="w-4 h-4" />
                    {t('team.orgchart.addAll')} ({availableMembers.length})
                  </button>
                )}

                <div className="max-h-60 overflow-y-auto">
                  {availableMembers.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => handleAddMember(m)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      {m.avatar ? (
                        <img src={m.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {getInitials(m.fullName || m.email)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.fullName || m.email}</p>
                        <p className="text-xs text-gray-400 truncate">{m.role || 'Usuario'}</p>
                      </div>
                    </button>
                  ))}

                  {availableMembers.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400 text-center">{t('team.orgchart.allAdded')}</p>
                  )}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 p-2">
                  <button
                    type="button"
                    onClick={handleAddCustomNode}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {t('team.orgchart.customPosition')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-white dark:text-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black dark:hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('team.orgchart.save')}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative" ref={flowContainerRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 dark:bg-indigo-900/30">
              <Users className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('team.orgchart.emptyTitle')}</h3>
            <p className="text-sm text-gray-400 max-w-md">{t('team.orgchart.emptyDesc')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAddAllMembers}
                disabled={availableMembers.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                <Users className="w-4 h-4" />
                {t('team.orgchart.addAllMembers')}
              </button>
              <button
                type="button"
                onClick={handleAddCustomNode}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('team.orgchart.customPosition')}
              </button>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => { onNodesChange(changes); setDirty(true); }}
            onEdgesChange={(changes) => { onEdgesChange(changes); setDirty(true); }}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode="Delete"
            className="bg-gray-50 dark:bg-gray-900"
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !rounded-xl !shadow-lg" />
            <MiniMap
              className="!bg-white dark:!bg-gray-800 !border-gray-200 dark:!border-gray-700 !rounded-xl !shadow-lg"
              nodeColor="#6366f1"
              maskColor="rgba(0,0,0,0.1)"
            />
            <Panel position="bottom-center">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                {t('team.orgchart.hint')}
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export function OrgChartModal({ open, onClose, businessId, members }: OrgChartModalProps) {
  useModalClose(open, onClose);

  if (!open) return null;

  return (
    <ReactFlowProvider>
      <OrgChartInner businessId={businessId} members={members} onClose={onClose} />
    </ReactFlowProvider>
  );
}
