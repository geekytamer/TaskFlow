'use client';

import * as React from 'react';
import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Braces, Columns3, Heading1, Heading2, Heading3, Italic,
  List, ListOrdered, Minus, Pilcrow, Plus, Redo2, Rows3, Strikethrough, Table2, Trash2, Underline, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { DocPageSetup, DocTheme, RichNode } from '@/modules/finance/doc/types';

/** What a field chip shows: its value once known, otherwise its name. */
export interface WriterFields {
  valueOf: (token: string) => string;
  labelOf: (token: string) => string;
  onFieldClick?: (token: string) => void;
}

const FieldsContext = React.createContext<WriterFields>({ valueOf: () => '', labelOf: (token) => token });

function TokenChip({ node, selected }: NodeViewProps) {
  const { valueOf, labelOf, onFieldClick } = React.useContext(FieldsContext);
  const token = String(node.attrs.token ?? '');
  const value = valueOf(token);
  const label = (node.attrs.label as string | null) || labelOf(token);
  return (
    <NodeViewWrapper
      as="span"
      data-token={token}
      title={label}
      onClick={() => onFieldClick?.(token)}
      className={cn(
        'mx-0.5 inline-block cursor-pointer rounded px-1 align-baseline leading-snug',
        value ? 'bg-amber-100/70 text-inherit' : 'border border-dashed border-sky-400 bg-sky-50 text-sky-700',
        selected && 'ring-2 ring-sky-500',
      )}
    >
      {value || label}
    </NodeViewWrapper>
  );
}

/** A field inside the text ({{client.name}}, {{field.fee}}): one piece the cursor steps over. */
const TokenNode = Node.create({
  name: 'token',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      token: { default: '' },
      label: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-token]', getAttrs: (el) => ({ token: (el as HTMLElement).dataset.token, label: (el as HTMLElement).dataset.label || null }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-token': node.attrs.token, ...(node.attrs.label ? { 'data-label': node.attrs.label } : {}) }), `{{${node.attrs.token}}}`];
  },
  renderText({ node }) {
    return `{{${node.attrs.token}}}`;
  },
  addInputRules() {
    // Typing {{field.fee}} turns into a field.
    return [nodeInputRule({ find: /\{\{\s*([\w.]+)\s*\}\}$/, type: this.type, getAttributes: (match) => ({ token: match[1] }) })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TokenChip, { as: 'span' });
  },
});

