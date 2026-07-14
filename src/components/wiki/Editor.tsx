'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3,
  List, ListOrdered, Link as LinkIcon, Link2, RemoveFormatting,
  Quote, Image as ImageIcon, Video,
  AlignLeft, AlignCenter, AlignRight, Indent, Outdent
} from 'lucide-react';
import {
  countHtmlTocHeadings,
  convertMarkdownToHtml,
  withStableHeadingIds,
} from './EditorOutput';
import type { EditorData } from '@/types/content';
import styles from './Editor.module.css';

interface EditorProps {
  initialData?: EditorData;
  onChange: (data: EditorData) => void;
}

type EditorMode = 'wysiwyg' | 'markdown' | 'html';

function editorTableCells(row: unknown): unknown[] {
  if (Array.isArray(row)) return row;
  if (row && typeof row === 'object') {
    const candidate = row as { cells?: unknown; values?: unknown };
    if (Array.isArray(candidate.cells)) return candidate.cells;
    if (Array.isArray(candidate.values)) return candidate.values;
  }
  return [];
}

interface ParsedHtmlNode {
  type: 'root' | 'element' | 'text';
  tag?: string;
  attributes?: Record<string, string>;
  value?: string;
  children: ParsedHtmlNode[];
}

const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
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
  });
}

function parseHtmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source))) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    attributes[name.toLowerCase()] = decodeHtmlEntities(doubleQuoted ?? singleQuoted ?? unquoted ?? '');
  }
  return attributes;
}

function parseHtmlFragment(html: string): ParsedHtmlNode {
  const root: ParsedHtmlNode = { type: 'root', children: [] };
  const stack = [root];
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+|</gi) ?? [];

  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;

    if (!token.startsWith('<')) {
      stack.at(-1)?.children.push({ type: 'text', value: token, children: [] });
      continue;
    }

    const closing = token.match(/^<\s*\/\s*([a-z\d-]+)/i);
    if (closing) {
      const closingTag = closing[1].toLowerCase();
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === closingTag) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    const opening = token.match(/^<\s*([a-z\d-]+)([\s\S]*?)\/?\s*>$/i);
    if (!opening) {
      stack.at(-1)?.children.push({ type: 'text', value: token, children: [] });
      continue;
    }

    const tag = opening[1].toLowerCase();
    const node: ParsedHtmlNode = {
      type: 'element',
      tag,
      attributes: parseHtmlAttributes(opening[2]),
      children: [],
    };
    stack.at(-1)?.children.push(node);

    if (!VOID_HTML_TAGS.has(tag) && !token.endsWith('/>')) {
      stack.push(node);
    }
  }

  return root;
}

function htmlNodeText(node: ParsedHtmlNode): string {
  if (node.type === 'text') return decodeHtmlEntities(node.value ?? '');
  if (node.tag === 'br') return '\n';
  return node.children.map(htmlNodeText).join('');
}

function markdownTable(node: ParsedHtmlNode): string {
  const rowNodes: ParsedHtmlNode[] = [];
  const collectRows = (candidate: ParsedHtmlNode) => {
    if (candidate.tag === 'tr') {
      rowNodes.push(candidate);
      return;
    }
    candidate.children.forEach(collectRows);
  };
  collectRows(node);

  const rows = rowNodes
    .map((row) => row.children
      .filter((cell) => cell.tag === 'td' || cell.tag === 'th')
      .map((cell) => htmlNodesToMarkdown(cell.children, true)
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()))
    .filter((row) => row.length > 0);

  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ''),
  ]);
  const tableLine = (row: string[]) => `| ${row.join(' | ')} |`;

  return [
    tableLine(normalizedRows[0]),
    tableLine(Array.from({ length: columnCount }, () => '---')),
    ...normalizedRows.slice(1).map(tableLine),
  ].join('\n');
}

function markdownList(node: ParsedHtmlNode, depth = 0): string {
  const ordered = node.tag === 'ol';
  const items = node.children.filter((child) => child.tag === 'li');

  return items.map((item, itemIndex) => {
    const nestedLists = item.children.filter((child) => child.tag === 'ul' || child.tag === 'ol');
    const contentNodes = item.children.filter((child) => child.tag !== 'ul' && child.tag !== 'ol');
    const content = htmlNodesToMarkdown(contentNodes, true)
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const indent = '  '.repeat(depth);
    const marker = ordered ? `${itemIndex + 1}.` : '-';
    const line = `${indent}${marker} ${content}`.trimEnd();
    const children = nestedLists.map((list) => markdownList(list, depth + 1)).filter(Boolean);
    return [line, ...children].join('\n');
  }).join('\n');
}

