import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Brain,
  FileCode,
  FileEdit,
  TerminalSquare,
  ChevronDown,
  ChevronRight,
  Eye,
  Sparkles,
  CheckCircle2,
  Loader2,
  Search,
  Globe,
  FolderTree,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';

interface Props {
  output: string;
  isRunning: boolean;
}

type BlockType = 'thinking' | 'tool_read' | 'tool_edit' | 'tool_run' | 'tool_search' | 'tool_browse' | 'tool_ls' | 'response' | 'user_prompt' | 'raw';

interface Block {
  id: number;
  type: BlockType;
  title: string;
  content: string;
  complete: boolean;
}

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)|\r/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

function parseBlocks(raw: string): Block[] {
  const clean = stripAnsi(raw);
  const lines = clean.split('\n');
  const blocks: Block[] = [];
  let id = 0;

  let currentBlock: Block | null = null;

  const push = () => {
    if (currentBlock) {
      currentBlock.content = currentBlock.content.trimEnd();
      currentBlock.complete = true;
      blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  const startBlock = (type: BlockType, title: string, firstLine = '') => {
    push();
    currentBlock = { id: id++, type, title, content: firstLine, complete: false };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentBlock) currentBlock.content += '\n';
      continue;
    }

    // User prompt detection (lines the user typed)
    if (trimmed.startsWith('$ ') || trimmed.startsWith('> ')) {
      const isUserPrompt = i > 0 && !currentBlock;
      if (isUserPrompt) {
        startBlock('user_prompt', trimmed.slice(2), trimmed.slice(2));
        continue;
      }
    }

    // Thinking / reasoning patterns
    if (
      /^(thinking|razonando|reasoning)/i.test(trimmed) ||
      trimmed === '...' ||
      /^⏺\s*(thinking|razonando)/i.test(trimmed) ||
      /^\*\*thinking\*\*/i.test(trimmed)
    ) {
      startBlock('thinking', 'Razonando...', '');
      continue;
    }

    // Tool: Read file
    if (
      /^(⏺\s*)?(Read|Reading|Leyendo)\s+(file\s+)?/i.test(trimmed) ||
      /^(📖|📄)\s/i.test(trimmed)
    ) {
      const filePath = trimmed.replace(/^(⏺\s*)?(Read|Reading|Leyendo)\s+(file\s+)?/i, '').replace(/^(📖|📄)\s/, '').trim();
      startBlock('tool_read', filePath || 'Leyendo archivo', '');
      continue;
    }

    // Tool: Edit file
    if (
      /^(⏺\s*)?(Edit|Editing|Editando|Wrote|Writing)\s+(file\s+)?/i.test(trimmed) ||
      /^(✏️|📝)\s/i.test(trimmed)
    ) {
      const filePath = trimmed.replace(/^(⏺\s*)?(Edit|Editing|Editando|Wrote|Writing)\s+(file\s+)?/i, '').replace(/^(✏️|📝)\s/, '').trim();
      startBlock('tool_edit', filePath || 'Editando archivo', '');
      continue;
    }

    // Tool: Run command
    if (
      /^(⏺\s*)?(Run|Running|Ejecutando|Bash|Shell)\s*/i.test(trimmed) ||
      /^(🔨|⚡)\s/i.test(trimmed)
    ) {
      const cmd = trimmed.replace(/^(⏺\s*)?(Run|Running|Ejecutando|Bash|Shell)\s*/i, '').replace(/^(🔨|⚡)\s/, '').trim();
      startBlock('tool_run', cmd || 'Ejecutando comando', '');
      continue;
    }

    // Tool: Search / grep
    if (/^(⏺\s*)?(Search|Searching|Grep|Buscando)\s*/i.test(trimmed)) {
      const q = trimmed.replace(/^(⏺\s*)?(Search|Searching|Grep|Buscando)\s*/i, '').trim();
      startBlock('tool_search', q || 'Buscando', '');
      continue;
    }

    // Tool: Browse / fetch
    if (/^(⏺\s*)?(Browse|Fetch|Navegando)\s*/i.test(trimmed)) {
      const url = trimmed.replace(/^(⏺\s*)?(Browse|Fetch|Navegando)\s*/i, '').trim();
      startBlock('tool_browse', url || 'Navegando', '');
      continue;
    }

    // Tool: List directory
    if (/^(⏺\s*)?(List|Listing|Ls|Glob)\s*/i.test(trimmed)) {
      const dir = trimmed.replace(/^(⏺\s*)?(List|Listing|Ls|Glob)\s*/i, '').trim();
      startBlock('tool_ls', dir || 'Explorando archivos', '');
      continue;
    }

    // Section separator: ⏺ with other text → response
    if (/^⏺\s+/.test(trimmed)) {
      const text = trimmed.replace(/^⏺\s+/, '');
      if (currentBlock?.type === 'response') {
        currentBlock.content += '\n' + text;
      } else {
        startBlock('response', '', text);
      }
      continue;
    }

    // Continuation of current block or new raw block
    if (currentBlock) {
      currentBlock.content += (currentBlock.content ? '\n' : '') + line;
    } else {
      startBlock('raw', '', line);
    }
  }

  // Finalize last block
  if (currentBlock) {
    currentBlock.content = currentBlock.content.trimEnd();
    const lastLineIdx = clean.trimEnd().length;
    const endsClean = clean.length - lastLineIdx < 3;
    currentBlock.complete = endsClean;
    blocks.push(currentBlock);
  }

  return blocks;
}

