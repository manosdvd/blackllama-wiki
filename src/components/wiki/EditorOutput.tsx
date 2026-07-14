'use client';

import React from 'react';
import type { EditorBlock, EditorData } from '@/types/content';
import { slugify } from '@/lib/content/editorText';

// Keeps basic html intact while cleaning up spacing
function cleanText(value: unknown, preserveBreaks = false) {
  if (typeof value !== 'string') return '';
  if (!preserveBreaks) return value.replace(/\s+/g, ' ').trim();
  return value.trim();
}

function blockKey(block: EditorBlock, index: number) {
  return block.id ?? `${block.type}-${index}`;
}

function tableCells(row: unknown): unknown[] {
  if (Array.isArray(row)) return row;
  if (row && typeof row === 'object') {
    const maybeRow = row as { cells?: unknown; values?: unknown };
    if (Array.isArray(maybeRow.cells)) return maybeRow.cells;
    if (Array.isArray(maybeRow.values)) return maybeRow.values;
  }
  return [];
}

function nestedListItems(item: unknown): unknown[] {
  if (!item || typeof item !== 'object' || !('items' in item)) return [];
  return Array.isArray(item.items) ? item.items : [];
}

function nestedListStyle(item: unknown, fallback: 'ordered' | 'unordered'): 'ordered' | 'unordered' {
  if (!item || typeof item !== 'object') return fallback;
  const candidate = 'style' in item
    ? item.style
    : 'meta' in item && item.meta && typeof item.meta === 'object' && 'style' in item.meta
      ? item.meta.style
      : null;
  return candidate === 'ordered' ? 'ordered' : candidate === 'unordered' ? 'unordered' : fallback;
}

function parseMarkdownWikiLinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, display) => {
    const t = target.trim();
    const d = display ? display.trim() : t;
    const slug = slugify(t);
    return `[${d}](/wiki/article/${encodeURIComponent(slug)})`;
  });
}

function parseHtmlWikiLinks(html: string): string {
  let processed = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, display) => {
    const t = target.trim();
    const d = display ? display.trim() : t;
    const slug = slugify(t);
    return `<a href="/wiki/article/${encodeURIComponent(slug)}" class="wiki-link">${d}</a>`;
  });

  // Rewrite firebase images to use Next.js optimization
  processed = processed.replace(/<img([^>]*)src="([^"]+)"([^>]*)>/gi, (match, before, src, after) => {
    if (src.includes('firebasestorage.googleapis.com')) {
      const optimizedSrc = `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=75`;
      return `<img${before}src="${optimizedSrc}"${after}>`;
    }
    return match;
  });

  return processed;
}

interface HtmlTocHeading {
  level: number;
  text: string;
}

export interface EditorTocItem extends HtmlTocHeading {
  id: string;
}

function decodeHeadingText(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };

  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
      if (key[0] === '#') {
        const isHex = key[1]?.toLowerCase() === 'x';
        const point = Number.parseInt(key.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        if (Number.isFinite(point)) {
          try {
            return String.fromCodePoint(point);
          } catch {
            return entity;
          }
        }
      }
      return namedEntities[key.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlTocHeadings(html: string): HtmlTocHeading[] {
  const headings: HtmlTocHeading[] = [];
  const pattern = /<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    headings.push({ level: Number(match[1]), text: decodeHeadingText(match[2]) });
  }
  return headings;
}

export function countHtmlTocHeadings(html: string): number {
  return htmlTocHeadings(html).length;
}

export function withStableHeadingIds(html: string, startIndex = 0): string {
  let headingIndex = startIndex;
  return html.replace(
    /<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi,
    (_match, level: string, attributes: string, contents: string) => {
      const withoutId = attributes.replace(
        /\s+id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
        '',
      );
      return `<h${level}${withoutId} id="heading-${headingIndex++}">${contents}</h${level}>`;
    },
  );
}

export function extractEditorTocItems(data?: EditorData): EditorTocItem[] {
  const items: EditorTocItem[] = [];
  let headingIndex = 0;

  for (const block of data?.blocks ?? []) {
    const blockData = block.data ?? {};
    if (block.type === 'header') {
      const level = Number(blockData.level ?? 2);
      if (level >= 2 && level <= 4) {
        items.push({
          id: `heading-${headingIndex++}`,
          text: decodeHeadingText(String(blockData.text ?? '')),
          level,
        });
      }
      continue;
    }

    let html = '';
    if (block.type === 'html' && typeof blockData.html === 'string') {
      html = blockData.html;
    } else if (block.type === 'markdown' && typeof blockData.markdown === 'string') {
      html = convertMarkdownToHtml(blockData.markdown);
    }

    for (const heading of htmlTocHeadings(html)) {
      items.push({ ...heading, id: `heading-${headingIndex++}` });
    }
  }

  return items;
}

function editorBlockTocHeadingCount(block: EditorBlock): number {
  const blockData = block.data ?? {};
  if (block.type === 'header') {
    const level = Number(blockData.level ?? 2);
    return level >= 2 && level <= 4 ? 1 : 0;
  }
  if (block.type === 'html' && typeof blockData.html === 'string') {
    return countHtmlTocHeadings(blockData.html);
  }
  if (block.type === 'markdown' && typeof blockData.markdown === 'string') {
    return countHtmlTocHeadings(convertMarkdownToHtml(blockData.markdown));
  }
  return 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownInline(value: string): string {
  const protectedHtml: string[] = [];
  const protect = (html: string) => {
    const index = protectedHtml.push(html) - 1;
    return `\u0000INLINE${index}\u0000`;
  };

  let html = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    return protect(`<code>${escapeHtml(code)}</code>`);
  });
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, url: string) => {
    const normalizedUrl = url.replace(/\\\)/g, ')');
    const optimizedSrc = normalizedUrl.includes('firebasestorage.googleapis.com')
      ? `/_next/image?url=${encodeURIComponent(normalizedUrl)}&w=1200&q=75`
      : normalizedUrl;
    return protect(`<img src="${escapeHtml(optimizedSrc)}" alt="${escapeHtml(alt)}" style="max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; display: block;" />`);
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, url: string) => {
    const href = escapeHtml(url.replace(/\\\)/g, ')'));
    return protect(`<a href="${href}" class="wiki-link">${markdownInline(text)}</a>`);
  });

  html = escapeHtml(html);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  html = html.replace(/\\([\\|*_[\]])/g, '$1');
  html = html.replace(/\u0000INLINE(\d+)\u0000/g, (_match, index: string) => protectedHtml[Number(index)] ?? '');
  return html;
}

