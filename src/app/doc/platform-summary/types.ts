export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string | null;
};

export type Block = {
  type: "para" | "heading" | "table" | "pagebreak";
  text?: string;
  level?: number;
  runs?: Run[];
  align?: string;
  rows?: string[][];
};

export type CodeFile = {
  name: string;
  path: string;
  language: string;
  lines: number;
  bytes: number;
};

export type DocStats = {
  title: string;
  file: string;
  sizeBytes: number;
  modified: string;
  wordCount: number;
  headings: number;
  tables: number;
  paragraphs: number;
};

export type Manifest = {
  stats: DocStats;
  pdf: string;
  pages: string[];
  code: CodeFile[];
  generatedAt: string;
};

export const ASSET_BASE = "/doc-viewer";
export const DOCX_NAME = "coma-platform-capabilities-and-goals.docx";
