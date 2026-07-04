'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3,
  List, ListOrdered, Link as LinkIcon, Link2, RemoveFormatting,
  Quote
} from 'lucide-react';
import { convertMarkdownToHtml } from './EditorOutput';
import type { EditorData } from '@/types/content';
import styles from './Editor.module.css';

interface EditorProps {
  initialData?: EditorData;
  onChange: (data: EditorData) => void;
}

type EditorMode = 'wysiwyg' | 'markdown' | 'html';

export function convertHtmlToMarkdown(html: string): string {
  let md = html;
  // Replace headers
  md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n');
  md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n');
  md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n');
  md = md.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n');
  // Replace strong/bold
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  // Replace em/italics
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  // Replace links
  md = md.replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  // Replace lists
  md = md.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<ul>/gi, '');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol>/gi, '');
  md = md.replace(/<\/ol>/gi, '\n');
  // Clean up br tags
  md = md.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining tags
  md = md.replace(/<[^>]*>/g, '');
  
  // Normalize spacing
  return md.trim();
}

export function convertEditorJsToHtml(data?: EditorData): string {
  if (!data?.blocks?.length) return '';
  return data.blocks.map(block => {
    const blockData = block.data ?? {};
    if (block.type === 'header') {
      const level = blockData.level || 2;
      return `<h${level}>${blockData.text}</h${level}>`;
    }
    if (block.type === 'list') {
      const tag = blockData.style === 'ordered' ? 'ol' : 'ul';
      const items = Array.isArray(blockData.items)
        ? blockData.items.map((item: unknown) => {
            if (typeof item === 'string') return `<li>${item}</li>`;
            if (item && typeof item === 'object' && 'content' in item) {
              return `<li>${String((item as { content?: unknown }).content || '')}</li>`;
            }
            return '<li></li>';
          }).join('')
        : '';
      return `<${tag}>${items}</${tag}>`;
    }
    if (block.type === 'quote') {
      return `<blockquote><p>${blockData.text}</p>${blockData.caption ? `<cite>${blockData.caption}</cite>` : ''}</blockquote>`;
    }
    if (block.type === 'html') {
      return blockData.html || '';
    }
    if (block.type === 'markdown') {
      const mdVal = typeof blockData.markdown === 'string' ? blockData.markdown : '';
      return convertMarkdownToHtml(mdVal);
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

  // Load content into WYSIWYG editor area when entering wysiwyg mode
  useEffect(() => {
    if (activeMode === 'wysiwyg' && wysiwygRef.current) {
      wysiwygRef.current.innerHTML = htmlContent;
    }
  }, [activeMode, htmlContent]);

  // Handler for text input inside contentEditable
  const handleWysiwygInput = () => {
    if (wysiwygRef.current) {
      const newHtml = wysiwygRef.current.innerHTML;
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
          
          <div className={styles.toolbarSeparator} />
          
          <button type="button" className={styles.toolbarBtn} onClick={insertLink} title="Insert Link">
            <LinkIcon size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={insertWikiLink} title="Insert Wiki Link [Tagging]">
            <Link2 size={16} />
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('removeFormat')} title="Clear Formatting">
            <RemoveFormatting size={16} />
          </button>
        </div>
      )}

      {/* Editor viewports */}
      <div className={styles.editorBody}>
        {activeMode === 'wysiwyg' && (
          <div
            ref={wysiwygRef}
            contentEditable
            className={`${styles.viewport} ${styles.wysiwygArea}`}
            onInput={handleWysiwygInput}
            onBlur={handleWysiwygInput}
          />
        )}
        
        {activeMode === 'markdown' && (
          <textarea
            className={styles.textareaInput}
            value={mdContent}
            onChange={handleMdChange}
            placeholder="# Article Title&#10;&#10;Use markdown formatting here..."
          />
        )}

        {activeMode === 'html' && (
          <textarea
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