export interface FieldGroup { group: string; tokens: Array<{ token: string; label: string }> }

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn('h-8 w-8', active && 'bg-muted text-foreground')}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor, tr, fieldGroups, onNewField }: {
  editor: Editor;
  tr: (en: string, ar: string) => string;
  fieldGroups: FieldGroup[];
  onNewField: (name: string) => { token: string; label: string };
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      paragraph: e.isActive('paragraph'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }), justify: e.isActive({ textAlign: 'justify' }),
      table: e.isActive('table'),
      undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
  const [newName, setNewName] = React.useState('');
  const [newOpen, setNewOpen] = React.useState(false);
  const chain = () => editor.chain().focus();
  const insertToken = (token: string, label?: string) => chain().insertContent({ type: 'token', attrs: { token, label: label ?? null } }).insertContent(' ').run();
  const addField = () => {
    const name = newName.trim();
    if (!name) return;
    const field = onNewField(name);
    insertToken(field.token, field.label);
    setNewName('');
    setNewOpen(false);
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b bg-background/95 p-1 backdrop-blur" role="toolbar" aria-label={tr('Formatting', 'التنسيق')}>
      <ToolButton label={tr('Undo', 'تراجع')} disabled={!state.undo} onClick={() => chain().undo().run()}><Undo2 className="h-4 w-4 rtl:-scale-x-100" /></ToolButton>
      <ToolButton label={tr('Redo', 'إعادة')} disabled={!state.redo} onClick={() => chain().redo().run()}><Redo2 className="h-4 w-4 rtl:-scale-x-100" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={tr('Title', 'عنوان رئيسي')} active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Heading', 'عنوان')} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Clause heading', 'عنوان بند')} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Normal text', 'نص عادي')} active={state.paragraph} onClick={() => chain().setParagraph().run()}><Pilcrow className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={tr('Bold', 'عريض')} active={state.bold} onClick={() => chain().toggleBold().run()}><Bold className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Italic', 'مائل')} active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Underline', 'تسطير')} active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Strikethrough', 'يتوسطه خط')} active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={tr('Bulleted list', 'قائمة نقطية')} active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Numbered list', 'قائمة مرقمة')} active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={tr('Align right', 'محاذاة لليمين')} active={state.right} onClick={() => chain().setTextAlign('right').run()}><AlignRight className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Centre', 'توسيط')} active={state.center} onClick={() => chain().setTextAlign('center').run()}><AlignCenter className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Align left', 'محاذاة لليسار')} active={state.left} onClick={() => chain().setTextAlign('left').run()}><AlignLeft className="h-4 w-4" /></ToolButton>
      <ToolButton label={tr('Justify', 'ضبط')} active={state.justify} onClick={() => chain().setTextAlign('justify').run()}><AlignJustify className="h-4 w-4" /></ToolButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton label={tr('Line', 'خط فاصل')} onClick={() => chain().setHorizontalRule().run()}><Minus className="h-4 w-4" /></ToolButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', state.table && 'bg-muted')} aria-label={tr('Table', 'جدول')} title={tr('Table', 'جدول')}>
            <Table2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Plus className="me-2 h-4 w-4" />{tr('Insert table', 'إدراج جدول')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!state.table} onSelect={() => chain().addRowAfter().run()}><Rows3 className="me-2 h-4 w-4" />{tr('Add row', 'إضافة صف')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.table} onSelect={() => chain().addColumnAfter().run()}><Columns3 className="me-2 h-4 w-4" />{tr('Add column', 'إضافة عمود')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.table} onSelect={() => chain().deleteRow().run()}><Rows3 className="me-2 h-4 w-4" />{tr('Delete row', 'حذف الصف')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.table} onSelect={() => chain().deleteColumn().run()}><Columns3 className="me-2 h-4 w-4" />{tr('Delete column', 'حذف العمود')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.table} onSelect={() => chain().deleteTable().run()}><Trash2 className="me-2 h-4 w-4" />{tr('Delete table', 'حذف الجدول')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="mx-1 h-5 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8">
            <Braces className="me-1 h-4 w-4" />{tr('Insert field', 'إدراج حقل')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          {fieldGroups.map((group, index) => (
            <React.Fragment key={group.group}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{group.group}</DropdownMenuLabel>
              {group.tokens.map((item) => (
                <DropdownMenuItem key={item.token} onSelect={() => insertToken(item.token)}>{item.label}</DropdownMenuItem>
              ))}
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={newOpen} onOpenChange={setNewOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8"><Plus className="me-1 h-4 w-4" />{tr('New field', 'حقل جديد')}</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-2">
          <p className="text-sm font-medium">{tr('A box to fill in for this document', 'خانة تُملأ لهذا المستند')}</p>
          <Input
            dir="auto"
            autoFocus
            value={newName}
            placeholder={tr('e.g. Contract length', 'مثال: مدة العقد')}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addField(); } }}
          />
          <Button type="button" size="sm" className="w-full" disabled={!newName.trim()} onClick={addField}>{tr('Add to the text', 'أضف إلى النص')}</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const WRITER_CSS = `
.doc-writer .ProseMirror { outline: none; min-height: 100%; }
.doc-writer .ProseMirror p { margin: 0 0 8px; line-height: 1.7; }
.doc-writer .ProseMirror h1, .doc-writer .ProseMirror h2, .doc-writer .ProseMirror h3 { font-weight: 700; color: var(--doc-primary); line-height: 1.35; }
.doc-writer .ProseMirror h1 { font-size: 26px; margin: 0 0 10px; }
.doc-writer .ProseMirror h2 { font-size: 19px; margin: 14px 0 6px; }
.doc-writer .ProseMirror h3 { font-size: 15.5px; margin: 14px 0 6px; }
.doc-writer .ProseMirror ul { list-style: disc; padding-inline-start: 22px; margin: 0 0 8px; }
.doc-writer .ProseMirror ol { list-style: decimal; padding-inline-start: 22px; margin: 0 0 8px; }
.doc-writer .ProseMirror li p { margin: 0; }
.doc-writer .ProseMirror blockquote { padding-inline-start: 12px; border-inline-start: 3px solid var(--doc-primary); color: #475569; }
.doc-writer .ProseMirror hr { border: 0; border-top: 1px solid #cbd5e1; margin: 12px 0; }
.doc-writer .ProseMirror hr.ProseMirror-selectednode { border-top-color: #0ea5e9; }
.doc-writer .ProseMirror table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; table-layout: fixed; }
.doc-writer .ProseMirror td, .doc-writer .ProseMirror th { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; position: relative; }
.doc-writer .ProseMirror th { background: #f1f5f9; font-weight: 600; text-align: start; }
.doc-writer .ProseMirror .selectedCell::after { content: ''; position: absolute; inset: 0; background: rgba(14,165,233,.15); pointer-events: none; }
.doc-writer .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #94a3b8; float: inline-start; height: 0; pointer-events: none; }
`;

/**
 * A page you write on, like in Word: the document's wording with formatting,
 * lists and tables, and fields that fill themselves in.
 */
export function DocumentWriter({
  value,
  onChange,
  page,
  theme,
  direction,
  fields,
  fieldGroups,
  onNewField,
  tr,
}: {
  value: RichNode;
  onChange: (body: RichNode) => void;
  page: DocPageSetup;
  theme: DocTheme;
  direction: 'rtl' | 'ltr';
  fields: WriterFields;
  fieldGroups: FieldGroup[];
  onNewField: (name: string) => { token: string; label: string };
  tr: (en: string, ar: string) => string;
}) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, code: false, codeBlock: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      Placeholder.configure({ placeholder: tr('Start writing…', 'ابدأ الكتابة…') }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TokenNode,
    ],
    content: value,
    editorProps: { attributes: { dir: direction, 'aria-label': tr('Document text', 'نص المستند') } },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON() as RichNode),
  });

  const portrait = page.orientation === 'portrait';
  const width = page.size === 'A4' ? (portrait ? 210 : 297) : (portrait ? 216 : 279);
  const height = page.size === 'A4' ? (portrait ? 297 : 210) : (portrait ? 279 : 216);
  const m = page.margin;

  return (
    <FieldsContext.Provider value={fields}>
      <style>{WRITER_CSS}</style>
      <div className="rounded-lg border bg-muted/30">
        {editor && <Toolbar editor={editor} tr={tr} fieldGroups={fieldGroups} onNewField={onNewField} />}
        <div className="overflow-auto p-4">
          <div
            dir={direction}
            className="doc-writer mx-auto cursor-text bg-white text-slate-950 shadow-sm ring-1 ring-black/5"
            style={{
              width: `${width}mm`,
              maxWidth: '100%',
              minHeight: `${height}mm`,
              padding: `${m.top ?? 18}mm ${m.right ?? 18}mm ${m.bottom ?? 18}mm ${m.left ?? 18}mm`,
              fontFamily: theme.fontFamily,
              color: theme.textColor,
              fontSize: 14,
              ['--doc-primary' as string]: theme.primaryColor,
            }}
            onClick={(event) => { if (event.target === event.currentTarget) editor?.commands.focus('end'); }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </FieldsContext.Provider>
  );
}
