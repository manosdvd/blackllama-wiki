'use client';

import React, { Fragment } from 'react';
import Link from 'next/link';
import type { EditorBlock, EditorData } from '@/types/content';
import { slugify } from '@/lib/content/editorText';

// Formats / cleans text of basic html tags while leaving brackets intact
function text(value: unknown, preserveBreaks = false) {
  if (typeof value !== 'string') return '';
  const withBreaks = value.replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]*>/g, ' ');
  if (!preserveBreaks) return stripped.replace(/\s+/g, ' ').trim();
  return stripped
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

function blockKey(block: EditorBlock, index: number) {
  return block.id ?? `${block.type}-${index}`;
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
  return html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, display) => {
    const t = target.trim();
    const d = display ? display.trim() : t;
    const slug = slugify(t);
    return `<a href="/wiki/article/${encodeURIComponent(slug)}" class="wiki-link">${d}</a>`;
  });
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

function WikiText({ value, preserveBreaks = false }: { value: string; preserveBreaks?: boolean }) {
  if (!value) return null;

  const normalized = preserveBreaks ? value.replace(/<br\s*\/?>/gi, '\n') : value;
  const regex = /\[\[([^\]]+)\]\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    const matchIndex = match.index;
    const content = match[1];

    if (matchIndex > lastIndex) {
      parts.push(normalized.substring(lastIndex, matchIndex));
    }

    const pipeIndex = content.indexOf('|');
    const target = pipeIndex !== -1 ? content.substring(0, pipeIndex).trim() : content.trim();
    const displayText = pipeIndex !== -1 ? content.substring(pipeIndex + 1).trim() : target;
    const targetSlug = slugify(target);

    parts.push(
      <Link
        key={`${targetSlug}-${matchIndex}`}
        href={`/wiki/article/${encodeURIComponent(targetSlug)}`}
        className="wiki-link"
      >
        {displayText}
      </Link>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    parts.push(normalized.substring(lastIndex));
  }

  if (preserveBreaks) {
    return (
      <>
        {parts.map((part, index) => {
          if (typeof part === 'string') {
            return (
              <span key={index}>
                {part.split('\n').map((line, lineIdx) => (
                  <React.Fragment key={lineIdx}>
                    {lineIdx > 0 && <br />}
                    {line}
                  </React.Fragment>
                ))}
              </span>
            );
          }
          return part;
        })}
      </>
    );
  }

  return <>{parts}</>;
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
          const val = text(blockData.text);
          if (level <= 2) return <h2 key={key}><WikiText value={val} /></h2>;
          if (level === 3) return <h3 key={key}><WikiText value={val} /></h3>;
          return <h4 key={key}><WikiText value={val} /></h4>;
        }

        if (block.type === 'list') {
          const style = blockData.style === 'ordered' ? 'ordered' : 'unordered';
          const items = Array.isArray(blockData.items) ? blockData.items : [];
          const listItems = items.map((item, idx) => {
            const raw = typeof item === 'string' ? item : item && typeof item === 'object' && 'content' in item ? String(item.content) : '';
            return <li key={idx}><WikiText value={text(raw)} /></li>;
          });
          return style === 'ordered' ? (
            <ol key={key}>{listItems}</ol>
          ) : (
            <ul key={key}>{listItems}</ul>
          );
        }

        if (block.type === 'quote') {
          const quoteText = text(blockData.text, true);
          return (
            <blockquote key={key}>
              <p><WikiText value={quoteText} preserveBreaks={true} /></p>
              {text(blockData.caption) && <cite>{text(blockData.caption)}</cite>}
            </blockquote>
          );
        }

        if (block.type === 'warning') {
          const warnMsg = text(blockData.message, true);
          return (
            <aside key={key} className="wikiWarning">
              {text(blockData.title) && <strong>{text(blockData.title)}</strong>}
              <p><WikiText value={warnMsg} preserveBreaks={true} /></p>
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
                      {Array.isArray(row) &&
                        row.map((cell, cellIndex) => (
                          <td key={cellIndex}>
                            <WikiText value={text(cell)} />
                          </td>
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
          if (!url) return null;
          return (
            <figure key={key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={text(blockData.caption) || 'Wiki image'} />
              {text(blockData.caption) && <figcaption>{text(blockData.caption)}</figcaption>}
            </figure>
          );
        }

        const pText = text(blockData.text, true);
        return <p key={key}><WikiText value={pText} preserveBreaks={true} /></p>;
      })}
    </>
  );
}
