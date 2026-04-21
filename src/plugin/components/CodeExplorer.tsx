import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  X,
  Code2,
  Loader2,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { TabLoader } from './TabLoader';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown',
  py: 'python', sql: 'sql', yaml: 'yaml', yml: 'yaml', xml: 'xml',
  sh: 'shell', bash: 'shell', env: 'plaintext', txt: 'plaintext',
};

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'plaintext';
}

const EXT_COLORS: Record<string, string> = {
  tsx: 'text-blue-400', ts: 'text-blue-400', jsx: 'text-yellow-400',
  js: 'text-yellow-400', css: 'text-pink-400', json: 'text-green-400',
  md: 'text-gray-400', html: 'text-orange-400',
};

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_COLORS[ext] || 'text-zinc-500';
}

function TreeItem({
  node, depth, expandedDirs, selectedPath, onToggleDir, onSelectFile, isDark, searchTerm,
}: {
  node: TreeNode; depth: number;
  expandedDirs: Set<string>; selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  isDark: boolean; searchTerm: string;
}) {
  const isDir = node.type === 'dir';
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  if (searchTerm && isDir) {
    const hasMatch = matchesSearch(node, searchTerm);
    if (!hasMatch) return null;
  }
  if (searchTerm && !isDir && !node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => isDir ? onToggleDir(node.path) : onSelectFile(node.path)}
        className={cn(
          'flex items-center gap-1.5 w-full text-left py-1 pr-2 text-xs transition-colors rounded-md',
          isSelected
            ? isDark ? 'bg-violet-600/20 text-violet-300' : 'bg-violet-100 text-violet-700'
            : isDark ? 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900',
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {isDir ? (
          <>
            {isExpanded ? <ChevronDown className="size-3 shrink-0 text-zinc-500" /> : <ChevronRight className="size-3 shrink-0 text-zinc-500" />}
            {isExpanded
              ? <FolderOpen className="size-3.5 shrink-0 text-amber-400" />
              : <Folder className="size-3.5 shrink-0 text-amber-500/70" />
            }
          </>
        ) : (
          <>
            <span className="size-3 shrink-0" />
            <File className={cn('size-3.5 shrink-0', getFileColor(node.name))} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && isExpanded && node.children?.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          expandedDirs={expandedDirs}
          selectedPath={selectedPath}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          isDark={isDark}
          searchTerm={searchTerm}
        />
      ))}
    </>
  );
}

function matchesSearch(node: TreeNode, term: string): boolean {
  const lower = term.toLowerCase();
  if (node.name.toLowerCase().includes(lower)) return true;
  if (node.children) return node.children.some((c) => matchesSearch(c, lower));
  return false;
}

export function CodeExplorer() {
  const { isDark, t } = usePluginSettings();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/code/tree');
      const data = await res.json();
      if (data.ok) setTree(data.tree);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const selectFile = async (filePath: string) => {
    setSelectedPath(filePath);
    setFileLoading(true);
    try {
      const res = await fetch(`/api/code/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.ok) setFileContent(data.content);
      else setFileContent(`// Error: ${data.error}`);
    } catch {
      setFileContent('// Error al cargar archivo');
    }
    setFileLoading(false);
  };

  const handleBackToTree = () => {
    setSelectedPath(null);
    setFileContent(null);
  };

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  if (loading) {
    return <TabLoader text={t('loading')} />;
  }

  if (selectedPath && fileContent !== null) {
    const lang = getLanguage(selectedPath);
    const fileName = selectedPath.split('/').pop() || selectedPath;

    return (
      <div className="flex flex-col h-full">
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 border-b shrink-0',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}>
          <button
            onClick={handleBackToTree}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-colors',
              isDark ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700',
            )}
          >
            <ChevronRight className="size-3.5 rotate-180" />
          </button>
          <File className={cn('size-3.5 shrink-0', getFileColor(fileName))} />
          <span className={cn('text-xs font-medium truncate', isDark ? 'text-zinc-300' : 'text-gray-700')}>
            {fileName}
          </span>
          <span className={cn('text-[10px] ml-auto shrink-0', isDark ? 'text-zinc-600' : 'text-gray-400')}>
            src/{selectedPath}
          </span>
        </div>

        <div className="flex-1 min-h-0">
          {fileLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 text-violet-400 animate-spin" />
            </div>
          ) : (
            <Editor
              height="100%"
              language={lang}
              value={fileContent}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                renderLineHighlight: 'none',
                overviewRulerBorder: false,
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-emerald-400" />
          <span className={cn('font-semibold text-xs', isDark ? 'text-zinc-100' : 'text-gray-900')}>
            src/
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-colors',
              showSearch
                ? isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800'
                : isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
            )}
          >
            <Search className="size-3" />
          </button>
          <button
            onClick={fetchTree}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-colors',
              isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
            )}
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
      </div>

      {showSearch && (
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 border-b',
          isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
        )}>
          <Search className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            ref={searchRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('fileSearchPlaceholder')}
            className={cn(
              'flex-1 text-xs bg-transparent outline-none',
              isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
            )}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1 px-1">
        {tree.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Folder className={cn('size-10 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              {t('fileSearchNoResults')}
            </p>
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              expandedDirs={expandedDirs}
              selectedPath={selectedPath}
              onToggleDir={toggleDir}
              onSelectFile={selectFile}
              isDark={isDark}
              searchTerm={searchTerm}
            />
          ))
        )}
      </div>
    </div>
  );
}
