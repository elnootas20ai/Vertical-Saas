import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Puzzle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  FileCode,
  GripVertical,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Tag,
} from 'lucide-react';
import type { SavedComponent, ComponentCategory } from '../types';
import { agentApi } from '../lib/api';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';

interface Props {
  onInsert?: (comp: SavedComponent & { content: string; path: string }) => void;
  onOpen?: (comp: SavedComponent) => void;
}

export function ComponentLibrary({ onInsert, onOpen }: Props) {
  const { isDark, t } = usePluginSettings();
  const [components, setComponents] = useState<SavedComponent[]>([]);
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('general');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await agentApi.getComponents();
      setComponents(data.components.sort((a, b) => a.order - b.order));
      setCategories(data.categories);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    try {
      const comp = await agentApi.createComponent(createName.trim(), createCategory);
      setComponents((prev) => [...prev, comp]);
      setCreateName('');
      setShowCreate(false);
      if (!categories.find((c) => c.id === comp.category)) {
        await load();
      }
    } catch { /* ignore */ }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      const updated = await agentApi.updateComponent(id, { name: editName.trim() });
      setComponents((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch { /* ignore */ }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await agentApi.deleteComponent(id);
      setComponents((prev) => prev.filter((c) => c.id !== id));
    } catch { /* ignore */ }
    setMenuOpenId(null);
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await agentApi.duplicateComponent(id);
      setComponents((prev) => [...prev, dup]);
    } catch { /* ignore */ }
    setMenuOpenId(null);
  };

  const handleInsert = async (id: string) => {
    if (!onInsert) return;
    try {
      const data = await agentApi.getComponentContent(id);
      onInsert(data);
    } catch { /* ignore */ }
    setMenuOpenId(null);
  };

  const handleChangeCategory = async (compId: string, catId: string) => {
    try {
      const updated = await agentApi.updateComponent(compId, { category: catId });
      setComponents((prev) => prev.map((c) => (c.id === compId ? updated : c)));
    } catch { /* ignore */ }
    setMenuOpenId(null);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const cat = await agentApi.createCategory(newCategoryName.trim());
      setCategories((prev) => [...prev, cat]);
      setNewCategoryName('');
      setShowAddCategory(false);
    } catch { /* ignore */ }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      await agentApi.deleteCategory(catId);
      setCategories((prev) => prev.filter((c) => c.id !== catId));
      setComponents((prev) => prev.map((c) => (c.category === catId ? { ...c, category: 'general' } : c)));
      if (activeCategory === catId) setActiveCategory(null);
    } catch { /* ignore */ }
  };

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  };
  const handleDragEnd = async () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const items = [...components];
      const fromIdx = items.findIndex((c) => c.id === dragId);
      const toIdx = items.findIndex((c) => c.id === dragOverId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, moved);
        setComponents(items);
        try {
          await agentApi.reorderComponents(items.map((c) => c.id));
        } catch { /* ignore */ }
      }
    }
    setDragId(null);
    setDragOverId(null);
  };

  const toggleCatCollapse = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const filtered = activeCategory
    ? components.filter((c) => c.category === activeCategory)
    : components;

  const grouped = new Map<string, SavedComponent[]>();
  for (const comp of filtered) {
    const cat = comp.category || 'general';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(comp);
  }

  const allCats: ComponentCategory[] = categories.length > 0
    ? categories
    : [{ id: 'general', name: 'General', order: 0 }];

  return (
    <div className={cn('flex flex-col h-full', isDark ? 'bg-zinc-950' : 'bg-white')}>
      {/* Category filter tabs */}
      <div className={cn(
        'flex items-center gap-1 px-3 py-2 border-b overflow-x-auto scrollbar-none',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
            !activeCategory
              ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-700'
              : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
          )}
        >
          {t('allCategories')}
        </button>
        {allCats.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
            className={cn(
              'shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors',
              cat.id === activeCategory
                ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-700'
                : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
            )}
          >
            {cat.name}
          </button>
        ))}
        <button
          onClick={() => setShowAddCategory(true)}
          className={cn(
            'shrink-0 size-5 rounded-md flex items-center justify-center transition-colors',
            isDark ? 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100',
          )}
          title={t('addCategory')}
        >
          <Plus className="size-3" />
        </button>
      </div>

      {/* Add category inline */}
      {showAddCategory && (
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 border-b',
          isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
        )}>
          <Tag className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            className={cn(
              'flex-1 text-xs bg-transparent outline-none',
              isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
            )}
            placeholder={t('categoryName')}
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') setShowAddCategory(false); }}
            autoFocus
          />
          <button onClick={handleAddCategory} className="text-emerald-400 hover:text-emerald-300">
            <Check className="size-3.5" />
          </button>
          <button onClick={() => setShowAddCategory(false)} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Header with create button */}
      <div className={cn('flex items-center justify-between px-4 py-2.5 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <div className="flex items-center gap-2">
          <Puzzle className="size-4 text-cyan-400" />
          <span className={cn('font-semibold text-xs', isDark ? 'text-zinc-100' : 'text-gray-900')}>
            {t('components')}
          </span>
          {components.length > 0 && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full',
              isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-500',
            )}>
              {components.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium px-3 py-1.5 transition-colors"
        >
          <Plus className="size-3.5" />
          {t('new')}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className={cn(
          'px-4 py-3 border-b space-y-2',
          isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
        )}>
          <input
            className={cn(
              'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors',
              isDark
                ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500/50'
                : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-cyan-500',
            )}
            placeholder={t('componentPlaceholder')}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              value={createCategory}
              onChange={(e) => setCreateCategory(e.target.value)}
              className={cn(
                'flex-1 rounded-lg px-2 py-1 text-[10px] outline-none border',
                isDark
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                  : 'bg-white border-gray-300 text-gray-700',
              )}
            >
              {allCats.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={!createName.trim()}
              className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-medium transition-colors disabled:opacity-40"
            >
              {t('create')}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className={cn(
                'px-2 py-1 rounded-lg text-[10px] transition-colors',
                isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Component list */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className={cn('text-xs', isDark ? 'text-zinc-600' : 'text-gray-400')}>{t('loading')}</div>
          </div>
        )}

        {!loading && components.length === 0 && (
          <div className="text-center py-12 px-4">
            <Puzzle className={cn('size-10 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('noComponents')}</p>
            <p className={cn('text-xs mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {t('startComponent')}
            </p>
          </div>
        )}

        {!loading && activeCategory ? (
          // Flat list when filtering by category
          <div className="px-2 space-y-0.5">
            {filtered.map((comp) => (
              <ComponentItem
                key={comp.id}
                comp={comp}
                isDark={isDark}
                t={t}
                categories={allCats}
                editingId={editingId}
                editName={editName}
                menuOpenId={menuOpenId}
                dragOverId={dragOverId}
                onStartEdit={(c) => { setEditingId(c.id); setEditName(c.name); setMenuOpenId(null); }}
                onEditNameChange={setEditName}
                onCommitRename={handleRename}
                onCancelEdit={() => setEditingId(null)}
                onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                onCloseMenu={() => setMenuOpenId(null)}
                onOpen={(c) => onOpen?.(c)}
                onInsert={handleInsert}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onChangeCategory={handleChangeCategory}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        ) : !loading && grouped.size > 0 ? (
          // Grouped by categories
          [...grouped.entries()].map(([catId, comps]) => {
            const cat = allCats.find((c) => c.id === catId);
            const isCollapsed = collapsedCats.has(catId);

            return (
              <div key={catId} className="mb-1">
                <div className={cn(
                  'flex items-center justify-between px-3 py-1.5 group',
                  isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-gray-50',
                )}>
                  <button
                    onClick={() => toggleCatCollapse(catId)}
                    className="flex items-center gap-1.5 flex-1"
                  >
                    {isCollapsed
                      ? <ChevronRight className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                      : <ChevronDown className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                    }
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                      {cat?.name || catId}
                    </span>
                    <span className={cn('text-[9px] px-1 rounded', isDark ? 'text-zinc-600 bg-zinc-800/50' : 'text-gray-400 bg-gray-100')}>
                      {comps.length}
                    </span>
                  </button>
                  {catId !== 'general' && (
                    <button
                      onClick={() => handleDeleteCategory(catId)}
                      className={cn(
                        'size-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
                        isDark ? 'text-zinc-600 hover:text-red-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100',
                      )}
                      title={t('deleteCategory')}
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="px-2 space-y-0.5">
                    {comps.map((comp) => (
                      <ComponentItem
                        key={comp.id}
                        comp={comp}
                        isDark={isDark}
                        t={t}
                        categories={allCats}
                        editingId={editingId}
                        editName={editName}
                        menuOpenId={menuOpenId}
                        dragOverId={dragOverId}
                        onStartEdit={(c) => { setEditingId(c.id); setEditName(c.name); setMenuOpenId(null); }}
                        onEditNameChange={setEditName}
                        onCommitRename={handleRename}
                        onCancelEdit={() => setEditingId(null)}
                        onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                        onCloseMenu={() => setMenuOpenId(null)}
                        onOpen={(c) => onOpen?.(c)}
                        onInsert={handleInsert}
                        onDuplicate={handleDuplicate}
                        onDelete={handleDelete}
                        onChangeCategory={handleChangeCategory}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : null}
      </div>
    </div>
  );
}

interface ComponentItemProps {
  comp: SavedComponent;
  isDark: boolean;
  t: (key: string) => string;
  categories: ComponentCategory[];
  editingId: string | null;
  editName: string;
  menuOpenId: string | null;
  dragOverId: string | null;
  onStartEdit: (comp: SavedComponent) => void;
  onEditNameChange: (name: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onMenuToggle: (id: string) => void;
  onCloseMenu: () => void;
  onOpen: (comp: SavedComponent) => void;
  onInsert: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeCategory: (compId: string, catId: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

function ComponentItem({
  comp, isDark, t, categories,
  editingId, editName, menuOpenId, dragOverId,
  onStartEdit, onEditNameChange, onCommitRename, onCancelEdit,
  onMenuToggle, onCloseMenu,
  onOpen, onInsert, onDuplicate, onDelete, onChangeCategory,
  onDragStart, onDragOver, onDragEnd,
}: ComponentItemProps) {
  const isEditing = editingId === comp.id;
  const isMenuOpen = menuOpenId === comp.id;
  const isDragOver = dragOverId === comp.id;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(comp.id)}
      onDragOver={(e) => onDragOver(e, comp.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(comp)}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-all',
        isDragOver
          ? isDark ? 'bg-cyan-900/20 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-300'
          : isDark
            ? 'hover:bg-zinc-800/40 border border-transparent'
            : 'hover:bg-gray-50 border border-transparent',
      )}
    >
      <div className={cn(
        'shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity',
        isDark ? 'text-zinc-600' : 'text-gray-400',
      )}>
        <GripVertical className="size-3" />
      </div>

      <div className={cn(
        'size-7 rounded-lg flex items-center justify-center shrink-0',
        isDark ? 'bg-cyan-900/30 text-cyan-400' : 'bg-cyan-50 text-cyan-600',
      )}>
        <FileCode className="size-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            className={cn(
              'w-full border rounded px-2 py-0.5 text-xs outline-none focus:border-cyan-500',
              isDark ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-gray-50 border-gray-300 text-gray-900',
            )}
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={() => onCommitRename(comp.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename(comp.id);
              if (e.key === 'Escape') onCancelEdit();
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <p className={cn('text-xs font-medium truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{comp.name}</p>
            <p className={cn('text-[10px] truncate font-mono', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {comp.fileName}
            </p>
          </>
        )}
      </div>

      <div className="relative shrink-0">
        <button
          className={cn(
            'size-6 flex items-center justify-center rounded-md transition-colors',
            isMenuOpen
              ? isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800'
              : isDark
                ? 'opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-400'
                : 'opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-500',
          )}
          onClick={(e) => { e.stopPropagation(); onMenuToggle(comp.id); }}
        >
          <MoreHorizontal className="size-3.5" />
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={onCloseMenu} />
            <div className={cn(
              'absolute right-0 top-7 z-[110] w-44 rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100 border',
              isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200',
            )}>
              <button
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                  isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50',
                )}
                onClick={(e) => { e.stopPropagation(); onInsert(comp.id); }}
              >
                <FileCode className="size-3" /> {t('insert')}
              </button>
              <button
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                  isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50',
                )}
                onClick={(e) => { e.stopPropagation(); onStartEdit(comp); }}
              >
                <Pencil className="size-3" /> {t('editName')}
              </button>
              <button
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                  isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50',
                )}
                onClick={(e) => { e.stopPropagation(); onDuplicate(comp.id); }}
              >
                <Copy className="size-3" /> {t('duplicate')}
              </button>

              {/* Category submenu */}
              <div className={cn('border-t my-1', isDark ? 'border-zinc-800' : 'border-gray-200')} />
              <div className={cn('px-3 py-1 text-[10px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('categoryLabel')}
              </div>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-1 text-[11px] transition-colors',
                    comp.category === cat.id
                      ? isDark ? 'text-cyan-400 bg-cyan-900/20' : 'text-cyan-600 bg-cyan-50'
                      : isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-50',
                  )}
                  onClick={(e) => { e.stopPropagation(); onChangeCategory(comp.id, cat.id); }}
                >
                  <Tag className="size-2.5" />
                  {cat.name}
                  {comp.category === cat.id && <Check className="size-2.5 ml-auto" />}
                </button>
              ))}

              <div className={cn('border-t my-1', isDark ? 'border-zinc-800' : 'border-gray-200')} />
              <button
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors',
                  isDark ? 'text-red-400 hover:bg-zinc-800' : 'text-red-500 hover:bg-gray-50',
                )}
                onClick={(e) => { e.stopPropagation(); onDelete(comp.id); }}
              >
                <Trash2 className="size-3" /> {t('delete')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