function htmlNodeToMarkdown(node: ParsedHtmlNode, inline = false): string {
  if (node.type === 'text') return decodeHtmlEntities(node.value ?? '');
  if (node.type === 'root') return htmlNodesToMarkdown(node.children, inline);

  const tag = node.tag ?? '';
  const contents = htmlNodesToMarkdown(node.children, true);

  if (tag === 'script' || tag === 'style') return '';
  if (tag === 'strong' || tag === 'b') return `**${contents}**`;
  if (tag === 'em' || tag === 'i') return `*${contents}*`;
  if (tag === 'code' && node.children.length > 0) return `\`${contents}\``;
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '\n---\n';
  if (tag === 'a') {
    const href = node.attributes?.href;
    return href ? `[${contents}](${href.replace(/\)/g, '\\)')})` : contents;
  }
  if (tag === 'img') {
    const src = node.attributes?.src;
    if (!src) return '';
    const alt = (node.attributes?.alt ?? '').replace(/]/g, '\\]');
    return `![${alt}](${src.replace(/\)/g, '\\)')})`;
  }
  if (tag === 'ul' || tag === 'ol') return `\n${markdownList(node)}\n`;
  if (tag === 'table') return `\n${markdownTable(node)}\n`;
  if (/^h[1-6]$/.test(tag)) {
    return `\n${'#'.repeat(Number(tag.slice(1)))} ${contents.trim()}\n`;
  }
  if (tag === 'blockquote') {
    const quoted = contents.trim().split('\n').map((line) => `> ${line}`).join('\n');
    return `\n${quoted}\n`;
  }
  if (tag === 'pre') return `\n\`\`\`\n${htmlNodeText(node).trim()}\n\`\`\`\n`;
  if (tag === 'p') return inline ? contents : `\n${contents.trim()}\n`;
  if (tag === 'div' || tag === 'section' || tag === 'article') {
    return inline ? contents : `\n${contents}\n`;
  }
  if (tag === 'cite') return contents ? ` — ${contents}` : '';

  return contents;
}

function htmlNodesToMarkdown(nodes: ParsedHtmlNode[], inline = false): string {
  return nodes.map((node) => htmlNodeToMarkdown(node, inline)).join('');
}