const TOOL_ICONS: Record<string, typeof FileCode> = {
  tool_read: Eye,
  tool_edit: FileEdit,
  tool_run: TerminalSquare,
  tool_search: Search,
  tool_browse: Globe,
  tool_ls: FolderTree,
};

function getToolLabel(type: string, t: (key: string) => string): string {
  const keys: Record<string, string> = {
    tool_read: 'readLabel',
    tool_edit: 'editLabel',
    tool_run: 'runLabel',
    tool_search: 'searchLabel',
    tool_browse: 'browseLabel',
    tool_ls: 'exploreLabel',
  };
  const k = keys[type];
  return k ? t(k) : t('tool');
}

const TOOL_COLORS: Record<string, { border: string; bg: string; icon: string; title: string }> = {
  tool_read: { border: 'border-sky-800/40', bg: 'bg-sky-950/30', icon: 'text-sky-400', title: 'text-sky-300' },
  tool_edit: { border: 'border-amber-800/40', bg: 'bg-amber-950/30', icon: 'text-amber-400', title: 'text-amber-300' },
  tool_run: { border: 'border-emerald-800/40', bg: 'bg-emerald-950/30', icon: 'text-emerald-400', title: 'text-emerald-300' },
  tool_search: { border: 'border-purple-800/40', bg: 'bg-purple-950/30', icon: 'text-purple-400', title: 'text-purple-300' },
  tool_browse: { border: 'border-blue-800/40', bg: 'bg-blue-950/30', icon: 'text-blue-400', title: 'text-blue-300' },
  tool_ls: { border: 'border-teal-800/40', bg: 'bg-teal-950/30', icon: 'text-teal-400', title: 'text-teal-300' },
};

