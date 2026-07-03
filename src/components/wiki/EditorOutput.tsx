'use client';

import { Fragment } from 'react';
import type { EditorBlock, EditorData } from '@/types/content';

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

function Lines({ value }: { value: string }) {
  return (
    <>
      {value.split('\n').map((line, index) => (
        <Fragment key={`${line}-${index}`}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

function renderListItems(items: unknown) {
  if (!Array.isArray(items)) return null;
  return items.map((item, index) => {
    if (typeof item === 'string') return <li key={index}>{text(item)}</li>;
    if (item && typeof item === 'object' && 'content' in item) {
      return <li key={index}>{text(item.content)}</li>;
    }
    return null;
  });
}

function blockKey(block: EditorBlock, index: number) {
  return block.id ?? `${block.type}-${index}`;
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

        if (block.type === 'header') {
          const level = Number(blockData.level ?? 2);
          if (level <= 2) return <h2 key={key}>{text(blockData.text)}</h2>;
          if (level === 3) return <h3 key={key}>{text(blockData.text)}</h3>;
          return <h4 key={key}>{text(blockData.text)}</h4>;
        }

        if (block.type === 'list') {
          const style = blockData.style === 'ordered' ? 'ordered' : 'unordered';
          return style === 'ordered' ? (
            <ol key={key}>{renderListItems(blockData.items)}</ol>
          ) : (
            <ul key={key}>{renderListItems(blockData.items)}</ul>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key}>
              <p><Lines value={text(blockData.text, true)} /></p>
              {text(blockData.caption) && <cite>{text(blockData.caption)}</cite>}
            </blockquote>
          );
        }

        if (block.type === 'warning') {
          return (
            <aside key={key} className="wikiWarning">
              {text(blockData.title) && <strong>{text(blockData.title)}</strong>}
              <p><Lines value={text(blockData.message, true)} /></p>
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
                        row.map((cell, cellIndex) => <td key={cellIndex}>{text(cell)}</td>)}
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

        return <p key={key}><Lines value={text(blockData.text, true)} /></p>;
      })}
    </>
  );
}
