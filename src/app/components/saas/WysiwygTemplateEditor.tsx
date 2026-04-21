import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useMemo, useEffect, useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Eye, FileCode2, Undo2, Redo2,
  ChevronDown,
} from 'lucide-react';
import { buildTemplatePreview, type DocumentTemplateVariable } from '../../lib/documentTemplates';

interface WysiwygTemplateEditorProps {
  value: string;
  onChange: (html: string) => void;
  variables: DocumentTemplateVariable[];
}

// ─── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors disabled:opacity-30 ${
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

// ─── Variable chip ─────────────────────────────────────────────────────────────

function VariableChip({
  variable, onInsert,
}: {
  variable: DocumentTemplateVariable;
  onInsert: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onInsert(variable.key)}
      title={variable.description}
      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100 whitespace-nowrap"
    >
      <span className="font-mono">{variable.key}</span>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function WysiwygTemplateEditor({ value, onChange, variables }: WysiwygTemplateEditorProps) {
  const [mode, setMode] = useState<'wysiwyg' | 'html' | 'preview'>('wysiwyg');
  const [rawHtml, setRawHtml] = useState(value);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const groupedVariables = useMemo(() => {
    return variables.reduce<Record<string, DocumentTemplateVariable[]>>((acc, v) => {
      if (!acc[v.category]) acc[v.category] = [];
      acc[v.category].push(v);
      return acc;
    }, {});
  }, [variables]);

  const previewHtml = useMemo(() => buildTemplatePreview(value), [value]);

  // ── TipTap editor ──────────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Escribe aquí el contenido del documento…' }),
    ],
    content: value,
    onUpdate({ editor: e }) {
      const html = e.getHTML();
      onChange(html);
      setRawHtml(html);
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[300px] prose prose-sm max-w-none text-gray-900 dark:text-gray-100 px-5 py-4',
      },
    },
  });

  // Sync external value changes into editor (e.g. when loading a saved template)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (value !== currentHtml) {
      editor.commands.setContent(value, false);
      setRawHtml(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Sync when switching to HTML mode
  useEffect(() => {
    if (mode === 'html') setRawHtml(value);
  }, [mode, value]);

  // ── Insert variable into editor ────────────────────────────────────────────

  const insertVariable = (key: string) => {
    if (mode === 'wysiwyg' && editor) {
      editor.chain().focus().insertContent(key).run();
    } else if (mode === 'html') {
      const textarea = document.getElementById('template-html-textarea') as HTMLTextAreaElement | null;
      if (textarea) {
        const start = textarea.selectionStart ?? rawHtml.length;
        const end = textarea.selectionEnd ?? rawHtml.length;
        const next = `${rawHtml.slice(0, start)}${key}${rawHtml.slice(end)}`;
        setRawHtml(next);
        onChange(next);
        requestAnimationFrame(() => {
          textarea.focus();
          const pos = start + key.length;
          textarea.setSelectionRange(pos, pos);
        });
      } else {
        const next = rawHtml + key;
        setRawHtml(next);
        onChange(next);
      }
    }
  };

  // ── Apply raw HTML to editor ───────────────────────────────────────────────

  const applyRawHtml = () => {
    if (editor) {
      editor.commands.setContent(rawHtml, false);
    }
    onChange(rawHtml);
    setMode('wysiwyg');
  };

  if (!editor) return null;

  return (
    <div className="space-y-3">

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Editor de contenido</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Formatea el documento e inserta variables dinámicas con <code className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{…}}'}</code>.
          </p>
        </div>

        {/* Mode switch */}
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-1 gap-0.5">
          {([
            { id: 'wysiwyg', label: 'Diseño', icon: <UnderlineIcon className="w-3.5 h-3.5" /> },
            { id: 'html',    label: 'HTML',   icon: <FileCode2 className="w-3.5 h-3.5" /> },
            { id: 'preview', label: 'Vista previa', icon: <Eye className="w-3.5 h-3.5" /> },
          ] as const).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === m.id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-900/30' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Variables panel ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
          Variables disponibles — clic para insertar
        </p>
        <div className="space-y-2">
          {Object.entries(groupedVariables).map(([cat, vars]) => {
            const isOpen = expandedCategory === cat;
            return (
              <div key={cat} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedCategory(isOpen ? null : cat)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span>{cat}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800">
                    {vars.map((v) => (
                      <VariableChip key={v.key} variable={v} onInsert={insertVariable} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── WYSIWYG view ───────────────────────────────────────────────────── */}
      {mode === 'wysiwyg' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            {/* Undo / Redo */}
            <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
              <Undo2 className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
              <Redo2 className="w-3.5 h-3.5" />
            </ToolbarBtn>

            <ToolbarDivider />

            {/* Headings */}
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              active={editor.isActive('heading', { level: 1 })}
              title="Título 1"
            >
              <Heading1 className="w-4 h-4" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive('heading', { level: 2 })}
              title="Título 2"
            >
              <Heading2 className="w-4 h-4" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor.isActive('heading', { level: 3 })}
              title="Título 3"
            >
              <Heading3 className="w-4 h-4" />
            </ToolbarBtn>

            <ToolbarDivider />

            {/* Inline formatting */}
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')}
              title="Negrita"
            >
              <Bold className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')}
              title="Cursiva"
            >
              <Italic className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive('underline')}
              title="Subrayado"
            >
              <UnderlineIcon className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={editor.isActive('strike')}
              title="Tachado"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </ToolbarBtn>

            <ToolbarDivider />

            {/* Lists */}
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')}
              title="Lista sin orden"
            >
              <List className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')}
              title="Lista numerada"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </ToolbarBtn>

            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarBtn
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              active={editor.isActive({ textAlign: 'left' })}
              title="Alinear izquierda"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              active={editor.isActive({ textAlign: 'center' })}
              title="Centrar"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              active={editor.isActive({ textAlign: 'right' })}
              title="Alinear derecha"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </div>

          {/* Editor area */}
          <EditorContent editor={editor} />
        </div>
      )}

      {/* ── HTML view ──────────────────────────────────────────────────────── */}
      {mode === 'html' && (
        <div className="space-y-2">
          <textarea
            id="template-html-textarea"
            value={rawHtml}
            onChange={(e) => setRawHtml(e.target.value)}
            className="min-h-[320px] w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 font-mono text-sm leading-6 text-gray-900 dark:text-gray-100 outline-none transition-colors focus:border-blue-500 resize-y"
            placeholder="<section>...</section>"
            spellCheck={false}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={applyRawHtml}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-black"
            >
              <Eye className="w-3.5 h-3.5" />
              Aplicar y volver al diseño
            </button>
          </div>
        </div>
      )}

      {/* ── Preview view ───────────────────────────────────────────────────── */}
      {mode === 'preview' && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <Eye className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vista previa con datos de ejemplo</span>
          </div>
          <div className="p-6">
            <div
              className="prose prose-sm max-w-none text-gray-900 dark:text-gray-100"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
