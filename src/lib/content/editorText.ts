import type { EditorBlock, EditorData } from '@/types/content';

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
      .flat()
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
