import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Database, Search, Star, Pin, GripVertical, Plus, Trash2,
  Download, Upload, RefreshCw, ChevronLeft, ChevronRight,
  MoreHorizontal, Pencil, Copy, Check, X, Loader2, AlertCircle,
  FileJson, HardDrive, ArrowUpDown, Eye, EyeOff, CheckSquare, Square,
  ChevronsLeft, ChevronsRight, PinOff, StarOff, Info, Tag,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { couchApi, type CouchDoc, type CouchDBInfo } from '../lib/api';

const STORAGE_KEY = 'couchdb-manager-meta';
const PAGE_SIZE = 25;

interface DbMeta {
  alias?: string;
  description?: string;
  favorite?: boolean;
  pinned?: boolean;
  order?: number;
}

type DbMetaMap = Record<string, DbMeta>;

function loadMeta(): DbMetaMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveMeta(meta: DbMetaMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

type ManagerView = 'list' | 'docs';

export function CouchDBManager() {
  const { isDark, t } = usePluginSettings();
  const [view, setView] = useState<ManagerView>('list');
  const [selectedDb, setSelectedDb] = useState<string | null>(null);

  const openDb = useCallback((name: string) => {
    setSelectedDb(name);
    setView('docs');
  }, []);

  const goBack = useCallback(() => {
    setView('list');
    setSelectedDb(null);
  }, []);

  return view === 'list' ? (
    <DatabaseList isDark={isDark} t={t} onOpen={openDb} />
  ) : selectedDb ? (
    <DocumentViewer isDark={isDark} t={t} dbName={selectedDb} onBack={goBack} />
  ) : null;
}

// ─── Database List ──────────────────────────────────────────────────────────

interface DatabaseListProps {
  isDark: boolean;
  t: (k: string) => string;
  onOpen: (name: string) => void;
}

function DatabaseList({ isDark, t, onOpen }: DatabaseListProps) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [dbInfos, setDbInfos] = useState<Record<string, CouchDBInfo>>({});
  const [meta, setMeta] = useState<DbMetaMap>(loadMeta);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingMeta, setEditingMeta] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDbs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const raw = await couchApi.listDbs();
      const dbs = (Array.isArray(raw) ? raw : []).filter((d): d is string => typeof d === 'string');
      setDatabases(dbs);
      const infos: Record<string, CouchDBInfo> = {};
      const batch = dbs.slice(0, 50);
      await Promise.allSettled(
        batch.map(async (db) => {
          try {
            infos[db] = await couchApi.getDbInfo(db);
          } catch { /* skip */ }
        }),
      );
      setDbInfos(infos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading databases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDbs(); }, [fetchDbs]);

  const updateMeta = useCallback((dbName: string, patch: Partial<DbMeta>) => {
    setMeta((prev) => {
      const next = { ...prev, [dbName]: { ...prev[dbName], ...patch } };
      saveMeta(next);
      return next;
    });
  }, []);

  const sortedDbs = useMemo(() => {
    let list = [...databases];
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter((db) => {
        const m = meta[db];
        return db.toLowerCase().includes(q)
          || (m?.alias || '').toLowerCase().includes(q)
          || (m?.description || '').toLowerCase().includes(q);
      });
    }
    list.sort((a, b) => {
      const ma = meta[a] || {};
      const mb = meta[b] || {};
      if (ma.pinned && !mb.pinned) return -1;
      if (!ma.pinned && mb.pinned) return 1;
      if (ma.favorite && !mb.favorite) return -1;
      if (!ma.favorite && mb.favorite) return 1;
      const oa = ma.order ?? 999;
      const ob = mb.order ?? 999;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
    return list;
  }, [databases, search, meta]);

  const allSelected = sortedDbs.length > 0 && sortedDbs.every((d) => selected.has(d));

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(sortedDbs));
  };

  const toggleSelect = (db: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(db)) next.delete(db);
      else next.add(db);
      return next;
    });
  };

  const handleCreate = async () => {
    const name = newDbName.trim().toLowerCase().replace(/[^a-z0-9_$()+-/]/g, '_');
    if (!name) return;
    setCreating(true);
    try {
      await couchApi.createDb(name);
      setShowCreate(false);
      setNewDbName('');
      fetchDbs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating database');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const names = [...selected];
    if (!confirm(`${t('dbDeleteConfirm')} ${names.length} ${t('dbDatabases')}?`)) return;
    for (const name of names) {
      try {
        await couchApi.deleteDb(name);
      } catch { /* skip */ }
    }
    setSelected(new Set());
    fetchDbs();
  };

  const handleExportSelected = async () => {
    const dbs = selected.size > 0 ? [...selected] : sortedDbs;
    const exportData: Record<string, unknown> = {};
    for (const db of dbs) {
      try {
        const { docs } = await couchApi.getPaginatedDocs(db, 10000, 0);
        exportData[db] = docs;
      } catch { /* skip */ }
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `couchdb-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      for (const [dbName, docs] of Object.entries(data)) {
        try {
          await couchApi.createDb(dbName);
        } catch { /* may exist */ }
        if (Array.isArray(docs)) {
          for (const doc of docs) {
            const clean = { ...doc } as Record<string, unknown>;
            delete clean._rev;
            try {
              await couchApi.createDoc(dbName, clean);
            } catch { /* skip */ }
          }
        }
      }
      fetchDbs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragStart = (db: string) => setDragId(db);
  const handleDragOver = (e: React.DragEvent, db: string) => {
    e.preventDefault();
    if (db !== dragId) setDragOverId(db);
  };
  const handleDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const list = [...sortedDbs];
      const fromIdx = list.indexOf(dragId);
      const toIdx = list.indexOf(dragOverId);
      if (fromIdx !== -1 && toIdx !== -1) {
        list.splice(fromIdx, 1);
        list.splice(toIdx, 0, dragId);
        const newMeta = { ...meta };
        list.forEach((db, i) => {
          newMeta[db] = { ...newMeta[db], order: i };
        });
        setMeta(newMeta);
        saveMeta(newMeta);
      }
    }
    setDragId(null);
    setDragOverId(null);
  };

  const startEditMeta = (db: string) => {
    setEditingMeta(db);
    setEditAlias(meta[db]?.alias || '');
    setEditDesc(meta[db]?.description || '');
  };

  const saveEditMeta = () => {
    if (editingMeta) {
      updateMeta(editingMeta, { alias: editAlias.trim() || undefined, description: editDesc.trim() || undefined });
      setEditingMeta(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2.5 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <Database className="size-4 text-orange-400" />
        <span className={cn('font-semibold text-xs flex-1', isDark ? 'text-zinc-100' : 'text-gray-900')}>
          {t('dbTitle')}
        </span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500')}>
          {databases.length}
        </span>
        <button
          onClick={fetchDbs}
          className={cn('size-6 rounded-md flex items-center justify-center transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-gray-100 text-gray-400')}
          title={t('dbRefresh')}
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Search */}
      <div className={cn('px-3 py-2 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <div className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5', isDark ? 'bg-zinc-900 border border-zinc-800' : 'bg-gray-50 border border-gray-200')}>
          <Search className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            className={cn('flex-1 text-xs bg-transparent outline-none', isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400')}
            placeholder={t('dbSearchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className={cn('size-4 flex items-center justify-center', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className={cn('flex items-center gap-1 px-3 py-1.5 border-b shrink-0 flex-wrap', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <button
          onClick={toggleSelectAll}
          className={cn('size-6 rounded flex items-center justify-center transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-gray-100 text-gray-400')}
          title={t('dbSelectAll')}
        >
          {allSelected ? <CheckSquare className="size-3.5 text-orange-400" /> : <Square className="size-3.5" />}
        </button>
        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-medium px-2 py-1 transition-colors"
        >
          <Plus className="size-3" /> {t('dbCreate')}
        </button>
        <button
          onClick={handleExportSelected}
          className={cn('flex items-center gap-1 rounded-md text-[10px] px-2 py-1 transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-600')}
        >
          <Download className="size-3" /> {t('dbExport')}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className={cn('flex items-center gap-1 rounded-md text-[10px] px-2 py-1 transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-600')}
        >
          {importing ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} {t('dbImport')}
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        {selected.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 rounded-md text-[10px] px-2 py-1 text-red-400 hover:bg-red-900/20 transition-colors ml-auto"
          >
            <Trash2 className="size-3" /> {t('dbDeleteSelected')} ({selected.size})
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={cn('flex items-center gap-2 mx-3 mt-2 rounded-lg px-3 py-2', isDark ? 'bg-red-950/80 border border-red-900/60' : 'bg-red-50 border border-red-200')}>
          <AlertCircle className="size-3.5 text-red-400 shrink-0" />
          <p className="text-[10px] flex-1 text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300">&times;</button>
        </div>
      )}

      {/* Create DB inline */}
      {showCreate && (
        <div className={cn('flex items-center gap-2 px-3 py-2 border-b', isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50')}>
          <Database className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            className={cn('flex-1 text-xs bg-transparent outline-none', isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400')}
            placeholder={t('dbNamePlaceholder')}
            value={newDbName}
            onChange={(e) => setNewDbName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
            autoFocus
          />
          {creating ? (
            <Loader2 className="size-3.5 text-orange-400 animate-spin" />
          ) : (
            <>
              <button onClick={handleCreate} className="text-orange-400 hover:text-orange-300"><Check className="size-3.5" /></button>
              <button onClick={() => setShowCreate(false)} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}><X className="size-3.5" /></button>
            </>
          )}
        </div>
      )}

      {/* Database List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="size-5 text-orange-400 animate-spin" />
            <p className={cn('text-[10px] mt-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('loading')}</p>
          </div>
        ) : sortedDbs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <HardDrive className={cn('size-10 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('dbNoDatabases')}</p>
          </div>
        ) : (
          <div className="py-1 px-2 space-y-0.5">
            {sortedDbs.map((db) => {
              const m = meta[db] || {};
              const info = dbInfos[db];
              const isSelected = selected.has(db);
              const isEditingThis = editingMeta === db;
              const isDragOverThis = dragOverId === db;

              return (
                <div
                  key={db}
                  draggable
                  onDragStart={() => handleDragStart(db)}
                  onDragOver={(e) => handleDragOver(e, db)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group relative flex items-start gap-2 rounded-lg px-2 py-2 cursor-pointer transition-all',
                    isDragOverThis
                      ? isDark ? 'bg-orange-900/20 border border-orange-500/30' : 'bg-orange-50 border border-orange-300'
                      : isSelected
                        ? isDark ? 'bg-zinc-800/80 border border-orange-500/20' : 'bg-orange-50/50 border border-orange-200'
                        : isDark ? 'hover:bg-zinc-800/40 border border-transparent' : 'hover:bg-gray-50 border border-transparent',
                  )}
                >
                  {/* Drag handle */}
                  <div className={cn('shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                    <GripVertical className="size-3" />
                  </div>

                  {/* Checkbox */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(db); }}
                    className="shrink-0 mt-0.5"
                  >
                    {isSelected
                      ? <CheckSquare className="size-3.5 text-orange-400" />
                      : <Square className={cn('size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                    }
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0" onClick={() => onOpen(db)}>
                    <div className="flex items-center gap-1.5">
                      <Database className={cn('size-3.5 shrink-0', m.pinned ? 'text-orange-400' : isDark ? 'text-zinc-500' : 'text-gray-400')} />
                      <span className={cn('text-xs font-medium truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>
                        {m.alias || String(db)}
                      </span>
                      {m.alias && (
                        <span className={cn('text-[9px] truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>{String(db)}</span>
                      )}
                    </div>
                    {m.description && (
                      <p className={cn('text-[10px] mt-0.5 truncate', isDark ? 'text-zinc-500' : 'text-gray-500')}>{String(m.description)}</p>
                    )}
                    <div className={cn('flex items-center gap-2 mt-1 text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                      {info && typeof info.doc_count === 'number' && (
                        <>
                          <span>{info.doc_count} docs</span>
                          {info.sizes?.active != null && (
                            <span>{(Number(info.sizes.active) / 1024).toFixed(1)} KB</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateMeta(db, { pinned: !m.pinned }); }}
                      className={cn('size-5 rounded flex items-center justify-center transition-colors',
                        m.pinned ? 'text-orange-400' : isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                      title={m.pinned ? t('dbUnpin') : t('dbPin')}
                    >
                      {m.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateMeta(db, { favorite: !m.favorite }); }}
                      className={cn('size-5 rounded flex items-center justify-center transition-colors',
                        m.favorite ? 'text-yellow-400' : isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                      title={m.favorite ? t('dbUnfavorite') : t('dbFavorite')}
                    >
                      {m.favorite ? <StarOff className="size-3" /> : <Star className="size-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditMeta(db); }}
                      className={cn('size-5 rounded flex items-center justify-center transition-colors', isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                      title={t('dbEditMeta')}
                    >
                      <Tag className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit meta modal */}
      {editingMeta && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[200]" onClick={() => setEditingMeta(null)} />
          <div className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-80 rounded-xl shadow-2xl p-4',
            isDark ? 'bg-zinc-900 border border-zinc-700' : 'bg-white border border-gray-200',
          )}>
            <h3 className={cn('text-sm font-semibold mb-3', isDark ? 'text-zinc-100' : 'text-gray-900')}>
              {t('dbEditMeta')}: <span className="text-orange-400">{editingMeta}</span>
            </h3>
            <label className={cn('text-[10px] font-medium mb-1 block', isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('dbAlias')}</label>
            <input
              className={cn('w-full rounded-lg px-3 py-1.5 text-xs mb-3 outline-none border', isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-gray-50 border-gray-200 text-gray-900')}
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
              placeholder={t('dbAliasPlaceholder')}
            />
            <label className={cn('text-[10px] font-medium mb-1 block', isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('dbDescription')}</label>
            <textarea
              className={cn('w-full rounded-lg px-3 py-1.5 text-xs mb-3 outline-none border resize-none h-16', isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-gray-50 border-gray-200 text-gray-900')}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder={t('dbDescPlaceholder')}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingMeta(null)}
                className={cn('text-xs px-3 py-1.5 rounded-lg', isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100')}
              >
                {t('cancel')}
              </button>
              <button
                onClick={saveEditMeta}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
              >
                {t('kanbanSave')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Document Viewer ────────────────────────────────────────────────────────

interface DocumentViewerProps {
  isDark: boolean;
  t: (k: string) => string;
  dbName: string;
  onBack: () => void;
}

function DocumentViewer({ isDark, t, dbName, onBack }: DocumentViewerProps) {
  const [docs, setDocs] = useState<CouchDoc[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingDoc, setEditingDoc] = useState<CouchDoc | null>(null);
  const [editJson, setEditJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newDocJson, setNewDocJson] = useState('{\n  \n}');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('_id');
  const [sortAsc, setSortAsc] = useState(true);

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await couchApi.getPaginatedDocs(dbName, PAGE_SIZE, page * PAGE_SIZE);
      setDocs(Array.isArray(result.docs) ? result.docs : []);
      setTotalRows(typeof result.total_rows === 'number' ? result.total_rows : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading documents');
    } finally {
      setLoading(false);
    }
  }, [dbName, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const filteredDocs = useMemo(() => {
    let result = [...docs];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((doc) =>
        JSON.stringify(doc).toLowerCase().includes(q),
      );
    }
    result.sort((a, b) => {
      const va = formatCellValue(a[sortField]);
      const vb = formatCellValue(b[sortField]);
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return result;
  }, [docs, search, sortField, sortAsc]);

  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const allSelected = filteredDocs.length > 0 && filteredDocs.every((d) => selected.has(d._id));

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredDocs.map((d) => d._id)));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const startEdit = (doc: CouchDoc) => {
    setEditingDoc(doc);
    setEditJson(JSON.stringify(doc, null, 2));
  };

  const saveEdit = async () => {
    if (!editingDoc) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editJson);
      await couchApi.updateDoc(dbName, editingDoc._id, parsed);
      setEditingDoc(null);
      fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving document');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const parsed = JSON.parse(newDocJson);
      await couchApi.createDoc(dbName, parsed);
      setShowCreate(false);
      setNewDocJson('{\n  \n}');
      fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating document');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: CouchDoc) => {
    if (!confirm(`${t('dbDeleteDoc')} ${doc._id}?`)) return;
    try {
      await couchApi.hardDeleteDoc(dbName, doc._id, doc._rev);
      fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting document');
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${t('dbDeleteConfirm')} ${selected.size} docs?`)) return;
    const toDelete = docs.filter((d) => selected.has(d._id)).map((d) => ({ _id: d._id, _rev: d._rev }));
    try {
      await couchApi.bulkDelete(dbName, toDelete);
      setSelected(new Set());
      fetchDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error bulk deleting');
    }
  };

  const handleExport = () => {
    const exportDocs = selected.size > 0 ? docs.filter((d) => selected.has(d._id)) : docs;
    const blob = new Blob([JSON.stringify(exportDocs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dbName}-docs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const docFields = useMemo(() => {
    const fields = new Set<string>();
    for (const doc of docs) {
      for (const key of Object.keys(doc)) {
        if (!key.startsWith('_')) fields.add(key);
      }
    }
    return ['_id', '_rev', ...Array.from(fields).sort()];
  }, [docs]);

  const visibleFields = docFields.slice(0, 6);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2.5 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <button
          onClick={onBack}
          className={cn('size-6 rounded-md flex items-center justify-center transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}
        >
          <ChevronLeft className="size-4" />
        </button>
        <Database className="size-4 text-orange-400" />
        <span className={cn('font-semibold text-xs truncate flex-1', isDark ? 'text-zinc-100' : 'text-gray-900')}>
          {dbName}
        </span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500')}>
          {totalRows} docs
        </span>
        <button
          onClick={fetchDocs}
          className={cn('size-6 rounded-md flex items-center justify-center transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-gray-100 text-gray-400')}
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Search */}
      <div className={cn('px-3 py-2 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <div className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5', isDark ? 'bg-zinc-900 border border-zinc-800' : 'bg-gray-50 border border-gray-200')}>
          <Search className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            className={cn('flex-1 text-xs bg-transparent outline-none', isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400')}
            placeholder={t('dbSearchDocs')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className={cn('size-4', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className={cn('flex items-center gap-1 px-3 py-1.5 border-b shrink-0 flex-wrap', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <button onClick={toggleSelectAll} className={cn('size-6 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-gray-100 text-gray-400')}>
          {allSelected ? <CheckSquare className="size-3.5 text-orange-400" /> : <Square className="size-3.5" />}
        </button>
        <div className={cn('w-px h-4 mx-0.5', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-medium px-2 py-1 transition-colors"
        >
          <Plus className="size-3" /> {t('dbNewDoc')}
        </button>
        <button onClick={handleExport} className={cn('flex items-center gap-1 rounded-md text-[10px] px-2 py-1', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-600')}>
          <Download className="size-3" /> {t('dbExport')}
        </button>
        {selected.size > 0 && (
          <button onClick={handleBulkDelete} className="flex items-center gap-1 rounded-md text-[10px] px-2 py-1 text-red-400 hover:bg-red-900/20 ml-auto">
            <Trash2 className="size-3" /> {t('delete')} ({selected.size})
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={cn('flex items-center gap-2 mx-3 mt-2 rounded-lg px-3 py-2', isDark ? 'bg-red-950/80 border border-red-900/60' : 'bg-red-50 border border-red-200')}>
          <AlertCircle className="size-3.5 text-red-400 shrink-0" />
          <p className="text-[10px] flex-1 text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300">&times;</button>
        </div>
      )}

      {/* Document Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="size-5 text-orange-400 animate-spin" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-12">
            <FileJson className={cn('size-10 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('dbNoDocs')}</p>
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead className={cn('sticky top-0 z-10', isDark ? 'bg-zinc-900' : 'bg-gray-50')}>
              <tr className={cn('border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
                <th className="w-8 px-2 py-1.5" />
                {visibleFields.map((field) => (
                  <th
                    key={field}
                    className={cn('px-2 py-1.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap', isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-gray-500 hover:text-gray-700')}
                    onClick={() => handleSort(field)}
                  >
                    <span className="flex items-center gap-1">
                      {field}
                      {sortField === field && <ArrowUpDown className="size-2.5" />}
                    </span>
                  </th>
                ))}
                <th className="w-20 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const isExpanded = expandedId === doc._id;
                return (
                  <DocRow
                    key={doc._id}
                    doc={doc}
                    fields={visibleFields}
                    isDark={isDark}
                    t={t}
                    isSelected={selected.has(doc._id)}
                    isExpanded={isExpanded}
                    onToggleSelect={() => toggleSelect(doc._id)}
                    onToggleExpand={() => setExpandedId(isExpanded ? null : doc._id)}
                    onEdit={() => startEdit(doc)}
                    onDelete={() => handleDelete(doc)}
                    onCopy={() => navigator.clipboard.writeText(JSON.stringify(doc, null, 2))}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={cn('flex items-center justify-between px-3 py-2 border-t shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <span className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>
            {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalRows)} / {totalRows}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(0)}
              className={cn('size-6 rounded flex items-center justify-center transition-colors disabled:opacity-30', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}
            >
              <ChevronsLeft className="size-3" />
            </button>
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className={cn('size-6 rounded flex items-center justify-center transition-colors disabled:opacity-30', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}
            >
              <ChevronLeft className="size-3" />
            </button>
            <span className={cn('text-[10px] px-2', isDark ? 'text-zinc-400' : 'text-gray-600')}>
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className={cn('size-6 rounded flex items-center justify-center transition-colors disabled:opacity-30', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}
            >
              <ChevronRight className="size-3" />
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(totalPages - 1)}
              className={cn('size-6 rounded flex items-center justify-center transition-colors disabled:opacity-30', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}
            >
              <ChevronsRight className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* Edit document modal */}
      {editingDoc && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[200]" onClick={() => setEditingDoc(null)} />
          <div className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-[95%] max-w-lg max-h-[80vh] rounded-xl shadow-2xl flex flex-col',
            isDark ? 'bg-zinc-900 border border-zinc-700' : 'bg-white border border-gray-200',
          )}>
            <div className={cn('flex items-center gap-2 px-4 py-3 border-b shrink-0', isDark ? 'border-zinc-700' : 'border-gray-200')}>
              <Pencil className="size-3.5 text-orange-400" />
              <span className={cn('text-sm font-semibold flex-1 truncate', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                {editingDoc._id}
              </span>
              <button onClick={() => setEditingDoc(null)} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                className={cn(
                  'w-full h-64 rounded-lg p-3 text-xs font-mono outline-none border resize-none',
                  isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-gray-50 border-gray-200 text-gray-900',
                )}
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className={cn('flex justify-end gap-2 px-4 py-3 border-t', isDark ? 'border-zinc-700' : 'border-gray-200')}>
              <button
                onClick={() => setEditingDoc(null)}
                className={cn('text-xs px-3 py-1.5 rounded-lg', isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100')}
              >
                {t('cancel')}
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="text-xs px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && <Loader2 className="size-3 animate-spin" />}
                {t('kanbanSave')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create document modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[200]" onClick={() => setShowCreate(false)} />
          <div className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-[95%] max-w-lg max-h-[80vh] rounded-xl shadow-2xl flex flex-col',
            isDark ? 'bg-zinc-900 border border-zinc-700' : 'bg-white border border-gray-200',
          )}>
            <div className={cn('flex items-center gap-2 px-4 py-3 border-b shrink-0', isDark ? 'border-zinc-700' : 'border-gray-200')}>
              <Plus className="size-3.5 text-orange-400" />
              <span className={cn('text-sm font-semibold flex-1', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                {t('dbNewDoc')}
              </span>
              <button onClick={() => setShowCreate(false)} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                className={cn(
                  'w-full h-64 rounded-lg p-3 text-xs font-mono outline-none border resize-none',
                  isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-gray-50 border-gray-200 text-gray-900',
                )}
                value={newDocJson}
                onChange={(e) => setNewDocJson(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className={cn('flex justify-end gap-2 px-4 py-3 border-t', isDark ? 'border-zinc-700' : 'border-gray-200')}>
              <button
                onClick={() => setShowCreate(false)}
                className={cn('text-xs px-3 py-1.5 rounded-lg', isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100')}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="text-xs px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && <Loader2 className="size-3 animate-spin" />}
                {t('create')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Document Row ───────────────────────────────────────────────────────────

interface DocRowProps {
  doc: CouchDoc;
  fields: string[];
  isDark: boolean;
  t: (k: string) => string;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

function DocRow({ doc, fields, isDark, t, isSelected, isExpanded, onToggleSelect, onToggleExpand, onEdit, onDelete, onCopy }: DocRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <tr
        className={cn(
          'border-b transition-colors group',
          isDark ? 'border-zinc-800/50 hover:bg-zinc-800/30' : 'border-gray-100 hover:bg-gray-50/50',
          isSelected && (isDark ? 'bg-zinc-800/50' : 'bg-orange-50/30'),
        )}
      >
        <td className="px-2 py-1.5">
          <button onClick={onToggleSelect}>
            {isSelected ? <CheckSquare className="size-3 text-orange-400" /> : <Square className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />}
          </button>
        </td>
        {fields.map((field) => (
          <td
            key={field}
            className={cn('px-2 py-1.5 max-w-[120px] truncate cursor-pointer', isDark ? 'text-zinc-300' : 'text-gray-700')}
            onClick={onToggleExpand}
            title={formatCellValue(doc[field])}
          >
            {formatCellValue(doc[field])}
          </td>
        ))}
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onToggleExpand} className={cn('size-5 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-gray-200 text-gray-400')} title={t('dbViewDoc')}>
              {isExpanded ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </button>
            <button onClick={onEdit} className={cn('size-5 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-gray-200 text-gray-400')} title={t('dbEditDoc')}>
              <Pencil className="size-3" />
            </button>
            <button onClick={handleCopy} className={cn('size-5 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-gray-200 text-gray-400')} title={t('copyLabel')}>
              {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
            </button>
            <button onClick={onDelete} className={cn('size-5 rounded flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-red-500' : 'hover:bg-gray-200 text-red-400')} title={t('delete')}>
              <Trash2 className="size-3" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className={cn(isDark ? 'bg-zinc-900/50' : 'bg-gray-50')}>
          <td colSpan={fields.length + 2} className="px-4 py-3">
            <pre className={cn(
              'text-[10px] font-mono rounded-lg p-3 overflow-auto max-h-48 border',
              isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-200 text-gray-700',
            )}>
              {JSON.stringify(doc, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value.length > 50 ? value.slice(0, 50) + '...' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 50) + '...';
  return String(value);
}
