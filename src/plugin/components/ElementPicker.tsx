import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MousePointerClick, GitCommitHorizontal, Loader2, User } from 'lucide-react';
import { agentApi } from '../lib/api';
import { usePluginSettings } from '../PluginProvider';
import type { ElementReference } from '../types';

interface Props {
  active: boolean;
  onPick: (ref: ElementReference) => void;
  onCancel: () => void;
}

interface HighlightData {
  rect: DOMRect;
  label: string;
  tag: string;
  componentName: string | null;
  classes: string;
}

interface BlameData {
  author: string;
  email: string | null;
  date: string | null;
  commitHash: string | null;
  summary: string | null;
  githubUser: string | null;
  avatarUrl: string | null;
}

interface PickedState {
  el: HTMLElement;
  info: string;
  ref: ElementReference;
  rect: DOMRect;
  sourceFile: string | null;
  sourceLine: number | null;
}

function getReactFiber(el: HTMLElement): any {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  return key ? (el as any)[key] : null;
}

function findReactComponent(fiber: any): { name: string; source: string | null; fileName: string | null; lineNumber: number | null } | null {
  let current = fiber;
  const seen = new Set();
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current.type === 'function' || typeof current.type === 'object') {
      const name =
        current.type?.displayName ||
        current.type?.name ||
        current.type?.render?.displayName ||
        current.type?.render?.name ||
        null;

      if (name && !name.startsWith('_') && name !== 'Fragment') {
        const src = current._debugSource;
        const sourceStr = src ? `${src.fileName}:${src.lineNumber}` : null;
        return {
          name,
          source: sourceStr,
          fileName: src?.fileName ?? null,
          lineNumber: src?.lineNumber ?? null,
        };
      }
    }
    current = current.return;
  }
  return null;
}

function getMatchingCSSRules(el: HTMLElement): string[] {
  const matched: string[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let href = '';
      try { href = sheet.href || (sheet.ownerNode as HTMLElement)?.getAttribute?.('data-vite-dev-id') || ''; } catch { /* cross-origin */ }
      let rules: CSSRuleList;
      try { rules = sheet.cssRules || sheet.rules; } catch { continue; }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (el.matches(rule.selectorText)) {
              const src = href ? href.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '') : '(inline)';
              const props = Array.from(rule.style)
                .slice(0, 6)
                .map((p) => `${p}: ${rule.style.getPropertyValue(p)}`)
                .join('; ');
              matched.push(`  ${rule.selectorText} { ${props} }  /* ${src} */`);
            }
          } catch { /* :has() etc */ }
        }
      }
    }
  } catch { /* safe fallback */ }
  return matched.slice(0, 10);
}

function buildElementInfo(el: HTMLElement, blame?: BlameData | null): { text: string; sourceFile: string | null; sourceLine: number | null } {
  const tag = el.tagName.toLowerCase();
  const classes =
    el.className && typeof el.className === 'string'
      ? el.className
          .split(/\s+/)
          .filter((c) => c && !c.startsWith('__'))
          .slice(0, 12)
          .join(' ')
      : '';
  const text = (el.textContent || '').trim().slice(0, 80);
  const id = el.id ? `#${el.id}` : '';

  const fiber = getReactFiber(el);
  const comp = fiber ? findReactComponent(fiber) : null;

  const lines: string[] = ['[Selected UI element]'];

  if (comp?.name) {
    lines.push(`Component: ${comp.name}`);
    if (comp.source) lines.push(`File: ${comp.source}`);
  }

  lines.push(`Tag: <${tag}${id}>`);
  if (classes) lines.push(`Classes: ${classes}`);
  if (text) lines.push(`Text: "${text.length > 60 ? text.slice(0, 60) + '...' : text}"`);

  const rect = el.getBoundingClientRect();
  lines.push(`Size: ${Math.round(rect.width)}×${Math.round(rect.height)}px`);

  if (blame) {
    lines.push(`\nLast modified by:`);
    lines.push(`  Author: ${blame.author}${blame.githubUser ? ` (@${blame.githubUser})` : ''}`);
    if (blame.date) lines.push(`  Date: ${new Date(blame.date).toLocaleString()}`);
    if (blame.summary) lines.push(`  Commit: ${blame.summary}`);
    if (blame.commitHash) lines.push(`  Hash: ${blame.commitHash.slice(0, 8)}`);
  }

  return {
    text: lines.join('\n'),
    sourceFile: comp?.fileName ?? null,
    sourceLine: comp?.lineNumber ?? null,
  };
}

