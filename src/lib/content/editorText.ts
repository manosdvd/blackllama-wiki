import type { EditorBlock, EditorData } from '@/types/content';

const MAX_FIRESTORE_EDITOR_BYTES = 800_000;

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function rowCells(row: unknown): unknown[] {
  if (Array.isArray(row)) return row;
  if (row && typeof row === 'object') {
    const maybeRow = row as { cells?: unknown; values?: unknown };
    if (Array.isArray(maybeRow.cells)) return maybeRow.cells;
    if (Array.isArray(maybeRow.values)) return maybeRow.values;
  }
  return [];
}

function blockToText(block: EditorBlock): string {
  const data = block.data ?? {};

  if (typeof data.text === 'string') return stripHtml(data.text);
  if (typeof data.caption === 'string') return stripHtml(data.caption);
  if (typeof data.message === 'string') return stripHtml(data.message);
  if (typeof data.code === 'string') return data.code.trim();

  if (Array.isArray(data.items)) {
    return data.items
      .map((item) => {
        if (typeof item === 'string') return stripHtml(item);
        if (item && typeof item === 'object' && 'content' in item && typeof item.content === 'string') {
          return stripHtml(item.content);
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  if (Array.isArray(data.content)) {
    return data.content
      .flatMap(rowCells)
      .filter((cell): cell is string => typeof cell === 'string')
      .map(stripHtml)
      .join(' ');
  }

  return '';
}

export function extractEditorPlainText(data?: EditorData | null) {
  if (!data?.blocks?.length) return '';
  return data.blocks.map(blockToText).filter(Boolean).join('\n').trim();
}

function sanitizeEditorValue(value: unknown, insideArray = false): unknown {
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return null;

  if (Array.isArray(value)) {
    const sanitized = value.map((item) => sanitizeEditorValue(item, true));
    return insideArray ? { values: sanitized } : sanitized;
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (!key || nestedValue === undefined || typeof nestedValue === 'function' || typeof nestedValue === 'symbol') continue;
      sanitized[key] = sanitizeEditorValue(nestedValue, false);
    }
    return sanitized;
  }

  return null;
}

export function sanitizeEditorData(data?: EditorData | null): EditorData {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];

  return {
    time: typeof data?.time === 'number' && Number.isFinite(data.time) ? data.time : Date.now(),
    version: typeof data?.version === 'string' ? data.version : 'custom-wysiwyg',
    blocks: blocks
      .map((block): EditorBlock | null => {
        if (!block || typeof block !== 'object') return null;
        const type = typeof block.type === 'string' ? block.type : '';
        if (!type) return null;

        const sanitizedBlock: EditorBlock = {
          type,
          data: sanitizeEditorValue(block.data ?? {}, false) as Record<string, unknown>,
        };
        if (typeof block.id === 'string' && block.id.trim()) sanitizedBlock.id = block.id;
        return sanitizedBlock;
      })
      .filter((block): block is EditorBlock => Boolean(block)),
  };
}

export function editorDataByteSize(data: EditorData) {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

export function getEditorDataFirestoreError(data: EditorData) {
  const bytes = editorDataByteSize(data);
  if (bytes > MAX_FIRESTORE_EDITOR_BYTES) {
    return `Article body is too large to save (${Math.ceil(bytes / 1024)} KB). Resize or remove embedded images before publishing.`;
  }
  return null;
}

export function assertEditorDataFitsFirestore(data: EditorData) {
  const error = getEditorDataFirestoreError(data);
  if (error) throw new Error(error);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function findWikiLinks(text: string) {
  const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
  return [...matches]
    .map((match) => {
      const parts = match[1].split('|');
      return parts[0].trim();
    })
    .filter(Boolean);
}
