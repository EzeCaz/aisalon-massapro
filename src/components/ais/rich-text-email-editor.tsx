"use client";

/**
 * RichTextEmailEditor — a lightweight WYSIWYG editor for email template HTML.
 *
 * Uses a contentEditable div + document.execCommand for formatting. No
 * external dependencies (TipTap/ProseMirror/Slate would each add ~50KB to
 * the admin bundle and a long list of peer deps). The browser's built-in
 * rich-text editing is more than enough for email authoring — paragraphs,
 * bold/italic/underline, H1/H2, links, images, lists.
 *
 * Output: HTML string (set on the parent's htmlBody state). Input: HTML
 * string (used to initialize the contentEditable on mount).
 *
 * Image insert: opens a file picker, uploads to /api/email-templates/upload-image,
 * and inserts an <img> at the cursor position with the returned URL.
 *
 * Token insert: a dropdown of {{eventTitle}}, {{firstName}}, etc. that
 * inserts the token text at the cursor (the underlying htmlBody keeps the
 * raw {{...}} form — the worker replaces them at send time).
 *
 * HTML mode toggle: a "Source" button reveals a <textarea> with the raw HTML
 * for power users who want to hand-edit. Switching back re-renders the
 * contentEditable.
 */

import * as React from "react";
import {
  Loader2,
  Bold,
  Italic,
  Underline,
  Link2,
  ImagePlus,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Code,
  Undo2,
  Redo2,
  Paintbrush,
  ClipboardPaste,
  Palette,
  Type,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Height of the editor in pixels (default 420). */
  height?: number;
  /** TSK-0074: when true, the editor is read-only (no toolbar, content not editable).
   *  Used for SENT / SENDING campaigns where the snapshot is frozen. */
  readOnly?: boolean;
};

const TOKENS = [
  { label: "First name", token: "{{firstName}}" },
  { label: "Name (alias)", token: "{{name}}" },
  { label: "Chapter name", token: "{{chapterName}}" },
  { label: "Event title", token: "{{eventTitle}}" },
  { label: "Event date", token: "{{eventDate}}" },
  { label: "Venue", token: "{{eventVenue}}" },
  { label: "Address", token: "{{eventAddress}}" },
  { label: "Event URL", token: "{{eventUrl}}" },
  { label: "My check-in code URL", token: "{{myCodeUrl}}" },
  { label: "Check-in code", token: "{{checkInCode}}" },
  { label: "Speakers", token: "{{speakers}}" },
  { label: "Agenda", token: "{{agenda}}" },
];

/** Email-safe font families. Values are CSS font-family stacks that render
 *  consistently across Gmail / Outlook / Apple Mail. */
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Default (sans)", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Garamond", value: "Garamond, 'Times New Roman', serif" },
  { label: "Palatino", value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
];

/** Common font sizes in pixels. */
const FONT_SIZES: { label: string; value: number }[] = [
  { label: "10 px", value: 10 },
  { label: "11 px", value: 11 },
  { label: "12 px", value: 12 },
  { label: "13 px", value: 13 },
  { label: "14 px", value: 14 },
  { label: "15 px", value: 15 },
  { label: "16 px", value: 16 },
  { label: "18 px", value: 18 },
  { label: "20 px", value: 20 },
  { label: "22 px", value: 22 },
  { label: "24 px", value: 24 },
  { label: "28 px", value: 28 },
  { label: "32 px", value: 32 },
  { label: "36 px", value: 36 },
  { label: "40 px", value: 40 },
  { label: "48 px", value: 48 },
];

/** Style payload captured by the "Copy style" button — a minimal set of
 *  inline-style properties that fully determine the typographic look of a
 *  run of text inside an email. */
type CopiedStyle = {
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
};