function splitMarkdownTableRow(line: string): string[] {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);

  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

interface MarkdownListLine {
  content: string;
  indent: number;
  ordered: boolean;
}

function parseMarkdownListLine(line: string): MarkdownListLine | null {
  const match = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  return {
    content: match[3],
    indent: match[1].replace(/\t/g, '    ').length,
    ordered: /^\d/.test(match[2]),
  };
}

function renderMarkdownListAt(
  lines: MarkdownListLine[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const baseIndent = lines[startIndex].indent;
  const ordered = lines[startIndex].ordered;
  const tag = ordered ? 'ol' : 'ul';
  let html = `<${tag}>`;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent !== baseIndent || line.ordered !== ordered) break;

    html += `<li>${markdownInline(line.content)}`;
    index += 1;
    while (index < lines.length && lines[index].indent > baseIndent) {
      const nested = renderMarkdownListAt(lines, index);
      html += nested.html;
      index = nested.nextIndex;
    }
    html += '</li>';
  }

  return { html: `${html}</${tag}>`, nextIndex: index };
}

function renderMarkdownLists(lines: MarkdownListLine[]): string {
  let html = '';
  let index = 0;
  while (index < lines.length) {
    const list = renderMarkdownListAt(lines, index);
    html += list.html;
    index = list.nextIndex;
  }
  return html;
}

export function convertMarkdownToHtml(markdown: string): string {
  const lines = parseMarkdownWikiLinks(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  const startsBlock = (lineIndex: number) => {
    const line = lines[lineIndex] ?? '';
    return /^\s*$/.test(line)
      || /^```/.test(line)
      || /^#{1,4}\s+/.test(line)
      || /^\s*>/.test(line)
      || /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)
      || parseMarkdownListLine(line) !== null
      || (line.includes('|') && isMarkdownTableSeparator(lines[lineIndex + 1] ?? ''));
  };

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*$/.test(line)) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (line.includes('|') && isMarkdownTableSeparator(lines[index + 1] ?? '')) {
      const rows = [splitMarkdownTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && !/^\s*$/.test(lines[index])) {
        rows.push(splitMarkdownTableRow(lines[index]));
        index += 1;
      }
      const columnCount = Math.max(...rows.map((row) => row.length));
      const rowHtml = (row: string[], tag: 'td' | 'th') => {
        const cells = [...row, ...Array.from({ length: columnCount - row.length }, () => '')];
        return `<tr>${cells.map((cell) => `<${tag}>${markdownInline(cell)}</${tag}>`).join('')}</tr>`;
      };
      blocks.push(`<div class="wikiTableWrap"><table><thead>${rowHtml(rows[0], 'th')}</thead><tbody>${rows.slice(1).map((row) => rowHtml(row, 'td')).join('')}</tbody></table></div>`);
      continue;
    }

    const listLine = parseMarkdownListLine(line);
    if (listLine) {
      const listLines = [listLine];
      index += 1;
      while (index < lines.length) {
        const nextLine = parseMarkdownListLine(lines[index]);
        if (!nextLine) break;
        listLines.push(nextLine);
        index += 1;
      }
      blocks.push(renderMarkdownLists(listLines));
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = lines[index].match(/^\s*>\s?(.*)$/);
        if (!quote) break;
        quoteLines.push(markdownInline(quote[1]));
        index += 1;
      }
      blocks.push(`<blockquote><p>${quoteLines.join('<br />')}</p></blockquote>`);
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push('<hr />');
      index += 1;
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && !startsBlock(index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(markdownInline).join('<br />')}</p>`);
  }

  return blocks.join('\n');
}