function ThinkingBlock({ block, isLast, isRunning }: { block: Block; isLast: boolean; isRunning: boolean }) {
  const { isDark, t } = usePluginSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const showSpinner = isLast && isRunning && !block.complete;

  useEffect(() => {
    if (!showSpinner) return;
    startRef.current = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200);
    return () => clearInterval(iv);
  }, [showSpinner]);

  return (
    <div className="my-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <div className="flex items-center gap-1.5">
          {showSpinner ? (
            <div className="relative size-4 shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
            </div>
          ) : (
            <Brain className="size-4 text-violet-400/70 shrink-0" />
          )}
          <span className="text-[11px] font-medium text-violet-300/80">
            {showSpinner ? t('reasoningActive') : t('reasoning')}
          </span>
          {showSpinner && elapsed > 0 && (
            <span className="text-[9px] text-violet-500/60 tabular-nums">{elapsed}s</span>
          )}
        </div>
        {collapsed
          ? <ChevronRight className="size-3 text-zinc-600 ml-auto" />
          : <ChevronDown className="size-3 text-zinc-600 ml-auto" />}
      </button>

      {!collapsed && (
        <div className="mt-1.5 ml-6 pl-3 border-l-2 border-violet-800/30">
          <p className={cn(
            'text-[11px] leading-relaxed whitespace-pre-wrap',
            showSpinner ? 'text-violet-300/70' : (isDark ? 'text-zinc-500' : 'text-gray-500'),
          )}>
            {block.content || (showSpinner ? '' : '...')}
            {showSpinner && (
              <span className="inline-block w-[5px] h-[13px] bg-violet-400/60 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function ToolBlock({ block, isLast, isRunning }: { block: Block; isLast: boolean; isRunning: boolean }) {
  const { t } = usePluginSettings();
  const [collapsed, setCollapsed] = useState(false);
  const showSpinner = isLast && isRunning && !block.complete;
  const colors = TOOL_COLORS[block.type] || TOOL_COLORS.tool_run;
  const Icon = TOOL_ICONS[block.type] || TerminalSquare;
  const label = getToolLabel(block.type, t);

  return (
    <div className={cn(
      'my-2 rounded-lg border overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200',
      colors.border, colors.bg,
    )}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left px-3 py-2"
      >
        {showSpinner
          ? <Loader2 className={cn('size-3.5 animate-spin shrink-0', colors.icon)} />
          : <Icon className={cn('size-3.5 shrink-0', colors.icon)} />}
        <div className="flex-1 min-w-0">
          <span className={cn('text-[11px] font-medium', colors.title)}>{label}</span>
          {block.title && (
            <span className="text-[10px] text-zinc-500 ml-1.5 font-mono truncate">{block.title}</span>
          )}
        </div>
        {!showSpinner && block.complete && (
          <CheckCircle2 className="size-3 text-emerald-500/60 shrink-0" />
        )}
        {collapsed
          ? <ChevronRight className="size-3 text-zinc-600 shrink-0" />
          : <ChevronDown className="size-3 text-zinc-600 shrink-0" />}
      </button>

      {!collapsed && block.content && (
        <div className="px-3 pb-2 pt-0">
          <div className="bg-black/30 rounded-md p-2 max-h-48 overflow-y-auto">
            <pre className="text-[10px] leading-relaxed text-zinc-400 whitespace-pre-wrap break-all font-mono">
              {block.content}
              {showSpinner && (
                <span className="inline-block w-[5px] h-[11px] bg-zinc-400/60 ml-0.5 animate-pulse align-middle" />
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ResponseBlock({ block, isLast, isRunning }: { block: Block; isLast: boolean; isRunning: boolean }) {
  const { isDark } = usePluginSettings();
  const showCursor = isLast && isRunning && !block.complete;

  return (
    <div className="my-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex items-start gap-2">
        <div className="size-5 rounded-md bg-violet-600/20 flex items-center justify-center mt-0.5 shrink-0">
          <Sparkles className="size-3 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[12px] leading-relaxed whitespace-pre-wrap',
            isDark ? 'text-zinc-200' : 'text-gray-800',
          )}>
            {block.content}
            {showCursor && (
              <span className="inline-block w-[5px] h-[14px] bg-violet-400/70 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function UserPromptBlock({ block }: { block: Block }) {
  return (
    <div className="my-3 flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="max-w-[85%] bg-violet-600/15 border border-violet-700/30 rounded-xl rounded-br-sm px-3 py-2">
        <p className="text-[12px] text-violet-200 whitespace-pre-wrap">{block.content}</p>
      </div>
    </div>
  );
}

function RawBlock({ block, isLast, isRunning }: { block: Block; isLast: boolean; isRunning: boolean }) {
  const { isDark } = usePluginSettings();
  const showCursor = isLast && isRunning && !block.complete;

  if (!block.content.trim()) return null;

  return (
    <div className="my-1">
      <pre className={cn(
        'text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono',
        isDark ? 'text-zinc-400' : 'text-gray-600',
      )}>
        {block.content}
        {showCursor && (
          <span className="inline-block w-[5px] h-[12px] bg-zinc-400/60 ml-0.5 animate-pulse align-middle" />
        )}
      </pre>
    </div>
  );
}

export function CursorAgentView({ output, isRunning }: Props) {
  const { t } = usePluginSettings();
  const blocks = useMemo(() => parseBlocks(output), [output]);
  const lastBlockIdx = blocks.length - 1;

  if (blocks.length === 0 && isRunning) {
    return (
      <div className="flex items-center gap-2 p-3">
        <div className="relative size-5 shrink-0">
          <div className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
        </div>
        <span className="text-[11px] text-violet-300/80">{t('startingAgent')}</span>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      {blocks.map((block, idx) => {
        const isLast = idx === lastBlockIdx;
        switch (block.type) {
          case 'thinking':
            return <ThinkingBlock key={block.id} block={block} isLast={isLast} isRunning={isRunning} />;
          case 'tool_read':
          case 'tool_edit':
          case 'tool_run':
          case 'tool_search':
          case 'tool_browse':
          case 'tool_ls':
            return <ToolBlock key={block.id} block={block} isLast={isLast} isRunning={isRunning} />;
          case 'response':
            return <ResponseBlock key={block.id} block={block} isLast={isLast} isRunning={isRunning} />;
          case 'user_prompt':
            return <UserPromptBlock key={block.id} block={block} />;
          default:
            return <RawBlock key={block.id} block={block} isLast={isLast} isRunning={isRunning} />;
        }
      })}

      {isRunning && blocks.length > 0 && blocks[lastBlockIdx]?.complete && (
        <div className="flex items-center gap-2 py-2">
          <div className="relative size-4 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
          </div>
          <span className="text-[10px] text-violet-400/60">{t('processingStatus')}</span>
        </div>
      )}
    </div>
  );
}
