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
import { Loader2, Bold, Italic, Underline, Link2, ImagePlus, List, ListOrdered, Heading1, Heading2, Code, Undo2, Redo2 } from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Height of the editor in pixels (default 420). */
  height?: number;
};

const TOKENS = [
  { label: "First name", token: "{{firstName}}" },
  { label: "Name (alias)", token: "{{name}}" },
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

export function RichTextEmailEditor({ value, onChange, height = 420 }: Props) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showSource, setShowSource] = React.useState(false);
  const [sourceDraft, setSourceDraft] = React.useState(value);
  const [uploading, setUploading] = React.useState(false);
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const lastSyncedRef = React.useRef<string>(value);

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-50 p-1.5">
        <Btn title="Bold" onClick={() => exec("bold")}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Italic" onClick={() => exec("italic")}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Underline" onClick={() => exec("underline")}><Underline className="h-4 w-4" /></Btn>
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
            onClick={() => setTokenOpen((v) => !v)}
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

      {/* Editor / Source area */}
      {showSource ? (
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
          contentEditable
          onInput={handleInput}
          onBlur={handleInput}
          suppressContentEditableWarning
          style={{ height, minHeight: 280 }}
          className="w-full overflow-y-auto rounded-b bg-white p-4 text-sm leading-relaxed text-neutral-800 focus:outline-none [&_a]:text-[#FF005A] [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6"
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