export function RichTextEmailEditor({ value, onChange, height = 420, readOnly = false }: Props) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showSource, setShowSource] = React.useState(false);
  const [sourceDraft, setSourceDraft] = React.useState(value);
  const [uploading, setUploading] = React.useState(false);
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const lastSyncedRef = React.useRef<string>(value);

  // Style-clipboard state — populated by "Copy style" and consumed by "Paste style".
  // Kept in a ref (not state) so it survives re-renders without re-rendering the
  // toolbar on every change. The `copiedAt` state below is only used to toggle
  // the button's visual "has copied style" indicator.
  const copiedStyleRef = React.useRef<CopiedStyle | null>(null);
  const [hasCopiedStyle, setHasCopiedStyle] = React.useState(false);
  const [fontFamilyOpen, setFontFamilyOpen] = React.useState(false);
  const [fontSizeOpen, setFontSizeOpen] = React.useState(false);
  const textColorRef = React.useRef<HTMLInputElement>(null);

  // Initialize the contentEditable on mount + whenever we switch back from
  // source mode. We DON'T re-init on every `value` change — that would
  // clobber the cursor. Instead, the contentEditable is the source of truth
  // while editing; the parent's `value` only seeds it once.
  React.useEffect(() => {
    if (showSource) {
      setSourceDraft(editorRef.current?.innerHTML ?? value);
      return;
    }
    // Switching back from source → reload contentEditable from the draft.
    if (editorRef.current && showSource === false) {
      // Only re-init if the source draft differs from what's in the editor
      // (avoids cursor jump on every re-render).
      if (lastSyncedRef.current !== sourceDraft) {
        editorRef.current.innerHTML = sourceDraft;
        lastSyncedRef.current = sourceDraft;
        onChange(sourceDraft);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSource]);

  // Initial seed on mount.
  React.useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value;
      lastSyncedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    handleInput();
  };

  const handleInput = () => {
    const html = editorRef.current?.innerHTML ?? "";
    lastSyncedRef.current = html;
    onChange(html);
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    // execCommand insertHTML is deprecated but still works in all browsers.
    // Fallback: build a Range and insert.
    try {
      document.execCommand("insertHTML", false, html);
    } catch {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const fragment = range.createContextualFragment(html);
        range.insertNode(fragment);
      }
    }
    handleInput();
  };

  const handleTokenSelect = (token: string) => {
    // Insert the token as plain text (escaping < > so the browser doesn't
    // try to parse {{eventTitle}} as an HTML tag).
    const span = `<span style="background:#FFF1F5;color:#FF005A;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px;font-weight:600;">${token}</span>&nbsp;`;
    insertHtml(span);
    setTokenOpen(false);
  };

  /** Apply a CSS style object to the current selection by wrapping the selected
   *  text in a <span style="...">. If the selection is collapsed (cursor only),
   *  no-op — the user must actually select some text first. After applying, the
   *  selection is restored to cover the newly-wrapped span so subsequent style
   *  operations compose on the same text. */
  const wrapSelectionWithStyle = (styleObj: Record<string, string>) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return;
    }
    const range = sel.getRangeAt(0);
    // Only wrap if the selection is inside our editor — avoids accidentally
    // mutating text in some other contentEditable on the page.
    if (!editor.contains(range.commonAncestorContainer)) return;
    const span = document.createElement("span");
    Object.entries(styleObj).forEach(([k, v]) => {
      span.style.setProperty(k, v);
    });
    span.appendChild(range.extractContents());
    range.insertNode(span);
    // Re-select the wrapped content so the user can immediately apply another
    // style (e.g. font family then font color) without re-selecting.
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
    handleInput();
  };

  const handleFontFamily = (fontValue: string) => {
    // execCommand('fontName') wraps the selection in <font face="..."> which is
    // well-supported across browsers and renders correctly in email clients.
    exec("fontName", fontValue);
    setFontFamilyOpen(false);
  };

  const handleFontSize = (px: number) => {
    // execCommand('fontSize') only accepts 1-7 (legacy HTML sizes). To get
    // exact pixel sizes we use the wrapSelectionWithStyle helper instead —
    // it produces clean <span style="font-size:Npx"> markup that email
    // clients understand.
    wrapSelectionWithStyle({ "font-size": `${px}px` });
    setFontSizeOpen(false);
  };

  const handleTextColor = (color: string) => {
    // execCommand('foreColor') is the most reliable cross-browser way to color
    // selected text. It produces <font color="..."> or <span style="color:...">
    // depending on the browser; both render correctly in email clients.
    exec("foreColor", color);
  };

  /** Read the typographic style of the element at the current selection start
   *  and stash it in copiedStyleRef for later "Paste style" use. We use
   *  getComputedStyle on the selection's container element so we capture the
   *  *effective* style (inherited + inline) — exactly what the user sees. */
  const handleCopyStyle = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      window.alert("Select some text first, then click Copy style.");
      return;
    }
    let node: Node | null = sel.getRangeAt(0).startContainer;
    // Walk up to the first Element (text nodes don't have getComputedStyle).
    while (node && node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentNode;
    }
    if (!node || !editor.contains(node)) {
      window.alert("Select some text inside the email body first.");
      return;
    }
    const el = node as HTMLElement;
    const cs = window.getComputedStyle(el);
    copiedStyleRef.current = {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      textDecoration: cs.textDecoration,
    };
    setHasCopiedStyle(true);
  };

  /** Apply the previously-copied style to the current selection. If nothing
   *  is copied yet, alerts the user. If the selection is collapsed, alerts
   *  the user to select target text first. */
  const handlePasteStyle = () => {
    const copied = copiedStyleRef.current;
    if (!copied) {
      window.alert("No style copied yet. Select text with the style you want, click Copy style, then select target text and click Paste style.");
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      window.alert("Select the target text first, then click Paste style.");
      return;
    }
    const styleObj: Record<string, string> = {};
    if (copied.fontFamily) styleObj["font-family"] = copied.fontFamily;
    if (copied.fontSize) styleObj["font-size"] = copied.fontSize;
    if (copied.color) styleObj["color"] = copied.color;
    if (copied.backgroundColor && copied.backgroundColor !== "rgba(0, 0, 0, 0)") {
      styleObj["background-color"] = copied.backgroundColor;
    }
    if (copied.fontWeight) styleObj["font-weight"] = copied.fontWeight;
    if (copied.fontStyle) styleObj["font-style"] = copied.fontStyle;
    if (copied.textDecoration) styleObj["text-decoration"] = copied.textDecoration;
    wrapSelectionWithStyle(styleObj);
  };

  const handleLink = async () => {
    const url = window.prompt("Enter URL (https://...)");
    if (!url) return;
    // Wrap selection in an <a>. If nothing is selected, insert the URL as text.
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      exec("createLink", url);
    } else {
      insertHtml(`<a href="${url}" style="color:#FF005A;text-decoration:underline;">${url}</a>&nbsp;`);
    }
  };

  const handleImagePick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-picking the same file
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/email-templates/upload-image", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Upload failed");
      }
      const { url } = await r.json();
      // Insert the image with a max-width to keep email layout sane.
      insertHtml(
        `<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;"/>`,
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const Btn = ({
    onClick,
    title,
    children,
    disabled,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded border border-neutral-200 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
    >
      {children}
    </button>
  );

  return (
    <div className="rounded border border-neutral-300">
      {/* Toolbar — hidden when readOnly */}
      {!readOnly && (
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-50 p-1.5">
        <Btn title="Bold" onClick={() => exec("bold")}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Italic" onClick={() => exec("italic")}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Underline" onClick={() => exec("underline")}><Underline className="h-4 w-4" /></Btn>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        {/* Font family picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setFontFamilyOpen((v) => !v); setFontSizeOpen(false); setTokenOpen(false); }}
            className="inline-flex h-8 items-center gap-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            title="Font family"
          >
            <Type className="h-3.5 w-3.5" />
            Font ▾
          </button>
          {fontFamilyOpen && (
            <div className="absolute left-0 top-9 z-50 w-56 rounded border border-neutral-200 bg-white py-1 shadow-lg">
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => handleFontFamily(f.value)}
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50"
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Font size picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setFontSizeOpen((v) => !v); setFontFamilyOpen(false); setTokenOpen(false); }}
            className="inline-flex h-8 items-center gap-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            title="Font size"
          >
            Size ▾
          </button>
          {fontSizeOpen && (
            <div className="absolute left-0 top-9 z-50 w-32 rounded border border-neutral-200 bg-white py-1 shadow-lg">
              {FONT_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleFontSize(s.value)}
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50"
                  style={{ fontSize: `${s.value}px` }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Text color picker — clicking the swatch opens the native color input */}
        <button
          type="button"
          title="Text color"
          onClick={() => textColorRef.current?.click()}
          className="inline-flex h-8 items-center gap-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          <Palette className="h-3.5 w-3.5" />
          Color
        </button>
        <input
          ref={textColorRef}
          type="color"
          onChange={(e) => handleTextColor(e.target.value)}
          className="hidden"
          // value is intentionally uncontrolled — each click resets the picker
        />
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        {/* Copy / Paste style — paste-applies the last copied style to the current selection */}
        <button
          type="button"
          title="Copy style of selected text"
          onClick={handleCopyStyle}
          className={`inline-flex h-8 items-center gap-1 rounded border px-2 text-xs font-semibold ${hasCopiedStyle ? "border-pink-300 bg-pink-50 text-pink-700" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"}`}
        >
          <Paintbrush className="h-3.5 w-3.5" />
          Copy style
        </button>
        <button
          type="button"
          title="Paste copied style to selected text"
          onClick={handlePasteStyle}
          disabled={!hasCopiedStyle}
          className="inline-flex h-8 items-center gap-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste style
        </button>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        <Btn title="Heading 1" onClick={() => exec("formatBlock", "<h1>")}><Heading1 className="h-4 w-4" /></Btn>
        <Btn title="Heading 2" onClick={() => exec("formatBlock", "<h2>")}><Heading2 className="h-4 w-4" /></Btn>
        <Btn title="Paragraph" onClick={() => exec("formatBlock", "<p>")}><Code className="h-4 w-4" /></Btn>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        <Btn title="Bulleted list" onClick={() => exec("insertUnorderedList")}><List className="h-4 w-4" /></Btn>
        <Btn title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-4 w-4" /></Btn>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        <Btn title="Insert link" onClick={handleLink}><Link2 className="h-4 w-4" /></Btn>
        <Btn title="Insert image" onClick={handleImagePick} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </Btn>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        {/* Token dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setTokenOpen((v) => !v); setFontFamilyOpen(false); setFontSizeOpen(false); }}
            className="inline-flex h-8 items-center gap-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            Insert token ▾
          </button>
          {tokenOpen && (
            <div className="absolute left-0 top-9 z-50 w-48 rounded border border-neutral-200 bg-white py-1 shadow-lg">
              {TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => handleTokenSelect(t.token)}
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-50"
                >
                  <span className="font-semibold">{t.label}</span>
                  <code className="ml-2 text-[10px] text-neutral-500">{t.token}</code>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mx-1 h-5 w-px bg-neutral-300" />
        <Btn title="Undo" onClick={() => exec("undo")}><Undo2 className="h-4 w-4" /></Btn>
        <Btn title="Redo" onClick={() => exec("redo")}><Redo2 className="h-4 w-4" /></Btn>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="inline-flex h-8 items-center gap-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          {showSource ? "Visual" : "Source"}
        </button>
      </div>
      )}

      {/* Editor / Source area */}
      {showSource && !readOnly ? (
        <textarea
          value={sourceDraft}
          onChange={(e) => setSourceDraft(e.target.value)}
          style={{ height }}
          className="w-full resize-y rounded-b border-0 p-3 font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable={!readOnly}
          onInput={handleInput}
          onBlur={handleInput}
          suppressContentEditableWarning
          style={{ height, minHeight: 280 }}
          className={`w-full overflow-y-auto rounded-b bg-white p-4 text-sm leading-relaxed text-neutral-800 focus:outline-none [&_a]:text-[#FF005A] [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6${readOnly ? " cursor-default" : ""}`}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
}