function buildJsPath(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

function buildCssSelectorPath(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.body && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    let selector = tag;

    if (current.className && typeof current.className === 'string') {
      const classes = current.className
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('__'));
      if (classes.length > 0) {
        selector += classes.slice(0, 6).map((c) => `.${CSS.escape(c)}`).join('');
      }
    } else {
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

function getJsxAlternative(filePath: string): string | null {
  if (filePath.endsWith('.tsx')) return filePath.slice(0, -4) + '.jsx';
  if (filePath.endsWith('.ts') && !filePath.endsWith('.d.ts')) return filePath.slice(0, -3) + '.jsx';
  return null;
}

function getSuggestedFiles(el: HTMLElement): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  const fiber = getReactFiber(el);
  let node = fiber;
  const visited = new Set();
  while (node && files.length < 5) {
    if (visited.has(node)) break;
    visited.add(node);
    if ((typeof node.type === 'function' || typeof node.type === 'object') && node._debugSource?.fileName) {
      const name = node.type?.displayName || node.type?.name || node.type?.render?.displayName || node.type?.render?.name || null;
      if (name && !name.startsWith('_') && name !== 'Fragment') {
        let fp: string = node._debugSource.fileName;
        const srcIdx = fp.indexOf('/src/');
        if (srcIdx !== -1) fp = fp.slice(srcIdx + 1);
        else if (fp.startsWith('/')) fp = fp.slice(1);
        if (!seen.has(fp)) {
          seen.add(fp);
          files.push(fp);
        }
        const jsxAlt = getJsxAlternative(fp);
        if (jsxAlt && !seen.has(jsxAlt)) {
          seen.add(jsxAlt);
          files.push(jsxAlt);
        }
      }
    }
    node = node.return;
  }

  try {
    for (const sheet of Array.from(document.styleSheets)) {
      if (files.length >= 5) break;
      let href = '';
      try { href = sheet.href || (sheet.ownerNode as HTMLElement)?.getAttribute?.('data-vite-dev-id') || ''; } catch { /* cross-origin */ }
      if (!href) continue;
      let rules: CSSRuleList;
      try { rules = sheet.cssRules || sheet.rules; } catch { continue; }
      let matched = false;
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          try { if (el.matches(rule.selectorText)) { matched = true; break; } } catch { /* :has() etc */ }
        }
      }
      if (matched) {
        let src = href.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
        if (src.startsWith('/')) src = src.slice(1);
        if (src && !seen.has(src)) {
          seen.add(src);
          files.push(src);
        }
      }
    }
  } catch { /* safe fallback */ }

  return files;
}

function buildElementRef(el: HTMLElement, fullInfo: string): ElementReference {
  const fiber = getReactFiber(el);
  const comp = fiber ? findReactComponent(fiber) : null;
  const tag = el.tagName.toLowerCase();
  const jsPath = buildJsPath(el);
  const cssSelector = buildCssSelectorPath(el);
  const suggestedFiles = getSuggestedFiles(el);
  const displayLabel = comp?.name ? `<${comp.name}>` : `<${tag}${el.id ? `#${el.id}` : ''}>`;

  return { jsPath, cssSelector, suggestedFiles, componentName: comp?.name ?? null, tag, displayLabel, fullInfo };
}