function ImageResizerOverlay({
  imgNode,
  onUpdate,
  onClose
}: {
  imgNode: HTMLImageElement;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const startPos = useRef({ x: 0, width: 0, height: 0 });
  // Store imgNode in a ref so we can mutate its style without violating immutability rules.
  // Initialized with imgNode; synced via useEffect whenever the prop changes.
  const imgRef = useRef<HTMLImageElement>(imgNode);

  useEffect(() => {
    imgRef.current = imgNode;
  }, [imgNode]);

  useEffect(() => {
    const el = imgRef.current;
    const updateRect = () => {
      if (!el) return;
      setRect({
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight
      });
    };
    updateRect();
    const ro = new ResizeObserver(updateRect);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgNode]);

  const handlePointerDown = (e: React.PointerEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = imgRef.current;
    startPos.current = { x: e.clientX, width: el.offsetWidth, height: el.offsetHeight };
    
    const handlePointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startPos.current.x;
      const newWidth = corner.includes('right') ? startPos.current.width + dx : startPos.current.width - dx;
      imgRef.current.style.width = `${Math.max(50, newWidth)}px`;
      imgRef.current.style.height = 'auto';
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onUpdate();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const applyAlignment = (newAlignment: string) => {
    const el = imgRef.current;
    if (newAlignment === 'left') {
      el.style.display = 'block';
      el.style.margin = '12px auto 12px 0';
      el.style.float = 'none';
    } else if (newAlignment === 'center') {
      el.style.display = 'block';
      el.style.margin = '12px auto';
      el.style.float = 'none';
    } else if (newAlignment === 'right') {
      el.style.display = 'block';
      el.style.margin = '12px 0 12px auto';
      el.style.float = 'none';
    } else if (newAlignment === 'float-left') {
      el.style.display = 'inline';
      el.style.margin = '12px 16px 12px 0';
      el.style.float = 'left';
    } else if (newAlignment === 'float-right') {
      el.style.display = 'inline';
      el.style.margin = '12px 0 12px 16px';
      el.style.float = 'right';
    }
    onUpdate();
  };

  return (
    <>
      <div 
        style={{
          position: 'absolute',
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          border: '2px solid var(--primary-accent)',
          pointerEvents: 'none',
          zIndex: 10
        }}
      >
        <div style={{ pointerEvents: 'auto', position: 'absolute', top: -5, left: -5, width: 10, height: 10, background: 'var(--primary-accent)', cursor: 'nwse-resize' }} onPointerDown={e => handlePointerDown(e, 'top-left')} />
        <div style={{ pointerEvents: 'auto', position: 'absolute', top: -5, right: -5, width: 10, height: 10, background: 'var(--primary-accent)', cursor: 'nesw-resize' }} onPointerDown={e => handlePointerDown(e, 'top-right')} />
        <div style={{ pointerEvents: 'auto', position: 'absolute', bottom: -5, left: -5, width: 10, height: 10, background: 'var(--primary-accent)', cursor: 'nesw-resize' }} onPointerDown={e => handlePointerDown(e, 'bottom-left')} />
        <div style={{ pointerEvents: 'auto', position: 'absolute', bottom: -5, right: -5, width: 10, height: 10, background: 'var(--primary-accent)', cursor: 'nwse-resize' }} onPointerDown={e => handlePointerDown(e, 'bottom-right')} />
      </div>
      
      <div style={{
        position: 'absolute',
        top: Math.max(0, rect.top - 40),
        left: rect.left + rect.width / 2 - 100,
        background: 'var(--bg-layer-2)',
        border: '1px solid var(--border-light)',
        borderRadius: '6px',
        display: 'flex',
        padding: '4px',
        gap: '4px',
        zIndex: 11,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        <button onClick={() => applyAlignment('float-left')} title="Float Left" style={{background:'none',border:'none',cursor:'pointer', color: 'var(--text-primary)'}}>◧</button>
        <button onClick={() => applyAlignment('left')} title="Align Left" style={{background:'none',border:'none',cursor:'pointer', color: 'var(--text-primary)'}}>⇤</button>
        <button onClick={() => applyAlignment('center')} title="Center" style={{background:'none',border:'none',cursor:'pointer', color: 'var(--text-primary)'}}>⇥⇤</button>
        <button onClick={() => applyAlignment('right')} title="Align Right" style={{background:'none',border:'none',cursor:'pointer', color: 'var(--text-primary)'}}>⇥</button>
        <button onClick={() => applyAlignment('float-right')} title="Float Right" style={{background:'none',border:'none',cursor:'pointer', color: 'var(--text-primary)'}}>◨</button>
        <div style={{width:'1px', background:'var(--border-light)', margin:'0 4px'}}></div>
        <button onClick={onClose} title="Close Menu" style={{background:'none',border:'none',cursor:'pointer', color:'var(--red-ember)'}}>✖</button>
      </div>
    </>
  );
}

export function convertHtmlToMarkdown(html: string): string {
  return htmlNodesToMarkdown(parseHtmlFragment(html).children)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function convertEditorJsToHtml(data?: EditorData): string {
  if (!data?.blocks?.length) return '';

  let headingIndex = 0;

  const listToHtml = (items: unknown[], tag: 'ol' | 'ul'): string => {
    const itemHtml = items.map((item) => {
      const content = typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'content' in item
          ? String(item.content ?? '')
          : '';
      const childItems = item && typeof item === 'object' && 'items' in item && Array.isArray(item.items)
        ? item.items
        : [];
      const nestedStyle = item && typeof item === 'object' && 'style' in item
        ? item.style
        : item && typeof item === 'object' && 'meta' in item && item.meta && typeof item.meta === 'object' && 'style' in item.meta
          ? item.meta.style
          : null;
      const nestedTag = nestedStyle === 'ordered' ? 'ol' : nestedStyle === 'unordered' ? 'ul' : tag;
      const nestedHtml = childItems.length ? listToHtml(childItems, nestedTag) : '';
      return `<li>${content}${nestedHtml}</li>`;
    }).join('');
    return `<${tag}>${itemHtml}</${tag}>`;
  };

  return data.blocks.map(block => {
    const blockData = block.data ?? {};
    if (block.type === 'header') {
      const level = blockData.level || 2;
      const numericLevel = Number(level);
      const id = numericLevel >= 2 && numericLevel <= 4 ? ` id="heading-${headingIndex++}"` : '';
      return `<h${level}${id}>${blockData.text}</h${level}>`;
    }
    if (block.type === 'list') {
      const tag = blockData.style === 'ordered' ? 'ol' : 'ul';
      const items = Array.isArray(blockData.items) ? blockData.items : [];
      return listToHtml(items, tag);
    }
    if (block.type === 'table' && Array.isArray(blockData.content)) {
      const rows = blockData.content.map(editorTableCells);
      const rowToHtml = (row: unknown[], cellTag: 'td' | 'th') => (
        `<tr>${row.map((cell) => `<${cellTag}>${String(cell ?? '')}</${cellTag}>`).join('')}</tr>`
      );
      const withHeadings = blockData.withHeadings === true && rows.length > 0;
      const head = withHeadings ? `<thead>${rowToHtml(rows[0], 'th')}</thead>` : '';
      const bodyRows = withHeadings ? rows.slice(1) : rows;
      return `<div class="wikiTableWrap"><table>${head}<tbody>${bodyRows.map((row) => rowToHtml(row, 'td')).join('')}</tbody></table></div>`;
    }
    if (block.type === 'quote') {
      return `<blockquote><p>${blockData.text}</p>${blockData.caption ? `<cite>${blockData.caption}</cite>` : ''}</blockquote>`;
    }
    if (block.type === 'html') {
      const rawHtml = typeof blockData.html === 'string' ? blockData.html : '';
      const html = withStableHeadingIds(rawHtml, headingIndex);
      headingIndex += countHtmlTocHeadings(rawHtml);
      return html;
    }
    if (block.type === 'markdown') {
      const mdVal = typeof blockData.markdown === 'string' ? blockData.markdown : '';
      const rawHtml = convertMarkdownToHtml(mdVal);
      const html = withStableHeadingIds(rawHtml, headingIndex);
      headingIndex += countHtmlTocHeadings(rawHtml);
      return html;
    }
    // Default to paragraph
    return `<p>${blockData.text || ''}</p>`;
  }).join('\n');
}

export default function Editor({ initialData, onChange }: EditorProps) {
  const [activeMode, setActiveMode] = useState<EditorMode>(() => {
    if (initialData?.blocks?.length) {
      const firstBlock = initialData.blocks[0];
      if (firstBlock.type === 'markdown') return 'markdown';
    }
    return 'wysiwyg';
  });

  const [htmlContent, setHtmlContent] = useState<string>(() => {
    if (initialData?.blocks?.length) {
      const firstBlock = initialData.blocks[0];
      if (firstBlock.type === 'markdown') {
        return convertMarkdownToHtml(String(firstBlock.data?.markdown || ''));
      } else if (firstBlock.type === 'html') {
        return String(firstBlock.data?.html || '');
      } else {
        return convertEditorJsToHtml(initialData);
      }
    }
    return '';
  });

  const [mdContent, setMdContent] = useState<string>(() => {
    if (initialData?.blocks?.length) {
      const firstBlock = initialData.blocks[0];
      if (firstBlock.type === 'markdown') {
        return String(firstBlock.data?.markdown || '');
      } else if (firstBlock.type === 'html') {
        return convertHtmlToMarkdown(String(firstBlock.data?.html || ''));
      } else {
        return convertHtmlToMarkdown(convertEditorJsToHtml(initialData));
      }
    }
    return '';
  });

  const wysiwygRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const markdownTextareaRef = useRef<HTMLTextAreaElement>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load content into WYSIWYG editor area when entering wysiwyg mode
  useEffect(() => {
    if (activeMode === 'wysiwyg' && wysiwygRef.current) {
      if (wysiwygRef.current.innerHTML !== htmlContent) {
        wysiwygRef.current.innerHTML = htmlContent;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  // Handler for text input inside contentEditable
  const handleWysiwygInput = () => {
    if (wysiwygRef.current) {
      const newHtml = wysiwygRef.current.innerHTML;
      // Opening or blurring an untouched structured article should not flatten it into one HTML block.
      if (newHtml === htmlContent) return;
      setHtmlContent(newHtml);
      
      // Automatically keep markdown content synced in background
      setMdContent(convertHtmlToMarkdown(newHtml));

      // Notify edit form of HTML content payload
      onChange({
        time: Date.now(),
        blocks: [{ type: 'html', data: { html: newHtml } }],
        version: 'custom-wysiwyg'
      });
    }
  };

  const handleWysiwygClick = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLImageElement) {
      setSelectedImage(e.target);
    } else {
      setSelectedImage(null);
    }
  };

  // Handler for Markdown input changes
  const handleMdChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMd = e.target.value;
    setMdContent(newMd);

    // Sync HTML state in background
    setHtmlContent(convertMarkdownToHtml(newMd));

    // Notify edit form of Markdown payload
    onChange({
      time: Date.now(),
      blocks: [{ type: 'markdown', data: { markdown: newMd } }],
      version: 'custom-wysiwyg'
    });
  };

  // Handler for Raw HTML changes
  const handleHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newHtml = e.target.value;
    setHtmlContent(newHtml);

    // Sync MD state in background
    setMdContent(convertHtmlToMarkdown(newHtml));

    // Notify edit form of HTML payload
    onChange({
      time: Date.now(),
      blocks: [{ type: 'html', data: { html: newHtml } }],
      version: 'custom-wysiwyg'
    });
  };

  // Execute standard visual editing toolbar commands
  const execCmd = (command: string, value: string = '') => {
    if (wysiwygRef.current) {
      wysiwygRef.current.focus();
    }
    document.execCommand(command, false, value);
    handleWysiwygInput();
  };

  // Insert standard anchor link
  const insertLink = () => {
    const url = prompt('Enter url link (e.g. https://google.com):');
    if (url) {
      execCmd('createLink', url);
    }
  };

  // Insert Wikipedia-style cross-link tag [[Article Title|Display Text]]
  const insertWikiLink = () => {
    const target = prompt('Enter targeted Wiki Article title or slug (e.g. Policies & Procedures):');
    if (!target) return;
    const display = prompt('Enter link display text (optional, leave blank to use title):') || '';
    const wikiTag = display ? `[[${target}|${display}]]` : `[[${target}]]`;

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(wikiTag));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    handleWysiwygInput();
  };

  // Handle Tab Switch
  const switchMode = (mode: EditorMode) => {
    if (mode === activeMode) return;
    
    // Sync contents depending on directions
    if (activeMode === 'wysiwyg' && wysiwygRef.current) {
      const html = wysiwygRef.current.innerHTML;
      setHtmlContent(html);
      setMdContent(convertHtmlToMarkdown(html));
    }
    
    setActiveMode(mode);
  };

  // Helper to insert HTML/Markdown content at the cursor for the active editor tab
  const insertMediaAtCursor = (wysiwygHtml: string, markdownText: string) => {
    if (activeMode === 'wysiwyg') {
      wysiwygRef.current?.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        // Convert HTML string to DOM nodes
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = wysiwygHtml;
        const fragment = document.createDocumentFragment();
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
        
        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      handleWysiwygInput();
    } else if (activeMode === 'markdown') {
      const textarea = markdownTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const newVal = val.substring(0, start) + markdownText + val.substring(end);
        setMdContent(newVal);
        setHtmlContent(convertMarkdownToHtml(newVal));
        onChange({
          time: Date.now(),
          blocks: [{ type: 'markdown', data: { markdown: newVal } }],
          version: 'custom-wysiwyg'
        });
        
        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + markdownText.length;
        }, 0);
      }
    } else if (activeMode === 'html') {
      const textarea = htmlTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const newVal = val.substring(0, start) + wysiwygHtml + val.substring(end);
        setHtmlContent(newVal);
        setMdContent(convertHtmlToMarkdown(newVal));
        onChange({
          time: Date.now(),
          blocks: [{ type: 'html', data: { html: newVal } }],
          version: 'custom-wysiwyg'
        });
        
        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + wysiwygHtml.length;
        }, 0);
      }
    }
  };

  const handleImageClick = () => {
    imageInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const { default: imageCompression } = await import('browser-image-compression');
      const { storage, db } = await import('@/lib/firebase/client');
      const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
      const { doc, setDoc, collection, serverTimestamp } = await import('firebase/firestore');

      const options = {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 1400,
        useWebWorker: true,
      };
      
      // Compress image
      const compressedFile = await imageCompression(file, options);
      
      // Upload to Firebase Storage
      const fileName = `${Date.now()}-${compressedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storageRef = ref(storage, `wiki-images/${fileName}`);
      
      await uploadBytesResumable(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      // Save to Firestore image gallery
      const imageDocRef = doc(collection(db, 'imageGallery'));
      await setDoc(imageDocRef, {
        url: downloadURL,
        filename: fileName,
        originalName: file.name,
        uploadedAt: serverTimestamp(),
        size: compressedFile.size,
      });

      const safeName = file.name.replace(/"/g, '&quot;');
      const imgHtml = `<img src="${downloadURL}" alt="${safeName}" style="width: 100%; height: auto; max-width: 600px; border-radius: 6px; margin: 12px auto; display: block;" />`;
      const imgMd = `![${file.name.replace(/]/g, '\\]')}](${downloadURL})`;
      insertMediaAtCursor(imgHtml, imgMd);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not embed that image.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleYoutubeEmbed = () => {
    const url = prompt('Enter YouTube Video Link:\n(e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
    if (!url) return;

    // Regex to extract Video ID
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (!videoId) {
      alert('Invalid YouTube Link. Please copy and paste a direct video URL.');
      return;
    }

    const embedHtml = `<div class="video-container" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 8px; margin: 16px 0;">
  <iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>`;

    insertMediaAtCursor(embedHtml, embedHtml);
  };

  return (
    <div className={styles.editorContainer}>
      {/* Tabs list */}
      <div className={styles.tabsHeader}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeMode === 'wysiwyg' ? styles.activeTabBtn : ''}`}
          onClick={() => switchMode('wysiwyg')}
        >
          Rich Text (WYSIWYG)
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeMode === 'markdown' ? styles.activeTabBtn : ''}`}
          onClick={() => switchMode('markdown')}
        >
          Markdown (MD)
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeMode === 'html' ? styles.activeTabBtn : ''}`}
          onClick={() => switchMode('html')}
        >
          HTML Code
        </button>
      </div>

      {/* Toolbar - visible only in Rich Text Mode */}
      {activeMode === 'wysiwyg' && (
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('bold')} title="Bold">
            <Bold size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('italic')} title="Italic">
            <Italic size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('underline')} title="Underline">
            <Underline size={16} />
          </button>
          
          <div className={styles.toolbarSeparator} />
          
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('formatBlock', '<h2>')} title="Heading 2">
            <Heading2 size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('formatBlock', '<h3>')} title="Heading 3">
            <Heading3 size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('formatBlock', '<blockquote>')} title="Blockquote">
            <Quote size={16} />
          </button>
          
          <div className={styles.toolbarSeparator} />
          
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('insertUnorderedList')} title="Bullet List">
            <List size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('insertOrderedList')} title="Numbered List">
            <ListOrdered size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('outdent')} title="Decrease Indent">
            <Outdent size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('indent')} title="Increase Indent">
            <Indent size={16} />
          </button>
          
          <div className={styles.toolbarSeparator} />
          
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('justifyLeft')} title="Align Left">
            <AlignLeft size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('justifyCenter')} title="Align Center">
            <AlignCenter size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('justifyRight')} title="Align Right">
            <AlignRight size={16} />
          </button>
          
          <div className={styles.toolbarSeparator} />
          
          <button type="button" className={styles.toolbarBtn} onClick={insertLink} title="Insert Link">
            <LinkIcon size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={insertWikiLink} title="Insert Wiki Link [Tagging]">
            <Link2 size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={handleImageClick} title="Insert Image Upload" disabled={isUploading}>
            <ImageIcon size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={handleYoutubeEmbed} title="Embed YouTube Video">
            <Video size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('removeFormat')} title="Clear Formatting">
            <RemoveFormatting size={16} />
          </button>
        </div>
      )}

      {/* Hidden file input for image uploads */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* Editor viewports */}
      <div className={styles.editorBody}>
        {activeMode === 'wysiwyg' && (
          <div
            ref={wysiwygRef}
            contentEditable
            className={`${styles.viewport} ${styles.wysiwygArea}`}
            onInput={handleWysiwygInput}
            onBlur={handleWysiwygInput}
            onClick={handleWysiwygClick}
          />
        )}
        
        {activeMode === 'wysiwyg' && selectedImage && (
           <ImageResizerOverlay 
             imgNode={selectedImage}
             onUpdate={handleWysiwygInput}
             onClose={() => setSelectedImage(null)}
           />
        )}
        
        {activeMode === 'markdown' && (
          <textarea
            ref={markdownTextareaRef}
            className={styles.textareaInput}
            value={mdContent}
            onChange={handleMdChange}
            placeholder="# Article Title&#10;&#10;Use markdown formatting here..."
          />
        )}

        {activeMode === 'html' && (
          <textarea
            ref={htmlTextareaRef}
            className={styles.textareaInput}
            value={htmlContent}
            onChange={handleHtmlChange}
            placeholder="<h2>Heading</h2>&#10;<p>Use HTML markup here...</p>"
          />
        )}
      </div>
    </div>
  );
}
