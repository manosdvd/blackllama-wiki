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

export function convertMarkdownToHtml(markdown: string): string {
  // Parse wiki links first so they convert to markdown links
  let html = parseMarkdownWikiLinks(markdown);

  // Escaping html tags to prevent raw html injection in markdown mode
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italics
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Markdown images: ![alt](url) -> optimized images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const optimizedSrc = url.includes('firebasestorage.googleapis.com') 
      ? `/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`
      : url;
    return `<img src="${optimizedSrc}" alt="${alt}" style="max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; display: block;" />`;
  });

  // Markdown links: [text](url) -> standard links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="wiki-link">$1</a>');

  // Bullet Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Line breaks
  html = html.replace(/\n/g, '<br />');

  return html;
}

function renderHtml(htmlContent: string) {
  // Editor.js provides formatted HTML with <b>, <i>, <a href>, etc.
  // We just need to parse our custom [[WikiLinks]] and inject them as standard anchors.
  const processed = parseHtmlWikiLinks(htmlContent);
  return { __html: processed };
}

export default function EditorOutput({ data }: { data: EditorData }) {
  if (!data?.blocks?.length) {
    return <p>This article does not have any body content yet.</p>;
  }

  return (
    <>
      {data.blocks.map((block, index) => {
        const key = blockKey(block, index);
        const blockData = block.data ?? {};

        if (block.type === 'html') {
          const rawHtml = typeof blockData.html === 'string' ? blockData.html : '';
          const parsedHtml = parseHtmlWikiLinks(rawHtml);
          return (
            <div
              key={key}
              dangerouslySetInnerHTML={{ __html: parsedHtml }}
            />
          );
        }

        if (block.type === 'markdown') {
          const md = typeof blockData.markdown === 'string' ? blockData.markdown : '';
          const html = convertMarkdownToHtml(md);
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
          if (level <= 2) return <h2 key={key} dangerouslySetInnerHTML={renderHtml(val)} />;
          if (level === 3) return <h3 key={key} dangerouslySetInnerHTML={renderHtml(val)} />;
          return <h4 key={key} dangerouslySetInnerHTML={renderHtml(val)} />;
        }

        if (block.type === 'list') {
          const style = blockData.style === 'ordered' ? 'ordered' : 'unordered';
          const items = Array.isArray(blockData.items) ? blockData.items : [];
          const listItems = items.map((item, idx) => {
            const raw = typeof item === 'string' ? item : item && typeof item === 'object' && 'content' in item ? String(item.content) : '';
            return <li key={idx} dangerouslySetInnerHTML={renderHtml(cleanText(raw))} />;
          });
          return style === 'ordered' ? (
            <ol key={key}>{listItems}</ol>
          ) : (
            <ul key={key}>{listItems}</ul>
          );
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