function renderHtml(htmlContent: string) {
  // Editor.js provides formatted HTML with <b>, <i>, <a href>, etc.
  // We just need to parse our custom [[WikiLinks]] and inject them as standard anchors.
  const processed = parseHtmlWikiLinks(htmlContent);
  return { __html: processed };
}

function renderList(items: unknown[], style: 'ordered' | 'unordered', key?: React.Key) {
  const children = items.map((item, index) => {
    const raw = typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'content' in item
        ? String(item.content ?? '')
        : '';
    const childItems = nestedListItems(item);
    const childStyle = nestedListStyle(item, style);

    return (
      <li key={index}>
        {raw && <span dangerouslySetInnerHTML={renderHtml(cleanText(raw))} />}
        {childItems.length > 0 && renderList(childItems, childStyle)}
      </li>
    );
  });

  return style === 'ordered'
    ? <ol key={key}>{children}</ol>
    : <ul key={key}>{children}</ul>;
}

export default function EditorOutput({ data }: { data: EditorData }) {
  if (!data?.blocks?.length) {
    return <p>This article does not have any body content yet.</p>;
  }

  const headingStartIndices = data.blocks.reduce<number[]>(
    (indices, block) => [
      ...indices,
      (indices.at(-1) ?? 0) + editorBlockTocHeadingCount(block),
    ],
    [0],
  );

  return (
    <>
      {data.blocks.map((block, index) => {
        const key = blockKey(block, index);
        const blockData = block.data ?? {};

        if (block.type === 'html') {
          const rawHtml = typeof blockData.html === 'string' ? blockData.html : '';
          const parsedHtml = withStableHeadingIds(parseHtmlWikiLinks(rawHtml), headingStartIndices[index]);
          return (
            <div
              key={key}
              dangerouslySetInnerHTML={{ __html: parsedHtml }}
            />
          );
        }

        if (block.type === 'markdown') {
          const md = typeof blockData.markdown === 'string' ? blockData.markdown : '';
          const rawHtml = convertMarkdownToHtml(md);
          const html = withStableHeadingIds(rawHtml, headingStartIndices[index]);
          return (
            <div
              key={key}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        if (block.type === 'header') {
          const level = Number(blockData.level ?? 2);
          const val = cleanText(blockData.text);
          const id = level >= 2 && level <= 4 ? `heading-${headingStartIndices[index]}` : undefined;
          if (level <= 2) return <h2 id={id} key={key} dangerouslySetInnerHTML={renderHtml(val)} />;
          if (level === 3) return <h3 id={id} key={key} dangerouslySetInnerHTML={renderHtml(val)} />;
          return <h4 id={id} key={key} dangerouslySetInnerHTML={renderHtml(val)} />;
        }

        if (block.type === 'list') {
          const style = blockData.style === 'ordered' ? 'ordered' : 'unordered';
          const items = Array.isArray(blockData.items) ? blockData.items : [];
          return renderList(items, style, key);
        }

        if (block.type === 'quote') {
          const quoteText = cleanText(blockData.text, true);
          const captionText = cleanText(blockData.caption);
          return (
            <blockquote key={key}>
              <p dangerouslySetInnerHTML={renderHtml(quoteText)} />
              {captionText && <cite dangerouslySetInnerHTML={renderHtml(captionText)} />}
            </blockquote>
          );
        }

        if (block.type === 'warning') {
          const warnMsg = cleanText(blockData.message, true);
          const title = cleanText(blockData.title);
          return (
            <aside key={key} className="wikiWarning">
              {title && <strong dangerouslySetInnerHTML={renderHtml(title)} />}
              <p dangerouslySetInnerHTML={renderHtml(warnMsg)} />
            </aside>
          );
        }

        if (block.type === 'table' && Array.isArray(blockData.content)) {
          return (
            <div key={key} className="wikiTableWrap">
              <table>
                <tbody>
                  {blockData.content.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {tableCells(row)
                        .map((cell, cellIndex) => (
                          <td key={cellIndex} dangerouslySetInnerHTML={renderHtml(cleanText(cell))} />
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={key}>
              <code>{typeof blockData.code === 'string' ? blockData.code : ''}</code>
            </pre>
          );
        }

        if (block.type === 'delimiter') {
          return <hr key={key} />;
        }

        if (block.type === 'image') {
          const file = blockData.file && typeof blockData.file === 'object' && 'url' in blockData.file ? blockData.file.url : '';
          const url = typeof file === 'string' ? file : '';
          const captionText = cleanText(blockData.caption);
          if (!url) return null;
          
          let optimizedUrl = url;
          if (url.includes('firebasestorage.googleapis.com')) {
             optimizedUrl = `/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`;
          }

          return (
            <figure key={key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={optimizedUrl} alt={captionText.replace(/<[^>]*>?/gm, '') || 'Wiki image'} />
              {captionText && <figcaption dangerouslySetInnerHTML={renderHtml(captionText)} />}
            </figure>
          );
        }

        const pText = cleanText(blockData.text, true);
        return <p key={key} dangerouslySetInnerHTML={renderHtml(pText)} />;
      })}
    </>
  );
}