function isPickerElement(el: Element): boolean {
  return !!(
    el.closest('[data-element-picker]') ||
    el.closest('[data-picker-overlay]') ||
    el.closest('[data-picker-controls]') ||
    el.closest('[data-plugin-panel]')
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'ahora mismo';
  if (diffMins < 60) return `hace ${diffMins}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 30) return `hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function BlameCard({ blame, loading, rect }: { blame: BlameData | null; loading: boolean; rect: DOMRect }) {
  const cardBelow = rect.bottom + 90 < window.innerHeight;
  const [imgError, setImgError] = useState(false);

  return (
    <div
      data-picker-controls
      style={{
        position: 'fixed',
        zIndex: 100003,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
        top: cardBelow ? rect.bottom + 10 : rect.top - 90,
        transition: 'opacity 150ms ease-out',
      }}
    >
      <div style={{
        background: 'linear-gradient(135deg, #0c0a15 0%, #1a1028 100%)',
        border: '1px solid #7c3aed',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(124,58,237,0.3), 0 0 0 1px rgba(124,58,237,0.1)',
        minWidth: 240,
        maxWidth: 320,
        backdropFilter: 'blur(16px)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <Loader2 style={{ width: 14, height: 14, color: '#a78bfa', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#a1a1aa' }}>Buscando autor...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : blame ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid #7c3aed',
              flexShrink: 0,
              background: '#27272a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {blame.avatarUrl && !imgError ? (
                <img
                  src={blame.avatarUrl}
                  alt={blame.author}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <User style={{ width: 18, height: 18, color: '#71717a' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>
                  {blame.author}
                </span>
                {blame.githubUser && (
                  <span style={{
                    fontSize: 9,
                    color: '#a78bfa',
                    background: 'rgba(124,58,237,0.2)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontFamily: 'monospace',
                  }}>
                    @{blame.githubUser}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <GitCommitHorizontal style={{ width: 10, height: 10, color: '#71717a', flexShrink: 0 }} />
                <span style={{
                  fontSize: 10,
                  color: '#a1a1aa',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {blame.summary || blame.commitHash?.slice(0, 8)}
                </span>
              </div>
              {blame.date && (
                <div style={{ fontSize: 9, color: '#71717a', marginTop: 2 }}>
                  {formatRelativeDate(blame.date)}
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    {new Date(blame.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <GitCommitHorizontal style={{ width: 14, height: 14, color: '#71717a' }} />
            <span style={{ fontSize: 11, color: '#71717a' }}>Sin info de git disponible</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ElementPicker({ active, onPick, onCancel }: Props) {
  const { t } = usePluginSettings();
  const [highlight, setHighlight] = useState<HighlightData | null>(null);
  const [picked, setPicked] = useState<PickedState | null>(null);
  const [blame, setBlame] = useState<BlameData | null>(null);
  const [blameLoading, setBlameLoading] = useState(false);
  const hoveredRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveTarget = useCallback((e: MouseEvent): HTMLElement | null => {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    return (
      (stack.find(
        (el) =>
          el instanceof HTMLElement &&
          !isPickerElement(el) &&
          el.tagName !== 'HTML' &&
          el.tagName !== 'BODY',
      ) as HTMLElement | null) ?? null
    );
  }, []);

  const handleMove = useCallback(
    (e: MouseEvent) => {
      if (picked) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const target = resolveTarget(e);
        if (!target || target === hoveredRef.current) return;
        hoveredRef.current = target;

        const rect = target.getBoundingClientRect();
        const tag = target.tagName.toLowerCase();
        const fiber = getReactFiber(target);
        const comp = fiber ? findReactComponent(fiber) : null;
        const classes =
          target.className && typeof target.className === 'string'
            ? target.className
                .split(/\s+/)
                .filter((c) => c && !c.startsWith('__'))
                .slice(0, 4)
                .join(' ')
            : '';

        setHighlight({
          rect,
          label: comp?.name ? `<${comp.name}>` : `<${tag}>`,
          tag,
          componentName: comp?.name ?? null,
          classes,
        });
      });
    },
    [resolveTarget, picked],
  );

  const finishPick = useCallback((picked: PickedState) => {
    const ref = buildElementRef(picked.el, picked.info);
    setPicked(null);
    setBlame(null);
    setBlameLoading(false);
    setHighlight(null);
    hoveredRef.current = null;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    onPick(ref);
  }, [onPick]);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const clicked = e.target as Element;
      if (clicked.closest('[data-picker-controls]')) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (picked) {
        finishPick(picked);
        return;
      }

      const real = resolveTarget(e) || hoveredRef.current;
      if (!real) return;

      hoveredRef.current = real;
      const { text, sourceFile, sourceLine } = buildElementInfo(real);
      const rect = real.getBoundingClientRect();
      const ref = buildElementRef(real, text);

      setPicked({ el: real, info: text, ref, rect, sourceFile, sourceLine });

      if (sourceFile && sourceLine) {
        setBlameLoading(true);
        agentApi.gitBlame(sourceFile, sourceLine)
          .then((data) => {
            setBlame(data);
            setBlameLoading(false);
            const enriched = buildElementInfo(real, data);
            const enrichedPicked: PickedState = { el: real, info: enriched.text, ref: buildElementRef(real, enriched.text), rect, sourceFile, sourceLine };
            setPicked(enrichedPicked);
            dismissTimerRef.current = setTimeout(() => {
              finishPick(enrichedPicked);
            }, 3500);
          })
          .catch(() => {
            setBlameLoading(false);
            setBlame(null);
            const currentPicked: PickedState = { el: real, info: text, ref, rect, sourceFile, sourceLine };
            dismissTimerRef.current = setTimeout(() => {
              finishPick(currentPicked);
            }, 2000);
          });
      } else {
        const currentPicked: PickedState = { el: real, info: text, ref, rect, sourceFile, sourceLine };
        dismissTimerRef.current = setTimeout(() => {
          finishPick(currentPicked);
        }, 2000);
      }
    },
    [resolveTarget, picked, finishPick],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (picked) {
          if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
          finishPick(picked);
        } else {
          onCancel();
        }
      }
    },
    [onCancel, picked, finishPick],
  );

  useEffect(() => {
    const pluginPanel = document.querySelector<HTMLElement>('[data-plugin-panel]');

    if (!active) {
      setHighlight(null);
      setPicked(null);
      setBlame(null);
      setBlameLoading(false);
      hoveredRef.current = null;
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (pluginPanel) {
        pluginPanel.style.opacity = '';
        pluginPanel.style.pointerEvents = '';
        pluginPanel.style.transition = '';
      }
      return;
    }

    if (pluginPanel) {
      pluginPanel.style.transition = 'opacity 200ms ease-out';
      pluginPanel.style.opacity = '0.08';
      pluginPanel.style.pointerEvents = 'none';
    }

    document.body.style.cursor = picked ? 'default' : 'crosshair';
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      document.body.style.cursor = '';
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('keydown', handleKey, true);
      if (pluginPanel) {
        pluginPanel.style.opacity = '';
        pluginPanel.style.pointerEvents = '';
        pluginPanel.style.transition = '';
      }
    };
  }, [active, handleMove, handleClick, handleKey, picked]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!active) return null;

  const r = picked ? picked.rect : highlight?.rect;
  const labelTop = r && r.top > 32;

  return createPortal(
    <div data-element-picker>
      {r ? (
        <div className="fixed inset-0 pointer-events-none" style={{ clipPath: `polygon(
          0% 0%, 100% 0%, 100% 100%, 0% 100%,
          0% ${r.top}px,
          ${r.left}px ${r.top}px,
          ${r.left}px ${r.bottom}px,
          ${r.right}px ${r.bottom}px,
          ${r.right}px ${r.top}px,
          0% ${r.top}px
        )`, background: 'rgba(0,0,0,0.15)', zIndex: 99999 }} />
      ) : (
        <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.08)', zIndex: 99999 }} />
      )}

      {r && (
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            zIndex: 100000,
            top: r.top - 2,
            left: r.left - 2,
            width: r.width + 4,
            height: r.height + 4,
            border: picked ? '2.5px solid #22c55e' : '2.5px solid #8b5cf6',
            borderRadius: 4,
            boxShadow: picked
              ? '0 0 0 1px rgba(34,197,94,0.3), 0 0 20px rgba(34,197,94,0.25)'
              : '0 0 0 1px rgba(139,92,246,0.3), 0 0 20px rgba(139,92,246,0.25)',
            transition: 'top 60ms ease-out, left 60ms ease-out, width 60ms ease-out, height 60ms ease-out, border-color 200ms',
          }}
        />
      )}

      {/* Label tooltip (only when hovering, not when picked) */}
      {!picked && r && highlight && (
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            zIndex: 100001,
            left: Math.max(4, r.left),
            top: labelTop ? r.top - 30 : r.bottom + 6,
            transition: 'top 60ms ease-out, left 60ms ease-out',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#1e1033',
            border: '1px solid #7c3aed',
            borderRadius: 6,
            padding: '3px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            maxWidth: 360,
          }}>
            <span style={{ color: '#c4b5fd', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>
              {highlight.label}
            </span>
            {highlight.classes && (
              <span style={{ color: '#a1a1aa', fontSize: 9, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                .{highlight.classes.split(' ')[0]}
              </span>
            )}
            <span style={{
              background: '#7c3aed',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 3,
              padding: '1px 5px',
              letterSpacing: 0.3,
            }}>
              {Math.round(r.width)}×{Math.round(r.height)}
            </span>
          </div>
        </div>
      )}

      {/* Blame card (after picking) */}
      {picked && r && (
        <BlameCard blame={blame} loading={blameLoading} rect={r} />
      )}

      <div
        data-picker-overlay
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99998,
          pointerEvents: 'none',
        }}
      />

      {/* Top instruction bar */}
      <div
        data-picker-controls
        style={{
          position: 'fixed',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100002,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: picked ? 'rgba(5,46,22,0.96)' : 'rgba(9,9,11,0.96)',
          border: picked ? '1px solid #22c55e' : '1px solid #3f3f46',
          borderRadius: 14,
          padding: '8px 18px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(12px)',
          transition: 'background 200ms, border-color 200ms',
        }}
      >
        {picked ? (
          <>
            <GitCommitHorizontal style={{ width: 16, height: 16, color: '#4ade80' }} />
            <span style={{ fontSize: 13, color: '#bbf7d0', fontWeight: 500 }}>
              Elemento seleccionado
            </span>
            <span style={{
              fontSize: 10,
              color: '#86efac',
              background: 'rgba(34,197,94,0.2)',
              borderRadius: 4,
              padding: '2px 6px',
              fontFamily: 'monospace',
            }}>
              clic para continuar
            </span>
          </>
        ) : (
          <>
            <MousePointerClick style={{ width: 16, height: 16, color: '#a78bfa' }} />
            <span style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 500 }}>
              {t('selectAnElement')}
            </span>
            <span style={{
              fontSize: 10,
              color: '#71717a',
              background: '#27272a',
              borderRadius: 4,
              padding: '2px 6px',
              fontFamily: 'monospace',
            }}>
              ESC
            </span>
          </>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (picked) {
              if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
              finishPick(picked);
            } else {
              onCancel();
            }
          }}
          style={{
            marginLeft: 4,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: '1px solid #3f3f46',
            background: '#27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a1a1aa',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = '#3f3f46';
            (e.target as HTMLElement).style.color = '#e4e4e7';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = '#27272a';
            (e.target as HTMLElement).style.color = '#a1a1aa';
          }}
        >
          <X style={{ width: 12, height: 12 }} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
